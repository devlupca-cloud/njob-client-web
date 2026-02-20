import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Copy, Check, Calendar, DollarSign, Store } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Coupon } from '@/types'

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCoupon(id: string): Promise<Coupon> {
  const { data, error } = await supabase.rpc('get_available_coupons')
  if (error) throw error
  const coupon = (data ?? []).find((c: any) => c.id === id)
  if (!coupon) throw new Error('Cupom não encontrado')
  return coupon as Coupon
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCouponActive(coupon: Coupon): boolean {
  if (coupon.valid_until) {
    return new Date(coupon.valid_until) > new Date()
  }
  return true
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[hsl(var(--border))] last:border-0">
      <div className="w-8 h-8 rounded-lg bg-[hsl(var(--secondary))] flex items-center justify-center text-[hsl(var(--primary))] shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
        <p className="text-sm font-medium text-[hsl(var(--foreground))] mt-0.5">{value}</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CouponDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [copied, setCopied] = useState(false)

  const { data: coupon, isLoading, isError } = useQuery({
    queryKey: ['coupon', id],
    queryFn: () => fetchCoupon(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  })

  function handleCopy() {
    if (!coupon) return
    navigator.clipboard.writeText(coupon.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const active = coupon ? isCouponActive(coupon) : false

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="relative flex items-center justify-center h-7 max-w-2xl mx-auto px-4 pt-4 pb-3">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-7 h-7 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
            aria-label="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">Detalhe do Cupom</span>
        </div>
      </header>

      {/* Loading */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex-1 flex items-center justify-center px-8">
          <p className="text-sm text-[hsl(var(--muted-foreground))] text-center">
            Não foi possível carregar o cupom.
          </p>
        </div>
      )}

      {/* Content */}
      {coupon && !isLoading && (
        <main className="flex-1 px-4 py-6 flex flex-col gap-6 max-w-2xl mx-auto w-full">

          {/* Badge de desconto */}
          <div className="flex flex-col items-center gap-2">
            <div
              className={`px-6 py-3 rounded-xl ${
                active ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--secondary))]'
              }`}
            >
              <span className="text-white text-2xl font-black tracking-wide">
                {coupon.discount_type === 'percentage'
                  ? `${coupon.discount_value}% OFF`
                  : `${formatCurrency(coupon.discount_value)} OFF`}
              </span>
            </div>

            {/* Status badge */}
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full ${
                active
                  ? 'bg-green-500/15 text-green-400'
                  : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
              }`}
            >
              {active ? 'Ativo' : 'Expirado'}
            </span>
          </div>

          {/* Card do código */}
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl overflow-hidden">

            {/* Header do card */}
            <div className="px-4 py-3 border-b border-dashed border-[hsl(var(--border))]">
              <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium uppercase tracking-wider text-center">
                Código Promocional
              </p>
            </div>

            {/* Código + botão copiar */}
            <div className="px-4 py-5 flex items-center justify-between gap-4">
              <span className="font-mono text-2xl font-black text-[hsl(var(--foreground))] tracking-[0.15em] flex-1 text-center">
                {coupon.code}
              </span>
              <button
                onClick={handleCopy}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  copied
                    ? 'bg-green-500/15 text-green-400'
                    : 'bg-[hsl(var(--primary))] text-white'
                }`}
              >
                {copied ? (
                  <>
                    <Check size={13} />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    Copiar
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Informações do cupom */}
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl px-4">
            <InfoRow
              icon={<DollarSign size={16} />}
              label="Tipo de desconto"
              value={coupon.discount_type === 'percentage' ? 'Percentual (%)' : 'Valor fixo (R$)'}
            />
            <InfoRow
              icon={<Calendar size={16} />}
              label="Válido até"
              value={formatDate(coupon.valid_until)}
            />
            {coupon.store_name && (
              <InfoRow
                icon={<Store size={16} />}
                label="Loja"
                value={coupon.store_name}
              />
            )}
          </div>

          {/* Descrição */}
          {coupon.description && (
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl px-4 py-4">
              <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Descrição</p>
              <p className="text-sm text-[hsl(var(--foreground))]">{coupon.description}</p>
            </div>
          )}
        </main>
      )}
    </div>
  )
}
