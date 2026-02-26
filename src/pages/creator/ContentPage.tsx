import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  ArrowLeft,
  Image as ImageIcon,
  Video,
  Mic,
  Lock,
  Play,
  X,
  Package,
  ChevronRight,
  Loader2,
  Check,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/Toast'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'packs' | 'fotos' | 'videos'

interface PackCard {
  id: string
  title: string
  price: number
  cover_url: string | null
  items_count: number
  items: PackMediaItem[]
  stripe_price_id: string | null
  creator_id: string
  is_purchased: boolean
}

interface PackMediaItem {
  id: string
  url: string | null
  type: 'image' | 'video' | 'audio'
  title: string
  pack_id: string
  pack_title: string
  pack_price: number
  is_locked: boolean
}

interface ProfilePhoto {
  id: string
  url: string
}

interface ContentData {
  creatorName: string
  packs: PackCard[]
  profilePhotos: ProfilePhoto[]
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCreatorContent(
  profileId: string,
  userId: string | undefined
): Promise<ContentData> {
  const [profileRes, packsRes, imagesRes, purchasesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', profileId)
      .single(),
    supabase
      .from('packs')
      .select('id, title, price, cover_image_url, stripe_price_id, pack_items(*)')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false }),
    supabase
      .from('profile_images')
      .select('id, image_url')
      .eq('profile_id', profileId)
      .order('index', { ascending: true }),
    userId
      ? supabase
          .from('pack_purchases')
          .select('pack_id')
          .eq('user_id', userId)
          .eq('status', 'completed')
      : Promise.resolve({ data: [] as { pack_id: string }[], error: null }),
  ])

  if (packsRes.error) throw packsRes.error

  const creatorName =
    profileRes.data?.full_name ?? profileRes.data?.username ?? 'Creator'

  const purchasedIds = new Set(
    (purchasesRes.data ?? []).map((p: any) => p.pack_id)
  )

  const mapType = (t: string): 'image' | 'video' | 'audio' => {
    if (t === 'photo') return 'image'
    if (t === 'video') return 'video'
    return 'audio'
  }

  const packs: PackCard[] = (packsRes.data ?? []).map((p: any) => {
    const rawItems = p.pack_items ?? []
    const isPurchased = purchasedIds.has(p.id)
    return {
      id: p.id,
      title: p.title,
      price: p.price,
      cover_url: p.cover_image_url ?? null,
      items_count: rawItems.length,
      stripe_price_id: p.stripe_price_id ?? null,
      creator_id: profileId,
      is_purchased: isPurchased,
      items: rawItems.map((pi: any): PackMediaItem => ({
        id: pi.id,
        url: pi.file_url ?? pi.thumbnail_url ?? null,
        type: mapType(pi.item_type),
        title: pi.file_name ?? '',
        pack_id: p.id,
        pack_title: p.title,
        pack_price: p.price,
        is_locked: !isPurchased,
      })),
    }
  })

  const profilePhotos: ProfilePhoto[] = (imagesRes.data ?? []).map(
    (img: any) => ({
      id: img.id,
      url: img.image_url,
    })
  )

  return { creatorName, packs, profilePhotos }
}

// ─── Tab pill ─────────────────────────────────────────────────────────────────

