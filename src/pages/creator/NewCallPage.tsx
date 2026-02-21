import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Video, Clock, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { APP_URL } from '@/lib/config'

// ─── Types ────────────────────────────────────────────────────────────────────

type Duration = 30 | 60

interface CallPricing {
  call_per_30_min: number | null
  call_per_1_hr: number | null
  creatorName: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

async function fetchCallPricing(creatorId: string): Promise<CallPricing> {
  const [settingsRes, profileRes] = await Promise.all([
    supabase
      .from('profile_settings')
      .select('call_per_30_min, call_per_1_hr')
      .eq('profile_id', creatorId)
      .single(),
    supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', creatorId)
      .single(),
  ])

  if (settingsRes.error) throw settingsRes.error

  return {
    call_per_30_min: settingsRes.data?.call_per_30_min ?? null,
    call_per_1_hr: settingsRes.data?.call_per_1_hr ?? null,
    creatorName: profileRes.data?.full_name ?? profileRes.data?.username ?? 'Creator',
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewCallPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const creatorId = searchParams.get('creatorId')

  const [duration, setDuration] = useState<Duration>(30)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: pricing, isLoading: isPricingLoading, isError } = useQuery({
    queryKey: ['call-pricing', creatorId],
    queryFn: () => fetchCallPricing(creatorId!),
    enabled: !!creatorId,
  })

  const selectedPrice = duration === 60
    ? pricing?.call_per_1_hr
    : pricing?.call_per_30_min

  const handleSchedule = async () => {
    if (!creatorId || !selectedPrice) return
    setIsLoading(true)
    setError(null)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-stripe-checkout', {
        body: {
          product_type: 'video-call',
          duration,
          creator_id: creatorId,
          product_id: creatorId,
          success_url: `${APP_URL}/purchases`,
          cancel_url: `${APP_URL}/creator/${creatorId}`,
        },
      })

      if (fnError) throw fnError
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl
      }
    } catch (err: any) {
      console.error('Erro ao criar checkout de chamada:', err)
      setError('Erro ao processar pagamento. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!creatorId) {
    return (
      <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">
        <Header onBack={() => navigate(-1)} />
        <main className="flex-1 flex items-center justify-center px-8">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Criador nao encontrado.
          </p>
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">
      <Header onBack={() => navigate(-1)} />

      <main className="flex-1 px-4 py-8">
        <div className="max-w-lg mx-auto">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Video size={28} className="text-emerald-500" />
            </div>
          </div>

          <h2 className="text-lg font-bold text-[hsl(var(--foreground))] text-center mb-1">
            Chamada de video
          </h2>
          {pricing && (
            <p className="text-sm text-[hsl(var(--muted-foreground))] text-center mb-8">
              com {pricing.creatorName}
            </p>
          )}

          {isPricingLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[hsl(var(--muted-foreground))]" />
            </div>
          )}

          {isError && (
            <p className="text-sm text-red-500 text-center py-8">
              Erro ao carregar precos. Tente novamente.
            </p>
          )}

          {pricing && !isPricingLoading && (
            <>
              {/* Duration selector */}
              <p className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3">
                Duracao
              </p>
              <div className="flex gap-3 mb-8">
                <DurationOption
                  label="30 minutos"
                  price={pricing.call_per_30_min}
                  selected={duration === 30}
                  onClick={() => setDuration(30)}
                />
                <DurationOption
                  label="1 hora"
                  price={pricing.call_per_1_hr}
                  selected={duration === 60}
                  onClick={() => setDuration(60)}
                />
              </div>

              {/* Error message */}
              {error && (
                <p className="text-sm text-red-500 text-center mb-4">{error}</p>
              )}

              {/* Schedule button */}
              <button
                onClick={handleSchedule}
                disabled={isLoading || !selectedPrice || selectedPrice <= 0}
                className="
                  w-full flex items-center justify-center gap-2 py-3 rounded-xl
                  bg-emerald-600 text-white font-semibold text-sm
                  hover:opacity-90 active:scale-[0.98] transition-all duration-150
                  disabled:opacity-60 disabled:cursor-not-allowed
                "
              >
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Video size={18} />
                )}
                {isLoading
                  ? 'Processando...'
                  : selectedPrice && selectedPrice > 0
                    ? `Agendar por ${formatPrice(selectedPrice)}`
                    : 'Preco nao disponivel'}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] px-4 pt-4 pb-3">
      <div className="relative flex items-center justify-center h-7">
        <button
          onClick={onBack}
          className="absolute left-0 w-7 h-7 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
          aria-label="Voltar"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-base font-semibold text-[hsl(var(--foreground))]">Nova chamada</span>
      </div>
    </header>
  )
}

function DurationOption({
  label,
  price,
  selected,
  onClick,
}: {
  label: string
  price: number | null
  selected: boolean
  onClick: () => void
}) {
  const available = price != null && price > 0

  return (
    <button
      onClick={onClick}
      disabled={!available}
      className={`
        flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-150
        ${selected && available
          ? 'border-emerald-500 bg-emerald-500/5'
          : available
            ? 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--muted-foreground))]'
            : 'border-[hsl(var(--border))] bg-[hsl(var(--secondary))] opacity-50 cursor-not-allowed'
        }
      `}
    >
      <Clock size={20} className={selected && available ? 'text-emerald-500' : 'text-[hsl(var(--muted-foreground))]'} />
      <span className={`text-sm font-medium ${selected && available ? 'text-emerald-500' : 'text-[hsl(var(--foreground))]'}`}>
        {label}
      </span>
      <span className="text-xs text-[hsl(var(--muted-foreground))]">
        {available ? formatPrice(price) : 'Indisponivel'}
      </span>
    </button>
  )
}
