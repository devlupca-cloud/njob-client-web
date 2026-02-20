import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Tag, Copy, Check, Ticket } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Coupon } from '@/types'

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchAvailableCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase.rpc('get_available_coupons')
  if (error) throw error
  return (data ?? []) as Coupon[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCouponActive(coupon: Coupon): boolean {
  if (coupon.valid_until) {
    return new Date(coupon.valid_until) > new Date()
  }
  return true
}

function formatDiscount(coupon: Coupon): string {
  if (coupon.discount_type === 'percentage') {
    return `${coupon.discount_value}% OFF`
  }
  return `R$ ${coupon.discount_value.toFixed(2).replace('.', ',')} OFF`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Coupon Card ─────────────────────────────────────────────────────────────

function CouponCard({ coupon, onClick }: { coupon: Coupon; onClick: () => void }) {
  const [copied, setCopied] = useState(false)
  const active = isCouponActive(coupon)

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(coupon.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      onClick={onClick}
      className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform duration-150"
    >
      {/* Banner de desconto */}
      <div
        className={`px-3 py-2 ${
          active
            ? 'bg-[hsl(var(--primary))]'
            : 'bg-[hsl(var(--secondary))]'
        }`}
      >
        <span className="text-white text-sm font-bold">
          {formatDiscount(coupon)}
        </span>
      </div>

      <div className="p-3 flex flex-col gap-3">
        {/* Código */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-base font-bold text-[hsl(var(--foreground))] tracking-widest truncate">
            {coupon.code}
          </span>
          <button
            onClick={handleCopy}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors"
            aria-label="Copiar código"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              active
                ? 'bg-green-500/15 text-green-400'
                : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
            }`}
          >
            {active ? 'Ativo' : 'Expirado'}
          </span>

          {coupon.valid_until && (
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              Até {formatDate(coupon.valid_until)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center">
        <Ticket size={28} className="text-[hsl(var(--muted-foreground))]" />
      </div>
      <div>
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">Nenhum cupom encontrado</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
          Seus cupons aparecerão aqui quando disponíveis.
        </p>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden animate-pulse">
      <div className="h-9 bg-[hsl(var(--secondary))]" />
      <div className="p-3 flex flex-col gap-3">
        <div className="h-5 bg-[hsl(var(--secondary))] rounded w-3/4" />
        <div className="h-4 bg-[hsl(var(--secondary))] rounded w-1/2" />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CouponsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const { data: coupons, isLoading, isError } = useQuery({
    queryKey: ['available-coupons'],
    queryFn: () => fetchAvailableCoupons(),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
  })

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))] max-w-3xl mx-auto w-full">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] px-4 pt-4 pb-3">
        <div className="relative flex items-center justify-center h-7">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-7 h-7 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
            aria-label="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">Cupons</span>
          <div className="absolute right-0 w-7 h-7 flex items-center justify-center">
            <Tag size={18} className="text-[hsl(var(--primary))]" />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-4">
        {isLoading && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-[hsl(var(--muted-foreground))] text-center px-8">
              Erro ao carregar cupons. Tente novamente mais tarde.
            </p>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {!coupons || coupons.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {coupons.map((coupon) => (
                  <CouponCard
                    key={coupon.id}
                    coupon={coupon}
                    onClick={() => navigate(`/coupons/${coupon.id}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
