import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Radio,
  MapPin,
  Package,
  Calendar,
  Phone,
  Clock,
  X,
  ChevronRight,
  Ticket,
  DollarSign,
  Loader2,
  Video,
  Monitor,
  Sparkles,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useGuestGuard } from '@/components/ui/GuestModal'
import { useToast } from '@/components/ui/Toast'
import CardPack from '@/components/cards/CardPack'
import BookingCallModal from '@/components/modals/BookingCallModal'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Creator, PackInfo, LiveStream } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreatorProfileData {
  creator: Creator
  packs: PackInfo[]
  lives: LiveStream[]
  subscribersCount: number
  isSubscribed: boolean
}

/** Forma do objeto `descricao` retornado pela RPC get_creator_details */
interface GetCreatorDetailsDescricao {
  eu_sou: string | null
  adoro: string | null
  por: string | null
  me_considero: string | null
  pessoas_que: string | null
  cidade: string | null
}

/** Forma do objeto `proxima_live` retornado pela RPC get_creator_details */
interface GetCreatorDetailsProximaLive {
  data: string | null
  hora: string | null
  descricao: string | null
  product_id: string | null
  valor: number | null
}

/** Forma do objeto `imagens[]` retornado pela RPC get_creator_details */
interface ImageRPCRow {
  image_url: string
}

/** Payload completo retornado pela RPC get_creator_details */
interface GetCreatorDetailsRPCResult {
  success: boolean
  message?: string
  nome: string | null
  status: string | null
  foto_perfil: string | null
  data_criacao: string
  live_hoje: boolean | null
  live_horario: string | null
  vende_conteudo: boolean | null
  quantidade_likes: number | null
  faz_encontro_presencial: boolean | null
  valor_1_hora: number | null
  valor_30_min: number | null
  faz_chamada_video: boolean | null
  genero: string | null
  curtiu: boolean | null
  favorito: boolean | null
  descricao: GetCreatorDetailsDescricao | null
  imagens: ImageRPCRow[] | null
  proxima_live: GetCreatorDetailsProximaLive | null
}

