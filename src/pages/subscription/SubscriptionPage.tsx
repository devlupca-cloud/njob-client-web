import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Star, Zap, Crown, Settings } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { APP_URL } from '@/lib/config'
import type { SubscriptionPlan, CreatorSubscription } from '@/types'


// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchPlansAndSubscription(userId: string): Promise<{
  plans: SubscriptionPlan[]
  activeSubscriptions: CreatorSubscription[]
}> {
  const [plansRes, subsRes] = await Promise.all([
    supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price_monthly', { ascending: true }),
    supabase
      .from('creator_subscriptions')
      .select('*')
      .eq('creator_id', userId)
      .eq('status', 'active'),
  ])

  if (plansRes.error) throw plansRes.error
  if (subsRes.error) throw subsRes.error

  return {
    plans: (plansRes.data ?? []) as SubscriptionPlan[],
    activeSubscriptions: (subsRes.data ?? []) as CreatorSubscription[],
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(price: number, interval: 'monthly' | 'yearly'): string {
  const formatted = price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return `${formatted}/${interval === 'monthly' ? 'mês' : 'ano'}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

// ─── Plan Icon ────────────────────────────────────────────────────────────────

function PlanIcon({ index }: { index: number }) {
  if (index === 0) return <Star size={20} className="text-[hsl(var(--primary))]" />
  if (index === 1) return <Zap size={20} className="text-yellow-400" />
  return <Crown size={20} className="text-orange-400" />
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  index,
  isPopular,
  isCurrent,
  onSubscribe,
}: {
  plan: SubscriptionPlan
  index: number
  isPopular: boolean
  isCurrent: boolean
  onSubscribe: (plan: SubscriptionPlan) => void
}) {
  return (
    <div
      className={`relative bg-[hsl(var(--card))] rounded-2xl overflow-hidden border transition-all ${
        isPopular
          ? 'border-[hsl(var(--primary))] shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]'
          : isCurrent
          ? 'border-green-500/50'
          : 'border-[hsl(var(--border))]'
      }`}
    >
      {/* Popular badge */}
      {isPopular && !isCurrent && (
        <div className="absolute top-0 right-0">
          <div className="bg-[hsl(var(--primary))] text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
            POPULAR
          </div>
        </div>
      )}

      {/* Current badge */}
      {isCurrent && (
        <div className="absolute top-0 right-0">
          <div className="bg-green-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
            ATUAL
          </div>
        </div>
      )}

      {/* Header do card */}
      <div
        className={`px-4 py-3 ${
          isPopular ? 'bg-[hsl(var(--primary)/0.1)]' : 'bg-[hsl(var(--secondary))]'
        }`}
      >
        <div className="flex items-center gap-2">
          <PlanIcon index={index} />
          <span className="font-semibold text-sm text-[hsl(var(--foreground))]">{plan.name}</span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-4">

        {/* Preço */}
        <div>
          <span className="text-2xl font-black text-[hsl(var(--primary))]">
            {formatPrice(plan.price_monthly ?? plan.price ?? 0, 'monthly')}
          </span>
        </div>

        {/* Benefícios */}
        {plan.benefits && plan.benefits.length > 0 && (
          <ul className="flex flex-col gap-2">
            {plan.benefits.map((benefit, i) => (
              <li key={i} className="flex items-start gap-2">
                <Check
                  size={14}
                  className={`mt-0.5 shrink-0 ${
                    isPopular ? 'text-[hsl(var(--primary))]' : 'text-green-400'
                  }`}
                />
                <span className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                  {benefit}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Botão */}
        <button
          onClick={() => onSubscribe(plan)}
          disabled={isCurrent}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
            isCurrent
              ? 'bg-green-500/15 text-green-400 cursor-default'
              : isPopular
              ? 'bg-[hsl(var(--primary))] text-white hover:opacity-90'
              : 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--border))]'
          }`}
        >
          {isCurrent ? 'Plano atual' : 'Contratar plano'}
        </button>
      </div>
    </div>
  )
}

// ─── Active Subscription Card ─────────────────────────────────────────────────

