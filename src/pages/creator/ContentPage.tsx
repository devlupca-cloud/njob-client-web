import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Image as ImageIcon,
  Video,
  Mic,
  Lock,
  Play,
  X,
  DollarSign,
  Package,
  Grid3x3,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { APP_URL } from '@/lib/config'
import { useAuthStore } from '@/store/authStore'
import type { PackItem } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaFilter = 'todos' | 'fotos' | 'videos' | 'audios'

interface EnrichedItem extends PackItem {
  pack_id: string
  pack_title: string
  pack_price: number
  stripe_price_id: string | null
  is_purchased: boolean
}

interface ContentData {
  creatorName: string
  items: EnrichedItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

function mediaTypeToFilter(type: PackItem['media_type']): MediaFilter {
  switch (type) {
    case 'image': return 'fotos'
    case 'video': return 'videos'
    case 'audio': return 'audios'
  }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCreatorContent(
  profileId: string,
  userId: string | undefined
): Promise<ContentData> {
  // Creator name
  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', profileId)
    .single()

  const creatorName = profileData?.full_name ?? profileData?.username ?? 'Creator'

  // Packs with items
  const { data: packsData, error: packsError } = await supabase
    .from('packs')
    .select('id, title, price, stripe_price_id, pack_items(*)')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })

  if (packsError) throw packsError

  const packs = (packsData ?? []).map((p: any) => ({
    id: p.id,
    creator_id: profileId,
    title: p.title,
    description: p.description ?? null,
    price: p.price,
    stripe_price_id: p.stripe_price_id ?? null,
    cover_url: p.cover_image_url ?? null,
    items: p.pack_items ?? [],
    created_at: p.created_at,
  }))

  // Purchased pack IDs
  let purchasedPackIds = new Set<string>()
  if (userId) {
    const { data: purchasesData } = await supabase
      .from('pack_purchases')
      .select('pack_id')
      .eq('user_id', userId)
      .eq('status', 'completed')

    purchasedPackIds = new Set((purchasesData ?? []).map((p: any) => p.pack_id))
  }

  // Flatten pack items
  const items: EnrichedItem[] = []
  for (const pack of packs) {
    const isPurchased = purchasedPackIds.has(pack.id)
    for (const item of pack.items) {
      items.push({
        ...item,
        pack_id: pack.id,
        pack_title: pack.title,
        pack_price: pack.price,
        stripe_price_id: pack.stripe_price_id,
        is_purchased: isPurchased,
        is_locked: item.is_locked && !isPurchased,
      })
    }
  }

  return { creatorName, items }
}

// ─── Filter pill ─────────────────────────────────────────────────────────────