/** Linha retornada pela query de packs (com pack_items joinado) */
interface PackRPCRow {
  id: string
  title: string
  description: string | null
  price: number
  cover_image_url: string | null
  stripe_price_id: string | null
  pack_items: { id: string }[] | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLikes(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCreatorProfile(
  profileId: string,
  userId: string | undefined
): Promise<CreatorProfileData> {
  // Fetch tudo em paralelo (RPC + queries não dependem entre si)
  const [rpcRes, packsRes, livesRes, subscribersRes, isSubscribedRes, profileRes, availabilityRes] = await Promise.all([
    supabase.rpc('get_creator_details', {
      p_profile_id: profileId,
      p_client_id: userId ?? '00000000-0000-0000-0000-000000000000',
    }),
    supabase
      .from('packs')
      .select('id, title, description, price, cover_image_url, stripe_price_id, pack_items(id)')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false }),
    supabase
      .from('live_streams')
      .select('*')
      .eq('creator_id', profileId)
      .in('status', ['scheduled', 'live'])
      .order('scheduled_start_time', { ascending: true })
      .limit(5),
    supabase
      .from('creator_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', profileId)
      .eq('status', 'active'),
    userId
      ? supabase
          .from('creator_subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('creator_id', profileId)
          .eq('client_id', userId)
          .eq('status', 'active')
      : Promise.resolve({ count: 0, data: null, error: null }),
    supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single(),
    // Check if creator has any future availability (used to show video call button)
    supabase
      .from('creator_availability')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', profileId)
      .gte('availability_date', new Date().toISOString().split('T')[0]),
  ])

  if (rpcRes.error) {
    console.error('[CreatorProfile] RPC error:', rpcRes.error)
    throw rpcRes.error
  }

  const d = rpcRes.data as GetCreatorDetailsRPCResult
  if (!d?.success) {
    console.error('[CreatorProfile] RPC returned unsuccessful:', d)
    throw new Error(d?.message || 'Creator not found')
  }

  if (packsRes.error) console.error('[CreatorProfile] Packs error:', packsRes.error)
  if (livesRes.error) console.error('[CreatorProfile] Lives error:', livesRes.error)
  if (subscribersRes.error) console.error('[CreatorProfile] Subscribers error:', subscribersRes.error)

  const packs: PackInfo[] = (packsRes.data ?? [] as PackRPCRow[]).map((p: PackRPCRow) => ({
    id: p.id,
    title: p.title,
    price: p.price,
    cover_url: p.cover_image_url ?? null,
    items_count: p.pack_items?.length ?? 0,
    stripe_price_id: p.stripe_price_id ?? null,
    creator_id: profileId,
  }))

  const lives: LiveStream[] = (livesRes.data ?? []) as LiveStream[]
  const subscribersCount = subscribersRes.count ?? 0
  const isSubscribed = (isSubscribedRes.count ?? 0) > 0

  // Mapear descricao da RPC para CreatorDescription
  const desc = d.descricao
  const bio = desc
    ? [desc.eu_sou, desc.adoro, desc.por, desc.me_considero, desc.pessoas_que]
        .filter(Boolean)
        .join(' | ')
    : null

  // Corrigir status online/offline usando is_active real do profiles
  const isActive = profileRes.data?.is_active ?? false
  const resolvedStatus = d.status === 'em live'
    ? 'em live'
    : isActive
      ? 'online'
      : 'offline'

  const creator: Creator = {
    id: profileId,
    nome: d.nome ?? 'Creator',
    status: resolvedStatus,
    foto_perfil: d.foto_perfil ?? null,
    data_criacao: d.data_criacao,
    live_hoje: d.live_hoje ?? false,
    live_horario: d.live_horario ?? null,
    vende_conteudo: d.vende_conteudo ?? false,
    quantidade_likes: d.quantidade_likes ?? 0,
    faz_encontro_presencial: d.faz_encontro_presencial ?? false,
    valor_1_hora: d.valor_1_hora ?? 0,
    valor_30_min: d.valor_30_min ?? 0,
    faz_chamada_video: (d.faz_chamada_video ?? false) || (availabilityRes.count ?? 0) > 0,
    genero: d.genero ?? null,
    descricao: desc
      ? {
          id: profileId,
          profile_id: profileId,
          bio,
          city: desc.cidade ?? null,
          tags: [],
        }
      : null,
    imagens: (d.imagens ?? []).map((img: ImageRPCRow, i: number) => ({
      id: `img-${i}`,
      url: img.image_url,
      type: 'photo' as const,
      is_locked: false,
      created_at: d.data_criacao,
    })),
    documents: [],
    proxima_live: d.proxima_live?.data
      ? {
          id: d.proxima_live.product_id ?? 'live',
          title: d.proxima_live.descricao ?? 'Live',
          scheduled_at: `${d.proxima_live.data}T${d.proxima_live.hora ?? '00:00'}`,
          price: d.proxima_live.valor ?? null,
        }
      : null,
    curtiu: d.curtiu ?? false,
    notificacoes: null,
    favorito: d.favorito ?? false,
    whatsapp: (profileRes.data as Record<string, unknown>)?.whatsapp as string | null ?? null,
  }

  return { creator, packs, lives, subscribersCount: subscribersCount ?? 0, isSubscribed }
}

// ─── Live Info Modal ──────────────────────────────────────────────────────────

function LiveInfoModal({
  live,
  creatorName,
  onClose,
  onEnter,
  isLoading,
}: {
  live: LiveStream
  creatorName: string
  onClose: () => void
  onEnter: () => void
  isLoading?: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="p-1 rounded-full hover:bg-[hsl(var(--secondary))]">
            <X size={20} className="text-[hsl(var(--foreground))]" />
          </button>
        </div>

        <h2 className="text-lg font-bold text-[hsl(var(--foreground))] text-center mb-6">
          {t('creator.liveWith')} {creatorName}
        </h2>

        {/* Info section */}
        <p className="text-sm font-semibold text-[hsl(var(--primary))] mb-3">{t('common.info')}</p>

        <div className="flex flex-col gap-2 mb-6">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-[hsl(var(--muted-foreground))]" />
            <span className="text-sm text-[hsl(var(--muted-foreground))]">
              {formatDate(live.scheduled_start_time)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-[hsl(var(--muted-foreground))]" />
            <span className="text-sm text-[hsl(var(--muted-foreground))]">
              {!live.ticket_price ? t('creator.freeLive') : formatCurrency(live.ticket_price)}
            </span>
          </div>
        </div>

        {live.description && (
          <>
            <p className="text-sm font-semibold text-[hsl(var(--primary))] mb-2">{t('common.description')}</p>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6">{live.description}</p>
          </>
        )}

        <button
          onClick={onEnter}
          disabled={isLoading}
          className="
            w-full flex items-center justify-center gap-2 py-3 rounded-xl
            bg-[hsl(var(--primary))] text-white font-semibold text-sm
            hover:opacity-90 active:scale-[0.98] transition-all duration-150
            disabled:opacity-60 disabled:cursor-not-allowed
          "
        >
          {isLoading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Ticket size={18} />
          )}
          {live.status === 'live' ? t('creator.joinLive') : t('creator.buyTicket')}
        </button>
      </div>
    </div>
  )
}

// ─── Pack Purchase Modal ──────────────────────────────────────────────────────

function PackModal({
  pack,
  onClose,
  onBuy,
  isLoading,
}: {
  pack: PackInfo
  onClose: () => void
  onBuy: (pack: PackInfo) => void
  isLoading?: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="p-1 rounded-full hover:bg-[hsl(var(--secondary))]">
            <X size={20} className="text-[hsl(var(--foreground))]" />
          </button>
        </div>

        <h2 className="text-lg font-bold text-[hsl(var(--foreground))] text-center mb-6">
          {t('creator.contentPurchase')}
        </h2>

        {/* Cover */}
        {pack.cover_url && (
          <div className="w-full aspect-video rounded-xl overflow-hidden mb-4">
            <img src={pack.cover_url} alt={pack.title} className="w-full h-full object-cover" />
          </div>
        )}

        <p className="text-sm font-semibold text-[hsl(var(--primary))] mb-2">{t('common.info')}</p>

        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-3">{pack.title}</p>

        <div className="flex items-center gap-2 mb-6">
          <DollarSign size={18} className="text-[hsl(var(--muted-foreground))]" />
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {formatCurrency(pack.price)}
          </span>
        </div>

        <p className="text-sm font-semibold text-[hsl(var(--primary))] mb-1">{t('creator.content')}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mb-8">
          {pack.items_count} {pack.items_count === 1 ? t('common.item') : t('common.items')} {t('creator.includedInPack')}
        </p>

        <button
          onClick={() => onBuy(pack)}
          disabled={isLoading}
          className="
            w-full flex items-center justify-center gap-2 py-3 rounded-xl
            bg-[hsl(var(--primary))] text-white font-semibold text-sm
            hover:opacity-90 active:scale-[0.98] transition-all duration-150
            disabled:opacity-60 disabled:cursor-not-allowed
          "
        >
          {isLoading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Package size={18} />
          )}
          {t('creator.buyFor')} {formatCurrency(pack.price)}
        </button>
      </div>
    </div>
  )
}