function ActiveSubscriptionCard({
  sub,
  plan,
  onManage,
  isManaging,
}: {
  sub: CreatorSubscription
  plan: SubscriptionPlan | undefined
  onManage: () => void
  isManaging: boolean
}) {
  if (!plan) return null

  return (
    <div className="bg-[hsl(var(--card))] border border-green-500/40 rounded-2xl overflow-hidden">
      <div className="bg-green-500/10 px-4 py-2.5 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-sm font-semibold text-green-400">Assinatura ativa</span>
      </div>
      <div className="px-4 py-4 flex flex-col gap-1.5">
        <p className="text-base font-bold text-[hsl(var(--foreground))]">{plan.name}</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {formatPrice(plan.price_monthly ?? plan.price ?? 0, 'monthly')}
        </p>
        {sub.expires_at && (
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            Renova em {formatDate(sub.expires_at)}
          </p>
        )}
        <button
          onClick={onManage}
          disabled={isManaging}
          className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] text-sm font-semibold hover:bg-[hsl(var(--border))] transition-colors disabled:opacity-50"
        >
          {isManaging ? (
            <div className="w-4 h-4 border-2 border-[hsl(var(--foreground))] border-t-transparent rounded-full animate-spin" />
          ) : (
            <Settings size={14} />
          )}
          {isManaging ? 'Abrindo...' : 'Gerenciar assinatura'}
        </button>
      </div>
    </div>
  )
}

// ─── Toast Notification ───────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg transition-all ${
        type === 'success'
          ? 'bg-green-500 text-white'
          : 'bg-red-500 text-white'
      }`}
    >
      {message}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubscriptionPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [isManaging, setIsManaging] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: () => fetchPlansAndSubscription(user!.id),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  })

  // Detectar retorno do Stripe checkout
  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    const canceled = searchParams.get('canceled')

    if (sessionId) {
      setToast({ message: 'Assinatura realizada com sucesso!', type: 'success' })
      queryClient.invalidateQueries({ queryKey: ['subscription', user?.id] })
      setSearchParams({}, { replace: true })
    } else if (canceled === 'true') {
      setToast({ message: 'Checkout cancelado.', type: 'error' })
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, queryClient, user?.id])

  const plans = data?.plans ?? []
  const activeSubscriptions = data?.activeSubscriptions ?? []

  // Encontra plano atual (primeiro ativo)
  const currentPlanId = activeSubscriptions[0]?.plan_id

  // Índice do plano mais popular (o do meio, ou o mais caro se 2)
  const popularIndex = plans.length >= 2 ? Math.floor(plans.length / 2) : -1

  async function handleSubscribe(plan: SubscriptionPlan) {
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-subscription-stripe', {
        body: {
          price_id: plan.stripe_price_id,
          success_url: `${APP_URL}/subscription?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${APP_URL}/subscription?canceled=true`,
        },
      })
      if (error) throw error
      if (data?.checkout_url) {
        window.location.href = data.checkout_url
      }
    } catch (err) {
      console.error('Erro ao criar checkout de assinatura:', err)
      setToast({ message: 'Erro ao iniciar checkout. Tente novamente.', type: 'error' })
    }
  }

  async function handleManageSubscription() {
    setIsManaging(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-customer-portal-session', {
        body: {
          return_url: `${APP_URL}/subscription`,
        },
      })
      if (error) throw error
      if (data?.portal_url) {
        window.location.href = data.portal_url
      }
    } catch (err) {
      console.error('Erro ao abrir portal:', err)
      setToast({ message: 'Erro ao abrir portal de gerenciamento.', type: 'error' })
    } finally {
      setIsManaging(false)
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* Header */}
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="relative flex items-center justify-center h-7 max-w-3xl mx-auto px-4 pt-4 pb-3">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-7 h-7 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
            aria-label="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">Assinatura</span>
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
            Erro ao carregar planos. Tente novamente.
          </p>
        </div>
      )}

      {/* Content */}
      {!isLoading && !isError && (
        <main className="flex-1 px-4 py-6 flex flex-col gap-6 max-w-3xl mx-auto w-full">

          {/* Assinatura atual */}
          {activeSubscriptions.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                Minha Assinatura
              </h2>
              {activeSubscriptions.map((sub) => (
                <ActiveSubscriptionCard
                  key={sub.id}
                  sub={sub}
                  plan={plans.find((p) => p.id === sub.plan_id)}
                  onManage={handleManageSubscription}
                  isManaging={isManaging}
                />
              ))}
            </div>
          )}

          {/* Planos disponíveis */}
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
              {activeSubscriptions.length > 0 ? 'Outros Planos' : 'Planos Disponíveis'}
            </h2>

            {plans.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Nenhum plano disponível no momento.
                </p>
              </div>
            ) : (
              <div className="flex flex-col md:grid md:grid-cols-3 gap-4">
                {plans.map((plan, index) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    index={index}
                    isPopular={index === popularIndex}
                    isCurrent={plan.id === currentPlanId}
                    onSubscribe={handleSubscribe}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Nota de rodapé */}
          <p className="text-xs text-[hsl(var(--muted-foreground))] text-center pb-2">
            Cancele a qualquer momento. Sem fidelidade.
          </p>
        </main>
      )}
    </div>
  )
}
