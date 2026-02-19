import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CreditCard, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardFormData {
  number: string
  holderName: string
  expiry: string
  cvv: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 16)
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

function maskExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length >= 3) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`
  }
  return digits
}

function detectBrand(number: string): string {
  const n = number.replace(/\s/g, '')
  if (/^4/.test(n)) return 'visa'
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'mastercard'
  if (/^3[47]/.test(n)) return 'amex'
  if (/^6(?:011|5)/.test(n)) return 'discover'
  if (/^(636368|438935|504175|451416|636297|5067|4576|4011)/.test(n)) return 'elo'
  return 'unknown'
}

// ─── Mutation ─────────────────────────────────────────────────────────────────

async function saveCard(userId: string, form: CardFormData): Promise<void> {
  const [expMonth, expYear] = form.expiry.split('/')
  const last4 = form.number.replace(/\s/g, '').slice(-4)
  const brand = detectBrand(form.number)

  const { error } = await supabase.from('saved_cards').insert({
    user_id: userId,
    last4,
    brand,
    exp_month: parseInt(expMonth, 10),
    exp_year: parseInt(`20${expYear}`, 10),
    holder_name: form.holderName.trim().toUpperCase(),
    is_default: false,
  })

  if (error) throw error
}

// ─── Form Field ───────────────────────────────────────────────────────────────

function FormField({
  label,
  children,
  error,
}: {
  label: string
  children: React.ReactNode
  error?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AddCardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [form, setForm] = useState<CardFormData>({
    number: '',
    holderName: '',
    expiry: '',
    cvv: '',
  })

  const [errors, setErrors] = useState<Partial<CardFormData>>({})

  const mutation = useMutation({
    mutationFn: () => saveCard(user!.id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-cards', user?.id] })
      navigate('/payments/cards', { replace: true })
    },
  })

  function validate(): boolean {
    const errs: Partial<CardFormData> = {}
    const digits = form.number.replace(/\s/g, '')

    if (digits.length < 13 || digits.length > 16) {
      errs.number = 'Número de cartão inválido'
    }
    if (!form.holderName.trim() || form.holderName.trim().split(' ').length < 2) {
      errs.holderName = 'Informe o nome completo como no cartão'
    }
    if (!/^\d{2}\/\d{2}$/.test(form.expiry)) {
      errs.expiry = 'Validade inválida (MM/AA)'
    } else {
      const [m, y] = form.expiry.split('/').map(Number)
      const now = new Date()
      const expDate = new Date(2000 + y, m - 1)
      if (m < 1 || m > 12 || expDate < now) {
        errs.expiry = 'Cartão expirado ou data inválida'
      }
    }
    if (form.cvv.length < 3 || form.cvv.length > 4) {
      errs.cvv = 'CVV inválido'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (validate()) mutation.mutate()
  }

  const brand = detectBrand(form.number)

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">

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
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">
            Adicionar Cartão
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 flex flex-col gap-6">

        {/* Preview visual do cartão */}
        <div
          className="relative w-full h-44 rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, hsl(263 70% 40%), hsl(263 70% 20%))',
          }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 50%)',
            }}
          />

          <div className="relative z-10 flex flex-col justify-between h-full p-5">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <CreditCard size={20} className="text-white" />
              </div>
              <span className="text-white/60 text-xs font-bold uppercase tracking-widest">
                {brand !== 'unknown' ? brand : ''}
              </span>
            </div>

            <div>
              <p className="font-mono text-white text-lg tracking-[0.2em]">
                {form.number || '•••• •••• •••• ••••'}
              </p>
            </div>

            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] text-white/50 uppercase tracking-wider">Titular</p>
                <p className="text-white text-sm font-semibold mt-0.5 uppercase">
                  {form.holderName || 'SEU NOME AQUI'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/50 uppercase tracking-wider">Validade</p>
                <p className="text-white text-sm font-semibold mt-0.5">
                  {form.expiry || 'MM/AA'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          <FormField label="Número do cartão" error={errors.number}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0000 0000 0000 0000"
              value={form.number}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, number: maskCardNumber(e.target.value) }))
              }
              maxLength={19}
              className="w-full h-11 px-4 rounded-xl bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] text-sm font-mono placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
            />
          </FormField>

          <FormField label="Nome do titular" error={errors.holderName}>
            <input
              type="text"
              placeholder="Como aparece no cartão"
              value={form.holderName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, holderName: e.target.value.toUpperCase() }))
              }
              className="w-full h-11 px-4 rounded-xl bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] text-sm uppercase placeholder:text-[hsl(var(--muted-foreground))] placeholder:normal-case focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Validade (MM/AA)" error={errors.expiry}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="MM/AA"
                value={form.expiry}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, expiry: maskExpiry(e.target.value) }))
                }
                maxLength={5}
                className="w-full h-11 px-4 rounded-xl bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] text-sm placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
              />
            </FormField>

            <FormField label="CVV" error={errors.cvv}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="123"
                value={form.cvv}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    cvv: e.target.value.replace(/\D/g, '').slice(0, 4),
                  }))
                }
                maxLength={4}
                className="w-full h-11 px-4 rounded-xl bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] text-sm placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
              />
            </FormField>
          </div>

          {mutation.isError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <p className="text-xs text-red-400">
                Erro ao salvar cartão. Verifique os dados e tente novamente.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
            <Lock size={12} />
            <p className="text-xs">Seus dados são criptografados com segurança.</p>
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full h-12 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {mutation.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar cartão'
            )}
          </button>
        </form>
      </main>
    </div>
  )
}