function FilterPill({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon?: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150
        ${
          active
            ? 'bg-[hsl(var(--primary))] text-white'
            : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
        }
      `}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Media thumbnail ─────────────────────────────────────────────────────────

function MediaThumb({
  item,
  onClick,
}: {
  item: EnrichedItem
  onClick: () => void
}) {
  const isVideo = item.media_type === 'video'
  const isAudio = item.media_type === 'audio'

  return (
    <button
      onClick={onClick}
      className="relative aspect-square overflow-hidden bg-[hsl(var(--secondary))] rounded-sm group"
    >
      {/* Media preview */}
      {isAudio ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-purple-900/40 to-purple-600/20">
          <Mic size={24} className="text-purple-400" />
          {!item.is_locked && (
            <span className="text-[10px] text-purple-300 font-medium px-2 text-center line-clamp-2">
              {item.title}
            </span>
          )}
        </div>
      ) : item.media_url ? (
        isVideo ? (
          <div className="relative w-full h-full bg-black">
            <video
              src={item.media_url}
              className={`w-full h-full object-cover ${item.is_locked ? 'blur-md scale-105 opacity-60' : ''}`}
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
            src={item.media_url}
            alt={item.title}
            loading="lazy"
            className={`w-full h-full object-cover transition-transform group-hover:scale-105 duration-300 ${item.is_locked ? 'blur-md scale-105 opacity-60' : ''}`}
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[hsl(var(--secondary))]">
          <ImageIcon size={24} className="text-[hsl(var(--muted-foreground))]" />
        </div>
      )}

      {/* Locked overlay */}
      {item.is_locked && (
        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
          <Lock size={18} className="text-white" />
          <span className="text-[10px] font-bold text-white">
            {formatPrice(item.pack_price)}
          </span>
        </div>
      )}

      {/* Type badge */}
      {!item.is_locked && (
        <div className="absolute top-1.5 right-1.5">
          {isVideo && (
            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-black/50">
              <Play size={10} className="text-white ml-0.5" />
            </span>
          )}
          {isAudio && (
            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-purple-600/80">
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
  item,
  onClose,
}: {
  item: EnrichedItem
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-sm font-semibold text-white">{item.title}</p>
          <p className="text-xs text-white/50">{item.pack_title}</p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10"
        >
          <X size={18} className="text-white" />
        </button>
      </div>

      {/* Media */}
      <div
        className="flex-1 flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {item.media_type === 'image' && item.media_url && (
          <img
            src={item.media_url}
            alt={item.title}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        )}
        {item.media_type === 'video' && item.media_url && (
          <video
            src={item.media_url}
            controls
            autoPlay
            className="max-w-full max-h-full rounded-lg"
          />
        )}
        {item.media_type === 'audio' && item.media_url && (
          <div className="flex flex-col items-center gap-6 w-full max-w-xs">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-600 to-purple-900 flex items-center justify-center shadow-2xl">
              <Mic size={48} className="text-white" />
            </div>
            <p className="text-white font-semibold text-center">{item.title}</p>
            <audio src={item.media_url} controls className="w-full" />
          </div>
        )}
      </div>

      {/* Description */}
      {item.description && (
        <div className="px-4 pb-6" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-white/70 text-center">{item.description}</p>
        </div>
      )}
    </div>
  )
}

// ─── Purchase Modal ───────────────────────────────────────────────────────────

function PurchaseModal({
  item,
  onClose,
  onBuy,
  isBuying,
}: {
  item: EnrichedItem
  onClose: () => void
  onBuy: () => void
  isBuying: boolean
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
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[hsl(var(--secondary))]"
          >
            <X size={20} className="text-[hsl(var(--foreground))]" />
          </button>
        </div>

        <h2 className="text-lg font-bold text-[hsl(var(--foreground))] text-center mb-6">
          Compra de Conteúdo
        </h2>

        {/* Preview blurred */}
        {item.media_url && item.media_type === 'image' && (
          <div className="w-full aspect-video rounded-xl overflow-hidden mb-4 relative">
            <img
              src={item.media_url}
              alt={item.title}
              className="w-full h-full object-cover blur-sm scale-105"
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Lock size={32} className="text-white" />
            </div>
          </div>
        )}

        {/* Info */}
        <p className="text-sm font-semibold text-[hsl(var(--primary))] mb-2">Informações</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-3">{item.pack_title}</p>

        <div className="flex items-center gap-2 mb-2">
          <DollarSign size={18} className="text-[hsl(var(--muted-foreground))]" />
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {formatPrice(item.pack_price)}
          </span>
        </div>

        <p className="text-sm font-semibold text-[hsl(var(--primary))] mb-1 mt-4">Conteúdo</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-8">
          {item.title}
          {item.description ? ` — ${item.description}` : ''}
        </p>

        <button
          onClick={onBuy}
          disabled={isBuying}
          className="
            w-full flex items-center justify-center gap-2 py-3 rounded-xl
            bg-[hsl(var(--primary))] text-white font-semibold text-sm
            hover:opacity-90 active:scale-[0.98] transition-all duration-150
            disabled:opacity-60 disabled:cursor-not-allowed
          "
        >
          <Package size={18} />
          {isBuying ? 'Processando...' : `Comprar por ${formatPrice(item.pack_price)}`}
        </button>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ContentSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-0.5 animate-pulse">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="aspect-square bg-[hsl(var(--secondary))]" />
      ))}
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyContent({ filter }: { filter: MediaFilter }) {
  const messages: Record<MediaFilter, string> = {
    todos: 'Nenhum conteudo disponivel ainda.',
    fotos: 'Nenhuma foto disponivel.',
    videos: 'Nenhum video disponivel.',
    audios: 'Nenhum audio disponivel.',
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-8">
      <div className="w-14 h-14 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center">
        <Grid3x3 size={24} className="text-[hsl(var(--muted-foreground))]" />
      </div>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{messages[filter]}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const { profileId, creatorId } = useParams<{ profileId?: string; creatorId?: string }>()
  const resolvedProfileId = profileId ?? creatorId
  const navigate = useNavigate()
  const { profile: currentUser } = useAuthStore()

  const [activeFilter, setActiveFilter] = useState<MediaFilter>('todos')
  const [lightboxItem, setLightboxItem] = useState<EnrichedItem | null>(null)
  const [purchaseItem, setPurchaseItem] = useState<EnrichedItem | null>(null)
  const [isBuying, setIsBuying] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['creator-content', resolvedProfileId, currentUser?.id],
    queryFn: () => fetchCreatorContent(resolvedProfileId!, currentUser?.id),
    enabled: !!resolvedProfileId,
    staleTime: 1000 * 60 * 2,
  })

  const handleItemClick = (item: EnrichedItem) => {
    if (item.is_locked) {
      setPurchaseItem(item)
    } else {
      setLightboxItem(item)
    }
  }

  const handleBuy = async () => {
    if (!purchaseItem || !resolvedProfileId) return

    if (!purchaseItem.stripe_price_id) {
      alert('Este pacote ainda não está disponível para compra. O criador precisa configurar o preço no Stripe.')
      setPurchaseItem(null)
      return
    }

    setIsBuying(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
        body: {
          creator_id: resolvedProfileId,
          product_id: purchaseItem.pack_id,
          stripe_price_id: purchaseItem.stripe_price_id,
          product_type: 'pack',
          success_url: `${APP_URL}/purchases`,
          cancel_url: `${APP_URL}/creator/${resolvedProfileId}/content`,
        },
      })
      if (error) throw error
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl
      }
    } catch (err) {
      console.error('Erro ao criar checkout do pack:', err)
    } finally {
      setIsBuying(false)
      setPurchaseItem(null)
    }
  }

  // Filtered items
  const filteredItems = (data?.items ?? []).filter((item) => {
    if (activeFilter === 'todos') return true
    return mediaTypeToFilter(item.media_type) === activeFilter
  })

  const counts = {
    todos: data?.items.length ?? 0,
    fotos: data?.items.filter((i) => i.media_type === 'image').length ?? 0,
    videos: data?.items.filter((i) => i.media_type === 'video').length ?? 0,
    audios: data?.items.filter((i) => i.media_type === 'audio').length ?? 0,
  }

  const FILTERS: { key: MediaFilter; label: string; icon: React.ReactNode }[] = [
    { key: 'todos', label: `Todos (${counts.todos})`, icon: <Grid3x3 size={12} /> },
    { key: 'fotos', label: `Fotos (${counts.fotos})`, icon: <ImageIcon size={12} /> },
    { key: 'videos', label: `Videos (${counts.videos})`, icon: <Video size={12} /> },
    { key: 'audios', label: `Audios (${counts.audios})`, icon: <Mic size={12} /> },
  ]

  return (
    <div className="flex flex-col bg-[hsl(var(--background))] min-h-screen">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-3 px-4 py-4 max-w-4xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))]"
            aria-label="Voltar"
          >
            <ArrowLeft size={18} className="text-[hsl(var(--foreground))]" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-[hsl(var(--foreground))] truncate">
              {data?.creatorName ?? 'Conteúdo'}
            </h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Galeria de conteudo</p>
          </div>
        </div>

        {/* Filters */}
        {!isLoading && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none px-4 pb-3 max-w-4xl mx-auto">
            {FILTERS.map((f) => (
              <FilterPill
                key={f.key}
                label={f.label}
                icon={f.icon}
                active={activeFilter === f.key}
                onClick={() => setActiveFilter(f.key)}
              />
            ))}
          </div>
        )}
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto">

        {/* Loading */}
        {isLoading && (
          <div className="p-0.5">
            <ContentSkeleton />
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <div className="flex items-center justify-center py-16 px-8 text-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Erro ao carregar conteudo. Tente novamente.
            </p>
          </div>
        )}

        {/* Grid */}
        {!isLoading && !isError && (
          <>
            {filteredItems.length === 0 ? (
              <EmptyContent filter={activeFilter} />
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-0.5">
                {filteredItems.map((item) => (
                  <MediaThumb
                    key={item.id}
                    item={item}
                    onClick={() => handleItemClick(item)}
                  />
                ))}
              </div>
            )}
          </>
        )}
        </div>
      </main>

      {/* ── Lightbox ────────────────────────────────────────────────────────── */}
      {lightboxItem && (
        <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
      )}

      {/* ── Purchase modal ──────────────────────────────────────────────────── */}
      {purchaseItem && (
        <PurchaseModal
          item={purchaseItem}
          onClose={() => setPurchaseItem(null)}
          onBuy={handleBuy}
          isBuying={isBuying}
        />
      )}
    </div>
  )
}