// ─── Meeting Modal ────────────────────────────────────────────────────────────

function MeetingModal({
  whatsapp,
  valor1Hora,
  valor30Min,
  onClose,
}: {
  whatsapp: string | null
  valor1Hora: number
  valor30Min: number
  onClose: () => void
}) {
  const { t } = useTranslation()

  const cleanNumber = whatsapp?.replace(/\D/g, '') ?? ''
  const waLink = cleanNumber ? `https://wa.me/${cleanNumber.startsWith('55') ? cleanNumber : `55${cleanNumber}`}` : null

  const formatWhatsapp = (num: string) => {
    const digits = num.replace(/\D/g, '')
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
    }
    if (digits.length === 13 && digits.startsWith('55')) {
      return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
    }
    return num
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="p-1 rounded-full hover:bg-[hsl(var(--secondary))]">
            <X size={20} className="text-[hsl(var(--foreground))]" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-12 h-12 rounded-full bg-amber-500/12 flex items-center justify-center">
            <MapPin size={24} className="text-amber-400" />
          </div>
          <h2 className="text-lg font-bold text-[hsl(var(--foreground))] text-center">
            {t('creator.meetingTitle')}
          </h2>
        </div>

        {whatsapp ? (
          <>
            <p className="text-sm font-semibold text-[hsl(var(--primary))] mb-3">{t('creator.whatsappLabel')}</p>
            <div className="flex items-center gap-2 mb-4">
              <Phone size={18} className="text-[hsl(var(--muted-foreground))]" />
              <span className="text-sm text-[hsl(var(--muted-foreground))]">
                {formatWhatsapp(whatsapp)}
              </span>
            </div>

            {(valor1Hora > 0 || valor30Min > 0) && (
              <div className="flex flex-col gap-2 mb-6">
                <p className="text-sm font-semibold text-[hsl(var(--primary))]">{t('common.info')}</p>
                {valor1Hora > 0 && (
                  <div className="flex items-center gap-2">
                    <DollarSign size={18} className="text-[hsl(var(--muted-foreground))]" />
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">
                      {formatCurrency(valor1Hora)}{t('creator.perHour')}
                    </span>
                  </div>
                )}
                {valor30Min > 0 && (
                  <div className="flex items-center gap-2">
                    <DollarSign size={18} className="text-[hsl(var(--muted-foreground))]" />
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">
                      {formatCurrency(valor30Min)}{t('creator.per30min')}
                    </span>
                  </div>
                )}
              </div>
            )}

            <a
              href={waLink!}
              target="_blank"
              rel="noopener noreferrer"
              className="
                w-full flex items-center justify-center gap-2 py-3 rounded-xl
                bg-emerald-600 text-white font-semibold text-sm
                hover:opacity-90 active:scale-[0.98] transition-all duration-150
              "
            >
              <MessageCircle size={18} />
              {t('creator.contactWhatsapp')}
            </a>
          </>
        ) : (
          <p className="text-sm text-[hsl(var(--muted-foreground))] text-center">
            {t('creator.noWhatsapp')}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="flex flex-col bg-[hsl(var(--background))] min-h-screen animate-pulse">
      {/* Banner */}
      <div className="h-44 bg-[hsl(var(--secondary))]" />
      {/* Avatar */}
      <div className="px-4 -mt-12 flex justify-between items-end mb-4">
        <div className="w-24 h-24 rounded-full border-4 border-[hsl(var(--background))] bg-[hsl(var(--secondary))]" />
      </div>
      <div className="px-4 space-y-3">
        <div className="h-4 w-1/2 rounded bg-[hsl(var(--secondary))]" />
        <div className="h-3 w-1/3 rounded bg-[hsl(var(--secondary))]" />
        <div className="h-3 w-3/4 rounded bg-[hsl(var(--secondary))]" />
        <div className="h-3 w-2/3 rounded bg-[hsl(var(--secondary))]" />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreatorProfilePage() {
  const { profileId } = useParams<{ profileId: string }>()
  const navigate = useNavigate()
  const { profile: currentUser, session } = useAuthStore()
  const { guardGuestAction } = useGuestGuard()
  const { t } = useTranslation()

  const [selectedLive, setSelectedLive] = useState<LiveStream | null>(null)
  const [selectedPack, setSelectedPack] = useState<PackInfo | null>(null)
  const [showAllPhotos, setShowAllPhotos] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [isBuyingTicket, setIsBuyingTicket] = useState(false)
  const [isBuyingPack, setIsBuyingPack] = useState(false)
  const [showMeetingModal, setShowMeetingModal] = useState(false)
  const [showBookingModal, setShowBookingModal] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['creator-profile', profileId],
    queryFn: () => fetchCreatorProfile(profileId!, currentUser?.id),
    enabled: !!profileId,
    staleTime: 1000 * 60 * 2,
    placeholderData: keepPreviousData,
  })

  // Track profile visit exactly once per mount
  const viewTrackedRef = useRef(false)
  useEffect(() => {
    if (!profileId || isLoading || isError || viewTrackedRef.current) return
    viewTrackedRef.current = true
    supabase
      .from('profile_views')
      .insert({ profile_id: profileId })
      .then(({ error }) => {
        if (error) console.error('[CreatorProfile] Visit tracking error:', error)
      })
  }, [profileId, isLoading, isError])

  const queryClient = useQueryClient()
  const { toast } = useToast()

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id || !profileId) return
      const { error } = await supabase.rpc('toggle_creator_like', {
        p_creator_id: profileId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-profile', profileId] })
    },
  })

  if (isLoading) return <ProfileSkeleton />

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[hsl(var(--background))] px-6 text-center">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {t('creator.notFound')}
        </p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-sm text-[hsl(var(--primary))] underline"
        >
          {t('common.back')}
        </button>
      </div>
    )
  }

  const { creator, packs, lives } = data
  const activeLive = lives.find((l) => l.status === 'live')
  const scheduledLives = lives.filter((l) => l.status === 'scheduled')
  const photos = creator.imagens.filter((img) => img.type === 'photo')
  const displayPhotos = showAllPhotos ? photos : photos.slice(0, 6)

  const handleBuyPack = async (pack: PackInfo) => {
    const userId = currentUser?.id || session?.user?.id
    if (!userId) {
      toast({ title: t('auth.sessionExpired'), type: 'error' })
      return
    }
    setIsBuyingPack(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) {
        toast({ title: t('auth.sessionExpired'), type: 'error' })
        return
      }

      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            creator_id: pack.creator_id,
            stripe_price_id: pack.stripe_price_id,
            product_id: pack.id,
            product_type: 'pack',
            success_url: `${appUrl}/purchases`,
            cancel_url: `${appUrl}/creator/${pack.creator_id}`,
          }),
        }
      )

      const json = await res.json()

      if (!json.success || !json.checkoutUrl) {
        throw new Error(json.error || 'Checkout error')
      }

      window.location.href = json.checkoutUrl
    } catch (err: any) {
      console.error('[CreatorProfile] Pack checkout error:', err)
      toast({ title: err?.message || t('creator.packPurchaseError'), type: 'error' })
    } finally {
      setIsBuyingPack(false)
    }
  }

  const handleEnterLive = async (live: LiveStream) => {
    // Free live → enter directly
    if (!live.ticket_price) {
      setSelectedLive(null)
      navigate(`/lives/${live.id}`)
      return
    }

    const userId = currentUser?.id || session?.user?.id
    if (!userId) {
      toast({ title: t('auth.sessionExpired'), type: 'error' })
      return
    }

    setIsBuyingTicket(true)
    try {
      // Check if user already has a ticket
      const { count } = await supabase
        .from('live_stream_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('live_stream_id', live.id)
        .eq('user_id', userId)
        .eq('status', 'completed')

      if ((count ?? 0) > 0) {
        setSelectedLive(null)
        navigate(`/lives/${live.id}`)
        return
      }

      // Paid live → Stripe checkout
      if (!live.stripe_price_id) {
        toast({ title: t('creator.ticketNotAvailable'), type: 'error' })
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) {
        toast({ title: t('auth.sessionExpired'), type: 'error' })
        return
      }

      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            creator_id: live.creator_id,
            stripe_price_id: live.stripe_price_id,
            product_id: live.id,
            product_type: 'live_ticket',
            success_url: `${appUrl}/lives/${live.id}`,
            cancel_url: `${appUrl}/creator/${live.creator_id}`,
          }),
        }
      )

      const json = await res.json()

      if (!json.success || !json.checkoutUrl) {
        throw new Error(json.error || 'Checkout error')
      }

      window.location.href = json.checkoutUrl
    } catch (err: any) {
      console.error('[CreatorProfile] Ticket purchase error:', err)
      toast({ title: err?.message || t('creator.ticketError'), type: 'error' })
    } finally {
      setIsBuyingTicket(false)
    }
  }

  return (
    <div className="flex flex-col bg-[hsl(var(--background))] min-h-screen pb-20 relative">

      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-safe pt-4">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={18} className="text-white" />
        </button>

      </div>

      {/* ── Banner ──────────────────────────────────────────────────────────── */}
      <div className="relative h-52 bg-gradient-to-br from-[hsl(var(--primary)/0.6)] to-[hsl(var(--primary)/0.2)] overflow-hidden">
        {creator.foto_perfil && (
          <img
            src={creator.foto_perfil}
            alt="banner"
            className="absolute inset-0 w-full h-full object-cover object-top blur-md scale-110 opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[hsl(var(--background)/0.8)]" />

        {/* LIVE badge */}
        {activeLive && (
          <button
            onClick={() => { if (!guardGuestAction()) setSelectedLive(activeLive) }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white text-sm font-bold shadow-lg animate-pulse"
          >
            <Radio size={14} />
            {t('creator.liveNow')}
          </button>
        )}
      </div>

      {/* ── Avatar + action buttons ──────────────────────────────────────────── */}
      <div className="px-4 -mt-14 flex items-end justify-between mb-4 max-w-4xl mx-auto w-full">
        {/* Avatar */}
        <div className="relative">
          <div className="w-24 h-24 rounded-full border-4 border-[hsl(var(--background))] overflow-hidden bg-[hsl(var(--secondary))] shadow-lg">
            {creator.foto_perfil ? (
              <img
                src={creator.foto_perfil}
                alt={creator.nome}
                className="w-full h-full object-cover object-top"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[hsl(var(--secondary))] to-[hsl(var(--border))]">
                <span className="text-3xl font-bold text-[hsl(var(--muted-foreground))]">
                  {creator.nome.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          {/* Online dot */}
          {creator.status === 'online' && (
            <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[hsl(var(--background))]" />
          )}
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2 pb-1">
          {/* Like */}
          <button
            onClick={() => { if (!guardGuestAction()) likeMutation.mutate() }}
            className="w-10 h-10 flex items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
            aria-label={t('creator.like')}
          >
            <Heart
              size={18}
              className={creator.curtiu ? 'fill-rose-500 text-rose-500' : 'text-[hsl(var(--muted-foreground))]'}
            />
          </button>

          {/* Subscribe — hidden until Stripe integration is ready */}
        </div>
      </div>

      {/* ── Profile info ─────────────────────────────────────────────────────── */}
      <div className="px-4 mb-5 max-w-4xl mx-auto w-full">
        <h1 className="text-xl font-bold text-[hsl(var(--foreground))] leading-tight">
          {creator.nome}
        </h1>
        {creator.descricao?.city && (
          <p className="text-xs text-[hsl(var(--primary))] font-medium mt-0.5">
            @{creator.descricao.city}
          </p>
        )}
        {creator.descricao?.bio && (
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 leading-relaxed">
            {creator.descricao.bio}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-5 mt-3">
          <div className="flex items-center gap-1.5">
            <Heart size={14} className="text-rose-400 fill-rose-400" />
            <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {formatLikes(creator.quantidade_likes)}
            </span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">{t('creator.likes')}</span>
          </div>
          {/* Subscribers count — hidden until subscriptions are enabled */}
        </div>
      </div>

      {/* ── Action Buttons (Capabilities) ─────────────────────────────────── */}
      {(creator.faz_chamada_video || creator.faz_encontro_presencial || scheduledLives.length > 0 || activeLive) && (
        <div className="px-4 mb-5 max-w-4xl mx-auto w-full">
          <div className="flex flex-col gap-2.5">
            {/* Chamada Individual — primary CTA (abre modal de booking) */}
            {creator.faz_chamada_video && (
              <button
                onClick={() => { if (!guardGuestAction()) setShowBookingModal(true) }}
                className="flex items-center justify-center gap-3 w-full px-5 py-3.5 rounded-xl border-none"
                style={{ background: 'hsl(var(--primary))', color: '#fff' }}
              >
                <Video size={18} />
                <span className="text-sm font-semibold">{t('creator.videoCall')}</span>
              </button>
            )}

            {/* Encontro Presencial */}
            {creator.faz_encontro_presencial && (
              <button
                onClick={() => { if (!guardGuestAction()) setShowMeetingModal(true) }}
                className="flex items-center justify-center gap-3 w-full px-5 py-3.5 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))]"
              >
                <Sparkles size={18} className="text-[hsl(var(--foreground))]" />
                <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('creator.inPersonMeeting')}</span>
              </button>
            )}

            {/* Ingresso para a Live */}
            {(scheduledLives.length > 0 || activeLive) && (
              <button
                onClick={() => {
                  if (!guardGuestAction()) {
                    if (activeLive) { setSelectedLive(activeLive) }
                    else if (scheduledLives.length > 0) { setSelectedLive(scheduledLives[0]) }
                  }
                }}
                className="flex items-center justify-center gap-3 w-full px-5 py-3.5 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))]"
              >
                <Monitor size={18} className="text-[hsl(var(--foreground))]" />
                <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('creator.liveTicketAction')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Packs section ────────────────────────────────────────────────────── */}
      {packs.length > 0 && (
        <div id="section-packs" className="mb-6 max-w-4xl mx-auto w-full">
          <div className="flex items-center justify-between px-4 mb-3">
            <h2 className="text-base font-bold text-[hsl(var(--foreground))]">{t('creator.packs')}</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-none px-4 pb-1 md:grid md:grid-cols-3 md:overflow-x-visible">
            {packs.map((pack) => (
              <CardPack
                key={pack.id}
                pack={pack}
                onView={(p) => { if (!guardGuestAction()) setSelectedPack(p) }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Upcoming events ──────────────────────────────────────────────────── */}
      {(scheduledLives.length > 0 || activeLive) && (
        <div className="px-4 mb-6 max-w-4xl mx-auto w-full">
          <h2 className="text-base font-bold text-[hsl(var(--foreground))] mb-3">
            {activeLive ? t('creator.liveNowLabel') : t('creator.upcomingEvents')}
          </h2>
          <div className="flex flex-col gap-2">
            {activeLive && (
              <button
                onClick={() => { if (!guardGuestAction()) setSelectedLive(activeLive) }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-600/10 border border-red-600/20"
              >
                <div className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center shrink-0">
                  <Radio size={16} className="text-white animate-pulse" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-red-500 tracking-widest">{t('creator.liveTag')}</span>
                  </div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">{activeLive.title}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {!activeLive.ticket_price ? t('creator.freeLive') : formatCurrency(activeLive.ticket_price)}
                  </p>
                </div>
                <ChevronRight size={16} className="text-[hsl(var(--muted-foreground))] shrink-0" />
              </button>
            )}

            {scheduledLives.map((live) => (
              <button
                key={live.id}
                onClick={() => { if (!guardGuestAction()) setSelectedLive(live) }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))]"
              >
                <div className="w-9 h-9 rounded-full bg-[hsl(var(--primary)/0.12)] flex items-center justify-center shrink-0">
                  <Calendar size={16} className="text-[hsl(var(--primary))]" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">{live.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Clock size={11} className="text-[hsl(var(--muted-foreground))]" />
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      {formatDate(live.scheduled_start_time)}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-semibold text-[hsl(var(--primary))]">
                    {!live.ticket_price ? t('creator.freeTag') : formatCurrency(live.ticket_price)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Photos section ───────────────────────────────────────────────────── */}
      {photos.length > 0 && (
        <div className="px-4 mb-6 max-w-4xl mx-auto w-full">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-[hsl(var(--foreground))]">{t('common.photos')}</h2>
            {photos.length > 6 && (
              <button
                onClick={() => setShowAllPhotos((p) => !p)}
                className="text-xs text-[hsl(var(--primary))] font-medium"
              >
                {showAllPhotos ? t('common.seeLess') : `${t('common.seeMore')} (${photos.length})`}
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1 rounded-xl overflow-hidden">
            {displayPhotos.map((img, i) => (
              <div
                key={img.id}
                className="relative aspect-square overflow-hidden bg-[hsl(var(--secondary))]"
              >
                {img.is_locked ? (
                  <>
                    <img
                      src={img.url}
                      alt={`foto ${i + 1}`}
                      className="w-full h-full object-cover blur-sm scale-105 opacity-60"
                    />
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-1">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                    </div>
                  </>
                ) : (
                  <img
                    src={img.url}
                    alt={`foto ${i + 1}`}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* About section — hidden (bio already shown below the name) */}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {selectedLive && (
        <LiveInfoModal
          live={selectedLive}
          creatorName={creator.nome}
          onClose={() => setSelectedLive(null)}
          onEnter={() => handleEnterLive(selectedLive)}
          isLoading={isBuyingTicket}
        />
      )}

      {selectedPack && (
        <PackModal
          pack={selectedPack}
          onClose={() => !isBuyingPack && setSelectedPack(null)}
          onBuy={handleBuyPack}
          isLoading={isBuyingPack}
        />
      )}

      {showMeetingModal && (
        <MeetingModal
          whatsapp={creator.whatsapp}
          valor1Hora={creator.valor_1_hora}
          valor30Min={creator.valor_30_min}
          onClose={() => setShowMeetingModal(false)}
        />
      )}

      <BookingCallModal
        isOpen={showBookingModal}
        onClose={() => setShowBookingModal(false)}
        creatorId={creator.id}
        creatorName={creator.nome}
        avatarUrl={creator.foto_perfil}
      />

      {/* Close menu overlay */}
      {showMenu && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setShowMenu(false)}
        />
      )}
    </div>
  )
}
