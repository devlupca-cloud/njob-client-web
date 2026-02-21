import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CreditCard, ShieldCheck, Loader2, CheckCircle } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '@/lib/supabase'

// ─── Stripe setup ────────────────────────────────────────────────────────────

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

const stripePromise = STRIPE_PUBLISHABLE_KEY
  ? loadStripe(STRIPE_PUBLISHABLE_KEY)
  : null

// ─── Card Form (inside Elements provider) ────────────────────────────────────

function CardForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsSubmitting(true)
    setError(null)

    const { error: submitError } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payments`,
      },
      redirect: 'if_required',
    })

    if (submitError) {
      setError(submitError.message ?? 'Erro ao salvar cartao.')
      setIsSubmitting(false)
    } else {
      onSuccess()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <PaymentElement />

      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      <button
        type="submit"
        disabled={!stripe || isSubmitting}
        className="
          w-full flex items-center justify-center gap-2 py-3 rounded-xl
          bg-[hsl(var(--primary))] text-white font-semibold text-sm
          hover:opacity-90 active:scale-[0.98] transition-all duration-150
          disabled:opacity-60 disabled:cursor-not-allowed
        "
      >
        {isSubmitting ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <CreditCard size={18} />
        )}
        {isSubmitting ? 'Salvando...' : 'Salvar cartao'}
      </button>

      <div className="flex items-center justify-center gap-2 text-[hsl(var(--muted-foreground))]">
        <ShieldCheck size={14} />
        <p className="text-xs">Dados protegidos pelo Stripe.</p>
      </div>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AddCardPage() {
  const navigate = useNavigate()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function createSetupIntent() {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('create-setup-intent')

        if (fnError) throw fnError
        if (data?.client_secret) {
          setClientSecret(data.client_secret)
        } else {
          throw new Error('client_secret nao retornado')
        }
      } catch (err: any) {
        console.error('Erro ao criar SetupIntent:', err)
        setError('Nao foi possivel iniciar o cadastro do cartao.')
      } finally {
        setIsLoading(false)
      }
    }

    if (stripePromise) {
      createSetupIntent()
    } else {
      setIsLoading(false)
      setError('Configuracao do Stripe ausente. Verifique VITE_STRIPE_PUBLISHABLE_KEY.')
    }
  }, [])

  if (saved) {
    return (
      <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">
        <Header onBack={() => navigate(-1)} />
        <main className="flex-1 flex items-center justify-center px-8">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle size={28} className="text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-1">
              Cartao salvo com sucesso
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mb-6">
              Seu cartao foi adicionado e esta pronto para uso.
            </p>
            <button
              onClick={() => navigate(-1)}
              className="px-6 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
            >
              Voltar
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">
      <Header onBack={() => navigate(-1)} />

      <main className="flex-1 px-4 py-8">
        <div className="max-w-lg mx-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-[hsl(var(--muted-foreground))]" />
            </div>
          )}

          {error && !isLoading && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center">
                <CreditCard size={28} className="text-[hsl(var(--muted-foreground))]" />
              </div>
              <p className="text-sm text-red-500 mb-4">{error}</p>
              <button
                onClick={() => navigate(-1)}
                className="px-6 py-2.5 rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] text-sm font-semibold"
              >
                Voltar
              </button>
            </div>
          )}

          {clientSecret && stripePromise && !isLoading && !error && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'night',
                  variables: {
                    colorPrimary: 'hsl(262, 83%, 58%)',
                    borderRadius: '12px',
                  },
                },
              }}
            >
              <CardForm onSuccess={() => setSaved(true)} />
            </Elements>
          )}
        </div>
      </main>
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────────────────

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
        <span className="text-base font-semibold text-[hsl(var(--foreground))]">
          Adicionar Cartao
        </span>
      </div>
    </header>
  )
}
