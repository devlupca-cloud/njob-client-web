import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  X,
  Video,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Ban,
  TimerReset,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useCallStatus } from '@/hooks/useCallStatus'
import { formatCurrency } from '@/lib/utils'

type Duration = 30 | 60

type FlowState =
  | 'idle'
  | 'requesting'
  | 'waiting_accept'
  | 'awaiting_payment'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'error'
  | 'paid'

interface BookingCallModalProps {
  isOpen: boolean
  onClose: () => void
  creatorId: string
  creatorName: string
  avatarUrl: string | null
  pricePer30Min?: number | null
  pricePer1Hr?: number | null
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

export default function BookingCallModal({
  isOpen,
  onClose,
  creatorId,
  creatorName,
  avatarUrl,
  pricePer30Min,
  pricePer1Hr,
}: BookingCallModalProps) {
  const { session } = useAuthStore()

  const [duration, setDuration] = useState<Duration>(30)
  const [state, setState] = useState<FlowState>('idle')
  const [callId, setCallId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const { call } = useCallStatus(callId)

  useEffect(() => {
    if (!call) return
    switch (call.status) {
      case 'awaiting_payment':
        setState('awaiting_payment')
        break
      case 'paid':
      case 'confirmed':
        setState('paid')
        break
      case 'rejected':
        setState('rejected')
        break
      case 'expired':
        setState('expired')
        break
      case 'cancelled_by_user':
      case 'cancelled_by_creator':
        setState('cancelled')
        break
    }
  }, [call])

  useEffect(() => {
    if (isOpen) return
    setState('idle')
    setCallId(null)
    setErrorMessage(null)
    setDuration(30)
  }, [isOpen])

  useEffect(() => {
    if (state !== 'waiting_accept') return
    const interval = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(interval)
  }, [state])

  const countdownMs = useMemo(() => {
    if (!call?.expires_at) return 0
    return new Date(call.expires_at).getTime() - now
  }, [call, now])

  const price = duration === 30 ? pricePer30Min : pricePer1Hr
  const currentPrice = Number(call?.call_price ?? price ?? 0)

  const handleRequest = async () => {
    if (!session?.user) {
      setErrorMessage('Faça login para solicitar videochamada')
      setState('error')
      return
    }
    setState('requesting')
    setErrorMessage(null)
    try {
      const { data, error } = await supabase.rpc('fn_create_call_request', {
        p_creator_id: creatorId,
        p_duration_minutes: duration,
      })

      if (error) {
        setErrorMessage(error.message)
        setState('error')
        return
      }

      const row = data as unknown as { id: string } | null
      if (!row?.id) {
        setErrorMessage('Não foi possível criar a solicitação.')
        setState('error')
        return
      }

      setCallId(row.id)
      setState('waiting_accept')
    } catch (err) {
      setErrorMessage((err as Error).message)
      setState('error')
    }
  }

  const handlePay = async () => {
    if (!callId) return
    try {
      const apiUrl = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${apiUrl}/functions/v1/create-stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          creator_id: creatorId,
          product_id: callId,
          product_type: 'video-call-request',
          success_url: `${window.location.origin}/calls/${callId}`,
          cancel_url: `${window.location.origin}/creator/${creatorId}`,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.checkoutUrl) {
        setErrorMessage(json?.error ?? 'Falha ao iniciar pagamento.')
        setState('error')
        return
      }
      window.location.href = json.checkoutUrl
    } catch (err) {
      setErrorMessage((err as Error).message)
      setState('error')
    }
  }

  const handleCancelRequest = async () => {
    if (!callId) {
      onClose()
      return
    }
    await supabase
      .from('one_on_one_calls')
      .update({ status: 'cancelled_by_user' })
      .eq('id', callId)
    onClose()
  }

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      if (state === 'waiting_accept' || state === 'awaiting_payment') {
        void handleCancelRequest()
      } else {
        onClose()
      }
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleDialogChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md" />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            w-[calc(100%-2rem)] max-w-[420px] max-h-[90dvh]
            rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))]
            shadow-[0_24px_80px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col"
        >
          <Dialog.Title className="sr-only">Solicitar videochamada</Dialog.Title>

          {/* Close */}
          <button
            onClick={() => handleDialogChange(false)}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full
              bg-[hsl(var(--secondary)/0.8)] backdrop-blur-sm
              flex items-center justify-center
              text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]
              transition-colors"
          >
            <X size={15} />
          </button>

          <div className="flex-1 overflow-y-auto overscroll-contain p-6">
            {/* Header creator */}
            <div className="flex items-center gap-3 mb-6">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={creatorName}
                  className="h-12 w-12 rounded-full object-cover border border-[hsl(var(--border))]"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-[hsl(var(--primary)/0.12)] flex items-center justify-center text-[hsl(var(--primary))]">
                  <Video size={22} />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Videochamada com
                </p>
                <p className="text-base font-semibold text-[hsl(var(--foreground))] truncate">
                  {creatorName}
                </p>
              </div>
            </div>

            {/* ── Idle (escolher duração + solicitar) ── */}
            {state === 'idle' && (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-3">
                    Escolha a duração
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {([30, 60] as Duration[]).map((opt) => {
                      const optPrice = opt === 30 ? pricePer30Min : pricePer1Hr
                      const disabled = !optPrice || Number(optPrice) <= 0
                      const active = duration === opt
                      return (
                        <button
                          key={opt}
                          type="button"
                          disabled={disabled}
                          onClick={() => setDuration(opt)}
                          className={[
                            'rounded-xl p-4 text-left transition-all border',
                            active
                              ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)]'
                              : 'border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] hover:border-[hsl(var(--primary)/0.5)]',
                            disabled ? 'opacity-50 cursor-not-allowed' : '',
                          ].join(' ')}
                        >
                          <p className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                            <Clock size={12} />
                            {opt === 60 ? '1 hora' : '30 minutos'}
                          </p>
                          <p className="mt-1 text-base font-semibold text-[hsl(var(--foreground))]">
                            {optPrice ? formatCurrency(Number(optPrice)) : '—'}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRequest}
                  disabled={!price || Number(price) <= 0}
                  className="w-full rounded-xl py-3 text-sm font-semibold text-white
                    bg-[hsl(var(--primary))] hover:brightness-110
                    disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Solicitar videochamada
                </button>

                <p className="text-[11px] text-[hsl(var(--muted-foreground))] text-center">
                  Você só paga após o creator aceitar a solicitação.
                </p>
              </div>
            )}

            {/* ── Requesting (enviando) ── */}
            {state === 'requesting' && (
              <div className="flex flex-col items-center gap-3 py-10">
                <Loader2 className="animate-spin text-[hsl(var(--primary))]" size={32} />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Enviando solicitação…
                </p>
              </div>
            )}

            {/* ── Waiting accept ── */}
            {state === 'waiting_accept' && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="w-14 h-14 rounded-full bg-[hsl(var(--primary)/0.12)] flex items-center justify-center">
                  <Loader2 className="animate-spin text-[hsl(var(--primary))]" size={28} />
                </div>
                <p className="text-base font-semibold text-[hsl(var(--foreground))]">
                  Aguardando o creator aceitar…
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Expira em <span className="font-semibold text-[hsl(var(--foreground))]">{formatCountdown(countdownMs)}</span>
                </p>
                <button
                  type="button"
                  onClick={handleCancelRequest}
                  className="mt-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* ── Awaiting payment ── */}
            {state === 'awaiting_payment' && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <CheckCircle2 className="text-emerald-400" size={32} />
                </div>
                <p className="text-base font-semibold text-[hsl(var(--foreground))]">
                  Creator aceitou!
                </p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Finalize o pagamento para abrir a sala.
                </p>
                <button
                  type="button"
                  onClick={handlePay}
                  className="w-full rounded-xl py-3 text-sm font-semibold text-white
                    bg-[hsl(var(--primary))] hover:brightness-110 transition-all"
                >
                  Pagar {formatCurrency(currentPrice)}
                </button>
                <button
                  type="button"
                  onClick={handleCancelRequest}
                  className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* ── Rejected ── */}
            {state === 'rejected' && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
                  <Ban className="text-red-400" size={30} />
                </div>
                <p className="text-base font-semibold text-[hsl(var(--foreground))]">
                  Solicitação recusada
                </p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  O creator recusou sua solicitação desta vez.
                </p>
                <button
                  onClick={onClose}
                  className="mt-3 px-6 py-2 rounded-xl text-sm font-semibold
                    bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]
                    hover:bg-[hsl(var(--secondary)/0.8)] transition-colors"
                >
                  Fechar
                </button>
              </div>
            )}

            {/* ── Expired ── */}
            {state === 'expired' && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center">
                  <TimerReset className="text-amber-400" size={30} />
                </div>
                <p className="text-base font-semibold text-[hsl(var(--foreground))]">
                  Sem resposta do creator
                </p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  A solicitação expirou antes de ser aceita. Tente novamente mais tarde.
                </p>
                <button
                  onClick={onClose}
                  className="mt-3 px-6 py-2 rounded-xl text-sm font-semibold
                    bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]
                    hover:bg-[hsl(var(--secondary)/0.8)] transition-colors"
                >
                  Fechar
                </button>
              </div>
            )}

            {/* ── Paid ── */}
            {state === 'paid' && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <CheckCircle2 className="text-emerald-400" size={32} />
                </div>
                <p className="text-base font-semibold text-[hsl(var(--foreground))]">
                  Pagamento confirmado
                </p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  A sala já está liberada para ambos.
                </p>
                <a
                  href={`/calls/${callId}`}
                  className="mt-3 inline-flex items-center justify-center gap-2 w-full
                    rounded-xl py-3 text-sm font-semibold text-white
                    bg-[hsl(var(--primary))] hover:brightness-110 transition-all"
                >
                  <Video size={16} /> Entrar na sala
                </a>
              </div>
            )}

            {/* ── Cancelled ── */}
            {state === 'cancelled' && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="w-14 h-14 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center">
                  <Ban className="text-[hsl(var(--muted-foreground))]" size={28} />
                </div>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Solicitação cancelada.
                </p>
                <button
                  onClick={onClose}
                  className="mt-3 px-6 py-2 rounded-xl text-sm font-semibold
                    bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]
                    hover:bg-[hsl(var(--secondary)/0.8)] transition-colors"
                >
                  Fechar
                </button>
              </div>
            )}

            {/* ── Error ── */}
            {state === 'error' && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
                  <AlertCircle className="text-red-400" size={30} />
                </div>
                <p className="text-sm text-[hsl(var(--foreground))] break-words">
                  {errorMessage ?? 'Algo deu errado.'}
                </p>
                <button
                  onClick={onClose}
                  className="mt-3 px-6 py-2 rounded-xl text-sm font-semibold
                    bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]
                    hover:bg-[hsl(var(--secondary)/0.8)] transition-colors"
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
