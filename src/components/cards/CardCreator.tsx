import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Heart,
  Video,
  MapPin,
  Package,
  Radio,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Creator } from '@/types'
import { useTranslation } from 'react-i18next'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardCreatorProps {
  creator: Creator
}

// ─── Status dot ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string | null }) {
  const colorMap: Record<string, string> = {
    online: '#22c55e',    // green-500
    ausente: '#f59e0b',   // amber-500
    offline: '#6b7280',   // gray-500
    'em live': '#a855f7', // purple-500
  }

  const color = status ? (colorMap[status] ?? 'transparent') : 'transparent'

  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  )
}

// ─── Feature Icon ─────────────────────────────────────────────────────────────

function FeatureIcon({
  icon,
  active,
  title,
}: {
  icon: React.ReactNode
  active: boolean
  title: string
}) {
  if (!active) return null
  return (
    <span
      title={title}
      className="flex items-center justify-center w-5 h-5 rounded-full bg-[hsl(var(--primary)/0.15)]"
    >
      <span className="text-[hsl(var(--primary))]">{icon}</span>
    </span>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function CardCreatorSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--card))] animate-pulse">
      {/* avatar */}
      <div className="aspect-[3/4] bg-[hsl(var(--secondary))]" />
      {/* footer */}
      <div className="p-2 space-y-2">
        <div className="h-3 w-2/3 rounded bg-[hsl(var(--secondary))]" />
        <div className="h-2 w-1/2 rounded bg-[hsl(var(--secondary))]" />
      </div>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export default function CardCreator({ creator }: CardCreatorProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.profile)
  const { t } = useTranslation()

  const {
    id,
    nome,
    foto_perfil,
    status,
    live_hoje,
    vende_conteudo,
    faz_chamada_video,
    faz_encontro_presencial,
    quantidade_likes,
    favorito,
  } = creator

  const isLive = status === 'em live'

  const handleClick = () => {
    navigate(`/creator/${id}`)
  }

  const favoriteMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id) return
      const { error } = await supabase.rpc('toggle_creator_favorite', {
        p_creator_id: id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creators'] })
      queryClient.invalidateQueries({ queryKey: ['creator-profile', id] })
    },
  })

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation()
    favoriteMutation.mutate()
  }

  return (
    <article
      onClick={handleClick}
      className="
        relative flex flex-col rounded-xl overflow-hidden cursor-pointer
        border border-[hsl(var(--border))]
        bg-[hsl(var(--card))]
        transition-transform duration-200 active:scale-[0.97]
        hover:border-[hsl(var(--primary)/0.4)]
        select-none
      "
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      {/* ── Avatar area ─────────────────────────────────────── */}
      <div className="relative aspect-[3/4] overflow-hidden bg-[hsl(var(--secondary))]">
        {foto_perfil ? (
          <img
            src={foto_perfil}
            alt={nome}
            loading="lazy"
            className="w-full h-full object-cover object-top"
          />
        ) : (
          /* Placeholder avatar */
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[hsl(var(--secondary))] to-[hsl(var(--border))]">
            <span className="text-4xl font-bold text-[hsl(var(--muted-foreground))]">
              {nome?.charAt(0)?.toUpperCase() ?? '?'}
            </span>
          </div>
        )}

        {/* LIVE badge */}
        {(isLive || live_hoje) && (
          <span className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-widest bg-red-600 text-white leading-none">
            <Radio size={8} className="animate-pulse" />
            {t('card.liveTag')}
          </span>
        )}

        {/* Favorite button */}
        <button
          onClick={handleFavorite}
          className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
          aria-label={favorito ? t('card.removeFavorite') : t('card.addFavorite')}
        >
          <Heart
            size={13}
            className={
              favorito
                ? 'fill-rose-500 text-rose-500'
                : 'text-white'
            }
          />
        </button>

        {/* Bottom gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

        {/* Feature icons over gradient */}
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
          <FeatureIcon
            icon={<Package size={10} />}
            active={vende_conteudo}
            title={t('card.sellsContent')}
          />
          <FeatureIcon
            icon={<Video size={10} />}
            active={faz_chamada_video}
            title={t('card.videoCall')}
          />
          <FeatureIcon
            icon={<MapPin size={10} />}
            active={faz_encontro_presencial}
            title={t('card.inPerson')}
          />
        </div>

        {/* Likes */}
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5">
          <Heart size={10} className="text-rose-400 fill-rose-400" />
          <span className="text-[10px] font-medium text-white leading-none">
            {quantidade_likes >= 1000
              ? `${(quantidade_likes / 1000).toFixed(1)}k`
              : quantidade_likes}
          </span>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div className="px-2 py-1.5 flex items-center gap-1.5">
        <StatusDot status={status} />
        <span className="text-xs font-medium text-[hsl(var(--foreground))] truncate leading-none">
          {nome ?? '—'}
        </span>
      </div>
    </article>
  )
}