function TabPill({
  label,
  icon,
  count,
  active,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150
        ${
          active
            ? 'bg-[hsl(var(--primary))] text-white shadow-[0_0_16px_hsl(var(--primary)/0.25)]'
            : 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.3)] hover:text-[hsl(var(--foreground))]'
        }
      `}
    >
      {icon}
      {label}
      <span className={`text-[10px] ${active ? 'text-white/70' : 'text-[hsl(var(--muted-foreground)/0.6)]'}`}>
        {count}
      </span>
    </button>
  )
}

// ─── Pack card (inline) ──────────────────────────────────────────────────────

function PackCardInline({
  pack,
  onClick,
}: {
  pack: PackCard
  onClick: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      className="
        flex-shrink-0 w-44 rounded-xl overflow-hidden cursor-pointer
        border border-[hsl(var(--border))]
        bg-[hsl(var(--card))]
        transition-all duration-200 active:scale-[0.97]
        hover:border-[hsl(var(--primary)/0.4)]
        text-left select-none
      "
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[hsl(var(--secondary))]">
        {pack.cover_url ? (
          <img
            src={pack.cover_url}
            alt={pack.title}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[hsl(var(--primary)/0.15)] to-[hsl(var(--secondary))]">
            <Package size={28} className="text-[hsl(var(--primary)/0.5)]" />
          </div>
        )}
        <div className="absolute bottom-2 right-2">
          {pack.is_purchased ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white shadow-md">
              <Check size={10} />
              {t('contentPage.purchased')}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[hsl(var(--primary))] text-white shadow-md">
              {formatCurrency(pack.price)}
            </span>
          )}
        </div>
      </div>
      <div className="p-2.5 flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-[hsl(var(--foreground))] leading-tight line-clamp-1">
          {pack.title}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
            {pack.items_count} {pack.items_count === 1 ? 'item' : 'itens'}
          </span>
          <ChevronRight size={12} className="text-[hsl(var(--primary))]" />
        </div>
      </div>
    </button>
  )
}

// ─── Photo thumbnail ─────────────────────────────────────────────────────────

function PhotoThumb({
  url,
  alt,
  onClick,
}: {
  url: string
  alt: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="relative aspect-square overflow-hidden bg-[hsl(var(--secondary))] rounded-md group"
    >
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
      />
    </button>
  )
}

// ─── Pack media thumbnail ────────────────────────────────────────────────────

function MediaThumb({
  item,
  onClick,
}: {
  item: PackMediaItem
  onClick: () => void
}) {
  const isVideo = item.type === 'video'
  const isAudio = item.type === 'audio'

  return (
    <button
      onClick={onClick}
      className="relative aspect-square overflow-hidden bg-[hsl(var(--secondary))] rounded-md group"
    >
      {isAudio ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-purple-900/40 to-purple-600/20">
          <Mic size={24} className="text-purple-400" />
          {!item.is_locked && (
            <span className="text-[10px] text-purple-300 font-medium px-2 text-center line-clamp-2">
              {item.title}
            </span>
          )}
        </div>
      ) : item.url ? (
        isVideo ? (
          <div className="relative w-full h-full bg-black">
            <video
              src={item.url}
              className={`w-full h-full object-cover ${item.is_locked ? 'blur-lg scale-110 opacity-50' : ''}`}
              muted
              preload="metadata"
            />
            {!item.is_locked && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
                  <Play size={18} className="text-white ml-0.5" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <img
            src={item.url}
            alt={item.title}
            loading="lazy"
            className={`w-full h-full object-cover transition-transform group-hover:scale-105 duration-300 ${item.is_locked ? 'blur-lg scale-110 opacity-50' : ''}`}
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon size={24} className="text-[hsl(var(--muted-foreground))]" />
        </div>
      )}

      {/* Locked overlay */}
      {item.is_locked && (
        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-1.5">
          <Lock size={20} className="text-white/90" />
          <span className="text-[10px] font-bold text-white bg-black/30 px-2 py-0.5 rounded-full">
            {formatCurrency(item.pack_price)}
          </span>
        </div>
      )}

      {/* Type badge */}
      {!item.is_locked && (isVideo || isAudio) && (
        <div className="absolute top-1.5 right-1.5">
          {isVideo && (
            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
              <Play size={10} className="text-white ml-0.5" />
            </span>
          )}
          {isAudio && (
            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-purple-600/80 backdrop-blur-sm">
              <Mic size={10} className="text-white" />
            </span>
          )}
        </div>
      )}
    </button>
  )
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  url,
  title,
  type,
  onClose,
}: {
  url: string
  title?: string
  type: 'image' | 'video' | 'audio'
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-end px-4 py-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X size={18} className="text-white" />
        </button>
      </div>

      <div
        className="flex-1 flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {type === 'image' && (
          <img
            src={url}
            alt={title ?? ''}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        )}
        {type === 'video' && (
          <video
            src={url}
            controls
            autoPlay
            className="max-w-full max-h-full rounded-lg"
          />
        )}
        {type === 'audio' && (
          <div className="flex flex-col items-center gap-6 w-full max-w-xs">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-600 to-purple-900 flex items-center justify-center shadow-2xl">
              <Mic size={48} className="text-white" />
            </div>
            {title && <p className="text-white font-semibold text-center">{title}</p>}
            <audio src={url} controls className="w-full" />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Pack detail modal ───────────────────────────────────────────────────────

function PackDetailModal({
  pack,
  onClose,
  onItemClick,
  onBuy,
  isBuying,
}: {
  pack: PackCard
  onClose: () => void
  onItemClick: (item: PackMediaItem) => void
  onBuy: (pack: PackCard) => void
  isBuying?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] rounded-t-2xl bg-[hsl(var(--background))] border-t border-[hsl(var(--border))] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="pt-3 pb-2 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-[hsl(var(--border))]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-[hsl(var(--border))]">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-[hsl(var(--foreground))] truncate">
              {pack.title}
            </h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {pack.items_count} {pack.items_count === 1 ? 'item' : 'itens'} &middot; {formatCurrency(pack.price)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[hsl(var(--secondary))] transition-colors"
          >
            <X size={18} className="text-[hsl(var(--foreground))]" />
          </button>
        </div>

        {/* Items grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {pack.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package size={32} className="text-[hsl(var(--muted-foreground))] mb-2" />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {t('contentPage.emptyAll')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {pack.items.map((item) => (
                <MediaThumb
                  key={item.id}
                  item={item}
                  onClick={() => onItemClick(item)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Buy button — only for unpurchased packs */}
        {!pack.is_purchased && (
          <div className="p-4 border-t border-[hsl(var(--border))]">
            <button
              onClick={() => onBuy(pack)}
              disabled={isBuying}
              className="
                w-full flex items-center justify-center gap-2 py-3 rounded-xl
                bg-[hsl(var(--primary))] text-white font-semibold text-sm
                hover:opacity-90 active:scale-[0.98] transition-all duration-150
                disabled:opacity-60 disabled:cursor-not-allowed
              "
            >
              {isBuying ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Package size={18} />
              )}
              {t('creator.buyFor')} {formatCurrency(pack.price)}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ContentSkeleton() {
  return (
    <div className="animate-pulse space-y-6 px-4 pt-4">
      {/* Pack skeleton */}
      <div>
        <div className="h-4 w-24 rounded bg-[hsl(var(--secondary))] mb-3" />
        <div className="flex gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-44 shrink-0 rounded-xl overflow-hidden border border-[hsl(var(--border))]">
              <div className="aspect-[4/3] bg-[hsl(var(--secondary))]" />
              <div className="p-2.5 space-y-2">
                <div className="h-3 w-3/4 rounded bg-[hsl(var(--secondary))]" />
                <div className="h-2 w-1/2 rounded bg-[hsl(var(--secondary))]" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Photo grid skeleton */}
      <div>
        <div className="h-4 w-20 rounded bg-[hsl(var(--secondary))] mb-3" />
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-md bg-[hsl(var(--secondary))]" />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ message, icon }: { message: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-8">
      <div className="w-14 h-14 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center">
        {icon}
      </div>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{message}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const { profileId, creatorId } = useParams<{ profileId?: string; creatorId?: string }>()
  const resolvedProfileId = profileId ?? creatorId
  const navigate = useNavigate()
  const { profile: currentUser, session } = useAuthStore()
  const { t } = useTranslation()

  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<TabKey>('packs')
  const [selectedPack, setSelectedPack] = useState<PackCard | null>(null)
  const [isBuyingPack, setIsBuyingPack] = useState(false)
  const [lightbox, setLightbox] = useState<{
    url: string
    title?: string
    type: 'image' | 'video' | 'audio'
  } | null>(null)

  const handleBuyPack = async (pack: PackCard) => {
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

      const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin).trim()

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
            cancel_url: `${appUrl}/creator/${pack.creator_id}/content`,
          }),
        }
      )

      const json = await res.json()

      if (!json.success || !json.checkoutUrl) {
        throw new Error(json.error || 'Checkout error')
      }

      window.location.href = json.checkoutUrl
    } catch (err: any) {
      console.error('[ContentPage] Pack checkout error:', err)
      toast({ title: err?.message || t('creator.packPurchaseError'), type: 'error' })
    } finally {
      setIsBuyingPack(false)
    }
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['creator-content', resolvedProfileId],
    queryFn: () => {
      if (!resolvedProfileId) throw new Error('profileId missing')
      return fetchCreatorContent(resolvedProfileId, currentUser?.id)
    },
    enabled: !!resolvedProfileId,
    staleTime: 1000 * 60 * 2,
    placeholderData: keepPreviousData,
  })

  // Aggregate all pack media items
  const allPackItems = data?.packs.flatMap((p) => p.items) ?? []
  const photoItems = allPackItems.filter((i) => i.type === 'image')
  const videoItems = allPackItems.filter((i) => i.type === 'video')

  const handlePackItemClick = (item: PackMediaItem) => {
    if (item.is_locked || !item.url) return
    setLightbox({ url: item.url, title: item.title, type: item.type })
  }

  const handlePhotoClick = (url: string) => {
    setLightbox({ url, type: 'image' })
  }

  const counts = {
    packs: data?.packs.length ?? 0,
    fotos: (data?.profilePhotos.length ?? 0) + photoItems.length,
    videos: videoItems.length,
  }

  const TABS: { key: TabKey; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'packs', label: t('contentPage.tabPacks'), icon: <Package size={13} />, count: counts.packs },
    { key: 'fotos', label: t('contentPage.filterPhotos'), icon: <ImageIcon size={13} />, count: counts.fotos },
    { key: 'videos', label: t('contentPage.filterVideos'), icon: <Video size={13} />, count: counts.videos },
  ]

  return (
    <div className="flex flex-col bg-[hsl(var(--background))] min-h-screen">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-[hsl(var(--background)/0.85)] backdrop-blur-lg border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-3 px-4 py-3 max-w-4xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--secondary)/0.8)] transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft size={18} className="text-[hsl(var(--foreground))]" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-[hsl(var(--foreground))] truncate">
              {data?.creatorName ?? '...'}
            </h1>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{t('contentPage.gallery')}</p>
          </div>
        </div>

        {/* Tabs */}
        {!isLoading && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none px-4 pb-3 max-w-4xl mx-auto">
            {TABS.map((tab) => (
              <TabPill
                key={tab.key}
                label={tab.label}
                icon={tab.icon}
                count={tab.count}
                active={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
              />
            ))}
          </div>
        )}
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto">

          {/* Loading */}
          {isLoading && <ContentSkeleton />}

          {/* Error */}
          {isError && !isLoading && (
            <EmptyState
              message={t('contentPage.loadError')}
              icon={<X size={24} className="text-[hsl(var(--muted-foreground))]" />}
            />
          )}

          {/* ── Tab: Packs ────────────────────────────────────────────────── */}
          {!isLoading && !isError && activeTab === 'packs' && (
            <>
              {counts.packs === 0 ? (
                <EmptyState
                  message={t('contentPage.emptyPacks')}
                  icon={<Package size={24} className="text-[hsl(var(--muted-foreground))]" />}
                />
              ) : (
                <div className="px-4 pt-4 pb-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {data!.packs.map((pack) => (
                      <PackCardInline
                        key={pack.id}
                        pack={pack}
                        onClick={() => setSelectedPack(pack)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Tab: Photos ───────────────────────────────────────────────── */}
          {!isLoading && !isError && activeTab === 'fotos' && (
            <>
              {counts.fotos === 0 ? (
                <EmptyState
                  message={t('contentPage.emptyPhotos')}
                  icon={<ImageIcon size={24} className="text-[hsl(var(--muted-foreground))]" />}
                />
              ) : (
                <div className="p-2">
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5">
                    {/* Profile photos (public) */}
                    {data!.profilePhotos.map((photo) => (
                      <PhotoThumb
                        key={photo.id}
                        url={photo.url}
                        alt="Foto"
                        onClick={() => handlePhotoClick(photo.url)}
                      />
                    ))}
                    {/* Pack photo items */}
                    {photoItems.map((item) => (
                      <MediaThumb
                        key={item.id}
                        item={item}
                        onClick={() => handlePackItemClick(item)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Tab: Videos ───────────────────────────────────────────────── */}
          {!isLoading && !isError && activeTab === 'videos' && (
            <>
              {counts.videos === 0 ? (
                <EmptyState
                  message={t('contentPage.emptyVideos')}
                  icon={<Video size={24} className="text-[hsl(var(--muted-foreground))]" />}
                />
              ) : (
                <div className="p-2">
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5">
                    {videoItems.map((item) => (
                      <MediaThumb
                        key={item.id}
                        item={item}
                        onClick={() => handlePackItemClick(item)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ── Pack detail modal ──────────────────────────────────────────────── */}
      {selectedPack && (
        <PackDetailModal
          pack={selectedPack}
          onClose={() => !isBuyingPack && setSelectedPack(null)}
          onItemClick={(item) => {
            if (!item.is_locked && item.url) {
              setSelectedPack(null)
              setLightbox({ url: item.url, title: item.title, type: item.type })
            }
          }}
          onBuy={handleBuyPack}
          isBuying={isBuyingPack}
        />
      )}

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {lightbox && (
        <Lightbox
          url={lightbox.url}
          title={lightbox.title}
          type={lightbox.type}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
