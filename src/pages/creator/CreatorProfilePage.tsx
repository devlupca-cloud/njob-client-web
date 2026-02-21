import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  MoreVertical,
  Heart,
  MessageCircle,
  Radio,
  Video,
  MapPin,
  Package,
  Calendar,
  Phone,
  Clock,
  Star,
  X,
  ChevronRight,
  Users,
  Ticket,
  DollarSign,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { APP_URL } from '@/lib/config'
import { useAuthStore } from '@/store/authStore'
import CardPack from '@/components/cards/CardPack'
import type { Creator, PackInfo, LiveStream } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreatorProfileData {
  creator: Creator
  packs: PackInfo[]
  lives: LiveStream[]
  subscribersCount: number
  isSubscribed: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatLikes(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCreatorProfile(
  profileId: string,
  userId: string | undefined
): Promise<CreatorProfileData> {
  // Fetch creator details via RPC (retorna curtiu/favorito com contexto do usuario)
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_creator_details', {
    p_profile_id: profileId,
    p_client_id: userId ?? '00000000-0000-0000-0000-000000000000',
  })

  if (rpcError) {
    console.error('[CreatorProfile] RPC error:', rpcError)
    throw rpcError
  }

  const d = rpcData as any
  if (!d?.success) {
    console.error('[CreatorProfile] RPC returned unsuccessful:', d)
    throw new Error(d?.message || 'Creator not found')
  }

  // Fetch remaining data in parallel
  const [packsRes, livesRes, subscribersRes, isSubscribedRes] = await Promise.all([
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
  ])

  if (packsRes.error) console.error('[CreatorProfile] Packs error:', packsRes.error)
  if (livesRes.error) console.error('[CreatorProfile] Lives error:', livesRes.error)
  if (subscribersRes.error) console.error('[CreatorProfile] Subscribers error:', subscribersRes.error)

  const packs: PackInfo[] = (packsRes.data ?? []).map((p: any) => ({
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
  const isSubscribed = ((isSubscribedRes as any).count ?? 0) > 0

  // Mapear descricao da RPC para CreatorDescription
  const desc = d.descricao
  const bio = desc
    ? [desc.eu_sou, desc.adoro, desc.por, desc.me_considero, desc.pessoas_que]
        .filter(Boolean)
        .join(' | ')
    : null

  const creator: Creator = {
    id: profileId,
    nome: d.nome ?? 'Creator',
    status: d.status ?? null,
    foto_perfil: d.foto_perfil ?? null,
    data_criacao: d.data_criacao,
    live_hoje: d.live_hoje ?? false,
    live_horario: d.live_horario ?? null,
    vende_conteudo: d.vende_conteudo ?? false,
    quantidade_likes: d.quantidade_likes ?? 0,
    faz_encontro_presencial: d.faz_encontro_presencial ?? false,
    valor_1_hora: d.valor_1_hora ?? 0,
    valor_30_min: d.valor_30_min ?? 0,
    faz_chamada_video: d.faz_chamada_video ?? false,
    genero: d.genero ?? null,
    descricao: desc
      ? {
          id: profileId,
          profile_id: profileId,
          bio,
          category: desc.cidade ?? null,
          tags: [],
        }
      : null,
    imagens: (d.imagens ?? []).map((img: any, i: number) => ({
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
  }

  return { creator, packs, lives, subscribersCount: subscribersCount ?? 0, isSubscribed }
}

// ─── Live Info Modal ──────────────────────────────────────────────────────────

function LiveInfoModal({
  live,
  creatorName,
  onClose,
  onEnter,
}: {
  live: LiveStream
  creatorName: string
  onClose: () => void
  onEnter: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="mx-auto w-10 h-1 rounded-full bg-[hsl(var(--border))] mb-4" />

        {/* Close */}
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="p-1 rounded-full hover:bg-[hsl(var(--secondary))]">
            <X size={20} className="text-[hsl(var(--foreground))]" />
          </button>
        </div>

        <h2 className="text-lg font-bold text-[hsl(var(--foreground))] text-center mb-6">
          Live com {creatorName}
        </h2>

        {/* Info section */}
        <p className="text-sm font-semibold text-[hsl(var(--primary))] mb-3">Informações</p>

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
              {!live.ticket_price ? 'Gratuita' : formatPrice(live.ticket_price)}
            </span>
          </div>
        </div>

        {live.description && (
          <>
            <p className="text-sm font-semibold text-[hsl(var(--primary))] mb-2">Descrição</p>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6">{live.description}</p>
          </>
        )}

        <button
          onClick={onEnter}
          className="
            w-full flex items-center justify-center gap-2 py-3 rounded-xl
            bg-[hsl(var(--primary))] text-white font-semibold text-sm
            hover:opacity-90 active:scale-[0.98] transition-all duration-150
          "
        >
          <Ticket size={18} />
          {live.status === 'live' ? 'Entrar na live' : 'Comprar ingresso'}
        </button>
      </div>
    </div>
  )
}

// ─── Call Modal ───────────────────────────────────────────────────────────────

function CallModal({
  onClose,
  onCall,
}: {
  onClose: () => void
  onCall: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-[hsl(var(--border))] mb-4" />

        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="p-1 rounded-full hover:bg-[hsl(var(--secondary))]">
            <X size={20} className="text-[hsl(var(--foreground))]" />
          </button>
        </div>

        <h2 className="text-lg font-bold text-[hsl(var(--foreground))] text-center mb-4">
          Chamada individual
        </h2>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-4">
          <Phone size={16} className="text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-400">
            O prestador de serviço tem o direito de recusar a chamada caso o cliente não esteja de acordo com os termos de uso.
          </p>
        </div>

        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-8">
          Esse usuário está online, e você pode iniciar uma chamada de vídeo agora.
        </p>

        <button
          onClick={onCall}
          className="
            w-full flex items-center justify-center gap-2 py-3 rounded-xl
            bg-emerald-600 text-white font-semibold text-sm
            hover:opacity-90 active:scale-[0.98] transition-all duration-150
          "
        >
          <Video size={18} />
          Chamar agora
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
}: {
  pack: PackInfo
  onClose: () => void
  onBuy: (pack: PackInfo) => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-[hsl(var(--border))] mb-4" />

        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="p-1 rounded-full hover:bg-[hsl(var(--secondary))]">
            <X size={20} className="text-[hsl(var(--foreground))]" />
          </button>
        </div>

        <h2 className="text-lg font-bold text-[hsl(var(--foreground))] text-center mb-6">
          Compra de Conteúdo
        </h2>

        {/* Cover */}
        {pack.cover_url && (
          <div className="w-full aspect-video rounded-xl overflow-hidden mb-4">
            <img src={pack.cover_url} alt={pack.title} className="w-full h-full object-cover" />
          </div>
        )}

        <p className="text-sm font-semibold text-[hsl(var(--primary))] mb-2">Informações</p>

        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-3">{pack.title}</p>

        <div className="flex items-center gap-2 mb-6">
          <DollarSign size={18} className="text-[hsl(var(--muted-foreground))]" />
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {formatPrice(pack.price)}
          </span>
        </div>

        <p className="text-sm font-semibold text-[hsl(var(--primary))] mb-1">Conteúdo</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mb-8">
          {pack.items_count} {pack.items_count === 1 ? 'item' : 'itens'} incluídos neste pacote
        </p>

        <button
          onClick={() => onBuy(pack)}
          className="
            w-full flex items-center justify-center gap-2 py-3 rounded-xl
            bg-[hsl(var(--primary))] text-white font-semibold text-sm
            hover:opacity-90 active:scale-[0.98] transition-all duration-150
          "
        >
          <Package size={18} />
          Comprar por {formatPrice(pack.price)}
        </button>
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
  const { profile: currentUser } = useAuthStore()

  const [selectedLive, setSelectedLive] = useState<LiveStream | null>(null)
  const [showCallModal, setShowCallModal] = useState(false)
  const [selectedPack, setSelectedPack] = useState<PackInfo | null>(null)
  const [showAllPhotos, setShowAllPhotos] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['creator-profile', profileId, currentUser?.id],
    queryFn: () => fetchCreatorProfile(profileId!, currentUser?.id),
    enabled: !!profileId,
    staleTime: 1000 * 60 * 2,
  })

  const queryClient = useQueryClient()

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

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id || !profileId) return

      // Fetch the first active subscription plan to get the Stripe price ID
      const { data: plans } = await supabase
        .from('subscription_plans')
        .select('stripe_price_id')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true })
        .limit(1)

      const priceId = plans?.[0]?.stripe_price_id
      if (!priceId) throw new Error('Nenhum plano de assinatura disponível')

      const successUrl = `${APP_URL}/creator/${profileId}`
      const cancelUrl = `${APP_URL}/creator/${profileId}`
      console.log('[Subscribe] APP_URL:', APP_URL)
      console.log('[Subscribe] success_url:', successUrl)
      console.log('[Subscribe] price_id:', priceId)

      const { data, error } = await supabase.functions.invoke('create-checkout-subscription-stripe', {
        body: {
          price_id: priceId,
          creator_id: profileId,
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
      })

      console.log('[Subscribe] Edge Function response:', JSON.stringify(data))
      console.log('[Subscribe] Edge Function error:', error)

      if (error) throw error
      if (data?.checkout_url || data?.url) {
        const redirectUrl = data.checkout_url || data.url
        console.log('[Subscribe] Redirecting to:', redirectUrl)
        window.location.href = redirectUrl
      }
    },
  })

  if (isLoading) return <ProfileSkeleton />

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[hsl(var(--background))] px-6 text-center">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Não foi possível carregar o perfil. Tente novamente.
        </p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-sm text-[hsl(var(--primary))] underline"
        >
          Voltar
        </button>
      </div>
    )
  }

  const { creator, packs, lives, subscribersCount, isSubscribed } = data
  const activeLive = lives.find((l) => l.status === 'live')
  const scheduledLives = lives.filter((l) => l.status === 'scheduled')
  const photos = creator.imagens.filter((img) => img.type === 'photo')
  const displayPhotos = showAllPhotos ? photos : photos.slice(0, 6)

  const handleSendMessage = async () => {
    if (!currentUser?.id) return

    // Busca conversa existente via view
    const { data: existing } = await supabase
      .from('vw_creator_conversations')
      .select('conversation_id')
      .eq('profile_id', currentUser.id)
      .eq('peer_id', creator.id)
      .limit(1)
      .maybeSingle()

    if (existing?.conversation_id) {
      navigate(`/chat/${existing.conversation_id}`)
      return
    }

    // Cria nova conversa
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({ is_group: false })
      .select('id')
      .single()

    if (convError || !newConv) {
      console.error('Erro ao criar conversa:', convError)
      return
    }

    // Adiciona participantes
    const { error: partError } = await supabase
      .from('conversation_participants')
      .insert([
        { conversation_id: newConv.id, profile_id: currentUser.id },
        { conversation_id: newConv.id, profile_id: creator.id },
      ])

    if (partError) {
      console.error('Erro ao adicionar participantes:', partError)
      return
    }

    navigate(`/chat/${newConv.id}`)
  }

  const handleViewContent = () => {
    navigate(`/creator/${creator.id}/content`)
  }

  const handleBuyPack = async (pack: PackInfo) => {
    setSelectedPack(null)
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
        body: {
          creator_id: pack.creator_id,
          product_id: pack.id,
          stripe_price_id: pack.stripe_price_id,
          product_type: 'pack',
          success_url: `${APP_URL}/purchases`,
          cancel_url: `${APP_URL}/creator/${pack.creator_id}`,
        },
      })
      if (error) throw error
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl
      }
    } catch (err) {
      console.error('Erro ao criar checkout do pack:', err)
    }
  }

  const handleEnterLive = async (live: LiveStream) => {
    setSelectedLive(null)
    if (!live.ticket_price || live.status === 'live') {
      navigate(`/lives/${live.id}`)
      return
    }
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
        body: {
          creator_id: live.creator_id,
          product_id: live.id,
          stripe_price_id: live.stripe_price_id,
          product_type: 'live_ticket',
          success_url: `${APP_URL}/lives/${live.id}`,
          cancel_url: `${APP_URL}/creator/${live.creator_id}`,
        },
      })
      if (error) throw error
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl
      }
    } catch (err) {
      console.error('Erro ao criar checkout da live:', err)
    }
  }

  const handleCall = () => {
    setShowCallModal(false)
    navigate(`/calls/new?creatorId=${creator.id}`)
  }

  return (
    <div className="flex flex-col bg-[hsl(var(--background))] min-h-screen pb-20 relative">

      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-safe pt-4">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} className="text-white" />
        </button>

        <button
          onClick={() => setShowMenu((p) => !p)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
          aria-label="Menu"
        >
          <MoreVertical size={18} className="text-white" />
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <div
            className="absolute top-14 right-4 w-44 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-xl overflow-hidden z-30"
            onMouseLeave={() => setShowMenu(false)}
          >
            <button
              className="w-full text-left px-4 py-3 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
              onClick={() => { setShowMenu(false) }}
            >
              Denunciar
            </button>
            <button
              className="w-full text-left px-4 py-3 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
              onClick={() => { setShowMenu(false) }}
            >
              Bloquear
            </button>
            <button
              className="w-full text-left px-4 py-3 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
              onClick={() => { setShowMenu(false) }}
            >
              Compartilhar perfil
            </button>
          </div>
        )}
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
            onClick={() => setSelectedLive(activeLive)}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white text-sm font-bold shadow-lg animate-pulse"
          >
            <Radio size={14} />
            AO VIVO — Entrar
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
            onClick={() => likeMutation.mutate()}
            className="w-10 h-10 flex items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
            aria-label="Curtir"
          >
            <Heart
              size={18}
              className={creator.curtiu ? 'fill-rose-500 text-rose-500' : 'text-[hsl(var(--muted-foreground))]'}
            />
          </button>

          {/* Message */}
          <button
            onClick={handleSendMessage}
            className="w-10 h-10 flex items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
            aria-label="Enviar mensagem"
          >
            <MessageCircle size={18} className="text-[hsl(var(--muted-foreground))]" />
          </button>

          {/* Subscribe */}
          <button
            onClick={() => !isSubscribed && subscribeMutation.mutate()}
            disabled={subscribeMutation.isPending}
            className={`
              flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold
              transition-all duration-150 active:scale-[0.97]
              ${isSubscribed
                ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]'
                : 'bg-[hsl(var(--primary))] text-white hover:opacity-90'
              }
            `}
          >
            <Star size={15} />
            {isSubscribed ? 'Assinando' : 'Assinar'}
          </button>
        </div>
      </div>

      {/* ── Profile info ─────────────────────────────────────────────────────── */}
      <div className="px-4 mb-5 max-w-4xl mx-auto w-full">
        <h1 className="text-xl font-bold text-[hsl(var(--foreground))] leading-tight">
          {creator.nome}
        </h1>
        {creator.descricao?.category && (
          <p className="text-xs text-[hsl(var(--primary))] font-medium mt-0.5">
            @{creator.descricao.category}
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
            <span className="text-xs text-[hsl(var(--muted-foreground))]">curtidas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-[hsl(var(--primary))]" />
            <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {subscribersCount}
            </span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">assinantes</span>
          </div>
        </div>
      </div>

      {/* ── Capabilities ─────────────────────────────────────────────────────── */}
      {(creator.vende_conteudo || creator.faz_chamada_video || creator.faz_encontro_presencial) && (
        <div className="px-4 mb-5 max-w-4xl mx-auto w-full">
          <div className="flex flex-col gap-2">
            {creator.vende_conteudo && (
              <button
                onClick={handleViewContent}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[hsl(var(--primary)/0.12)] flex items-center justify-center">
                    <Package size={18} className="text-[hsl(var(--primary))]" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">Vende conteúdo</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Fotos, vídeos e áudios exclusivos</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[hsl(var(--muted-foreground))]" />
              </button>
            )}

            {creator.faz_chamada_video && (
              <button
                onClick={() => setShowCallModal(true)}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/12 flex items-center justify-center">
                    <Video size={18} className="text-emerald-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">Chamada de vídeo</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {creator.valor_30_min > 0 ? `A partir de ${formatPrice(creator.valor_30_min)}/30min` : 'Disponível agora'}
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[hsl(var(--muted-foreground))]" />
              </button>
            )}

            {creator.faz_encontro_presencial && (
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-500/12 flex items-center justify-center">
                    <MapPin size={18} className="text-amber-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">Encontro presencial</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {creator.valor_1_hora > 0 ? `${formatPrice(creator.valor_1_hora)}/hora` : 'Sob consulta'}
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[hsl(var(--muted-foreground))]" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Packs section ────────────────────────────────────────────────────── */}
      {packs.length > 0 && (
        <div className="mb-6 max-w-4xl mx-auto w-full">
          <div className="flex items-center justify-between px-4 mb-3">
            <h2 className="text-base font-bold text-[hsl(var(--foreground))]">Pacotes</h2>
            {packs.length > 3 && (
              <button
                onClick={handleViewContent}
                className="text-xs text-[hsl(var(--primary))] font-medium"
              >
                Ver todos
              </button>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-none px-4 pb-1 md:grid md:grid-cols-3 md:overflow-x-visible">
            {packs.map((pack) => (
              <CardPack
                key={pack.id}
                pack={pack}
                onView={(p) => setSelectedPack(p)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Upcoming events ──────────────────────────────────────────────────── */}
      {(scheduledLives.length > 0 || activeLive) && (
        <div className="px-4 mb-6 max-w-4xl mx-auto w-full">
          <h2 className="text-base font-bold text-[hsl(var(--foreground))] mb-3">
            {activeLive ? 'Ao vivo agora' : 'Próximos eventos'}
          </h2>
          <div className="flex flex-col gap-2">
            {activeLive && (
              <button
                onClick={() => setSelectedLive(activeLive)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-600/10 border border-red-600/20"
              >
                <div className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center shrink-0">
                  <Radio size={16} className="text-white animate-pulse" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-red-500 tracking-widest">AO VIVO</span>
                  </div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">{activeLive.title}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {!activeLive.ticket_price ? 'Gratuita' : formatPrice(activeLive.ticket_price)}
                  </p>
                </div>
                <ChevronRight size={16} className="text-[hsl(var(--muted-foreground))] shrink-0" />
              </button>
            )}

            {scheduledLives.map((live) => (
              <button
                key={live.id}
                onClick={() => setSelectedLive(live)}
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
                    {!live.ticket_price ? 'Gratis' : formatPrice(live.ticket_price)}
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
            <h2 className="text-base font-bold text-[hsl(var(--foreground))]">Fotos</h2>
            {photos.length > 6 && (
              <button
                onClick={() => setShowAllPhotos((p) => !p)}
                className="text-xs text-[hsl(var(--primary))] font-medium"
              >
                {showAllPhotos ? 'Ver menos' : `Ver mais (${photos.length})`}
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
          {creator.vende_conteudo && (
            <button
              onClick={handleViewContent}
              className="mt-2 w-full py-2.5 rounded-xl border border-[hsl(var(--border))] text-sm font-medium text-[hsl(var(--primary))] hover:bg-[hsl(var(--secondary))] transition-colors"
            >
              Ver todo o conteúdo
            </button>
          )}
        </div>
      )}

      {/* ── About section ───────────────────────────────────────────────────── */}
      {(creator.descricao?.bio || (creator.descricao?.tags && creator.descricao.tags.length > 0)) && (
        <div className="px-4 mb-6 max-w-4xl mx-auto w-full">
          <h2 className="text-base font-bold text-[hsl(var(--foreground))] mb-3">Sobre</h2>
          <div className="p-4 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))]">
            {creator.descricao?.bio && (
              <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mb-3">
                {creator.descricao.bio}
              </p>
            )}
            {creator.descricao?.tags && creator.descricao.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {creator.descricao.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-full text-xs font-medium bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {selectedLive && (
        <LiveInfoModal
          live={selectedLive}
          creatorName={creator.nome}
          onClose={() => setSelectedLive(null)}
          onEnter={() => handleEnterLive(selectedLive)}
        />
      )}

      {showCallModal && (
        <CallModal
          onClose={() => setShowCallModal(false)}
          onCall={handleCall}
        />
      )}

      {selectedPack && (
        <PackModal
          pack={selectedPack}
          onClose={() => setSelectedPack(null)}
          onBuy={handleBuyPack}
        />
      )}

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
