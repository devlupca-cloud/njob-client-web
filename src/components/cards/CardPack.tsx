import { Package, ChevronRight } from 'lucide-react'
import type { PackInfo } from '@/types'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardPackProps {
  pack: PackInfo
  onView: (pack: PackInfo) => void
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function CardPackSkeleton() {
  return (
    <div className="flex-shrink-0 w-48 rounded-xl overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--card))] animate-pulse">
      <div className="aspect-[4/3] bg-[hsl(var(--secondary))]" />
      <div className="p-3 space-y-2">
        <div className="h-3 w-3/4 rounded bg-[hsl(var(--secondary))]" />
        <div className="h-2 w-1/2 rounded bg-[hsl(var(--secondary))]" />
        <div className="h-7 w-full rounded-lg bg-[hsl(var(--secondary))]" />
      </div>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export default function CardPack({ pack, onView }: CardPackProps) {
  const { title, price, cover_url, items_count } = pack

  return (
    <article
      className="
        flex-shrink-0 w-48 rounded-xl overflow-hidden cursor-pointer
        border border-[hsl(var(--border))]
        bg-[hsl(var(--card))]
        transition-transform duration-200 active:scale-[0.97]
        hover:border-[hsl(var(--primary)/0.4)]
        select-none
      "
    >
      {/* Cover image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-[hsl(var(--secondary))]">
        {cover_url ? (
          <img
            src={cover_url}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[hsl(var(--secondary))] to-[hsl(var(--border))]">
            <Package size={32} className="text-[hsl(var(--muted-foreground))]" />
          </div>
        )}

        {/* Price badge */}
        <div className="absolute bottom-2 right-2">
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[hsl(var(--primary))] text-white shadow-md">
            {formatCurrency(price)}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2">
        {/* Title */}
        <p className="text-xs font-semibold text-[hsl(var(--foreground))] leading-tight line-clamp-2">
          {title}
        </p>

        {/* Items count */}
        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
          {items_count} {items_count === 1 ? 'item' : 'itens'}
        </p>

        {/* CTA button */}
        <button
          onClick={() => onView(pack)}
          className="
            flex items-center justify-center gap-1.5
            w-full py-1.5 rounded-lg text-xs font-semibold
            bg-[hsl(var(--primary))] text-white
            hover:opacity-90 active:scale-[0.97]
            transition-all duration-150
          "
        >
          Ver pacote
          <ChevronRight size={13} />
        </button>
      </div>
    </article>
  )
}
