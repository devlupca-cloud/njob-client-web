import { useEffect, useMemo, useState } from 'react'
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
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const { session } = useAuthStore()

  const [duration, setDuration] = useState<Duration>(30)
  const [state, setState] = useState<FlowState>('idle')
  const [callId, setCallId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Observa o status da call depois que é criada.
  const { call } = useCallStatus(callId)

  // Reage à mudança de status (creator aceita / recusa / expira).
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

  // Reset ao fechar.
  useEffect(() => {
    if (isOpen) return
    setState('idle')
    setCallId(null)
    setErrorMessage(null)
    setDuration(30)
  }, [isOpen])

  // Countdown local (expira 2 min após criação).
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

  if (!isOpen) return null

  const handleRequest = async () => {
    if (!session?.user) {
      setErrorMessage(t('booking.loginRequired') ?? 'Faça login para solicitar')
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
        setErrorMessage('Não foi possível criar a solicitação')
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
        setErrorMessage(json?.error ?? 'Falha ao iniciar pagamento')
        setState('error')
        return
      }
      window.location.href = json.checkoutUrl
    } catch (err) {
      setErrorMessage((err as Error).message)
      setState('error')
    }
  }

  const handleCancel = async () => {
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60"
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={creatorName}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Video size={20} />
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500">
                {t('booking.title') ?? 'Videochamada com'}
              </p>
              <p className="text-base font-semibold text-gray-900">{creatorName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={state === 'waiting_accept' ? handleCancel : onClose}
            className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {state === 'idle' && (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">
                {t('booking.chooseDuration') ?? 'Escolha a duração'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {([30, 60] as Duration[]).map((opt) => {
                  const optPrice = opt === 30 ? pricePer30Min : pricePer1Hr
                  const disabled = !optPrice || Number(optPrice) <= 0
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={disabled}
                      onClick={() => setDuration(opt)}
                      className={[
                        'rounded-xl border p-4 text-left transition-colors',
                        duration === opt
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-gray-300',
                        disabled ? 'opacity-50 cursor-not-allowed' : '',
                      ].join(' ')}
                    >
                      <p className="text-xs text-gray-500">
                        <Clock size={12} className="inline mr-1" />
                        {opt === 60 ? '1 hora' : '30 minutos'}
                      </p>
                      <p className="mt-1 text-base font-semibold text-gray-900">
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
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t('booking.request') ?? 'Solicitar videochamada'}
            </button>
          </div>
        )}

        {state === 'requesting' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="animate-spin text-primary" size={32} />
            <p className="text-sm text-gray-600">
              {t('booking.sendingRequest') ?? 'Enviando solicitação…'}
            </p>
          </div>
        )}

        {state === 'waiting_accept' && (
          <div className="space-y-4 text-center py-4">
            <Loader2 className="animate-spin text-primary mx-auto" size={32} />
            <p className="text-sm font-medium text-gray-800">
              {t('booking.waitingAccept') ?? 'Aguardando o creator aceitar…'}
            </p>
            <p className="text-xs text-gray-500">
              {t('booking.countdown', { time: formatCountdown(countdownMs) }) ??
                `Expira em ${formatCountdown(countdownMs)}`}
            </p>
            <button
              type="button"
              onClick={handleCancel}
              className="text-sm text-red-600 hover:underline"
            >
              {t('common.cancel') ?? 'Cancelar'}
            </button>
          </div>
        )}

        {state === 'awaiting_payment' && (
          <div className="space-y-4 text-center py-2">
            <CheckCircle2 className="text-emerald-500 mx-auto" size={40} />
            <p className="text-base font-semibold text-gray-900">
              {t('booking.accepted') ?? 'Creator aceitou!'}
            </p>
            <p className="text-sm text-gray-600">
              {t('booking.payToJoin') ??
                'Finalize o pagamento para liberar a sala.'}
            </p>
            <button
              type="button"
              onClick={handlePay}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white"
            >
              {t('booking.payNow', { price: formatCurrency(currentPrice) }) ??
                `Pagar ${formatCurrency(currentPrice)}`}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="text-sm text-gray-500 hover:underline"
            >
              {t('common.cancel') ?? 'Cancelar'}
            </button>
          </div>
        )}

        {state === 'rejected' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Ban className="text-red-500" size={40} />
            <p className="text-base font-semibold text-gray-900">
              {t('booking.rejected') ?? 'Solicitação recusada'}
            </p>
            <p className="text-sm text-gray-600">
              {t('booking.rejectedDescription') ??
                'O creator recusou sua solicitação.'}
            </p>
            <button
              onClick={onClose}
              className="mt-2 rounded-xl bg-gray-900 px-6 py-2 text-sm text-white"
            >
              {t('common.close') ?? 'Fechar'}
            </button>
          </div>
        )}

        {state === 'expired' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <TimerReset className="text-amber-500" size={40} />
            <p className="text-base font-semibold text-gray-900">
              {t('booking.expired') ?? 'Creator não respondeu a tempo'}
            </p>
            <button
              onClick={onClose}
              className="mt-2 rounded-xl bg-gray-900 px-6 py-2 text-sm text-white"
            >
              {t('common.close') ?? 'Fechar'}
            </button>
          </div>
        )}

        {state === 'paid' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="text-emerald-500" size={40} />
            <p className="text-base font-semibold text-gray-900">
              {t('booking.paid') ?? 'Pagamento confirmado'}
            </p>
            <a
              href={`/calls/${callId}`}
              className="mt-2 rounded-xl bg-primary px-6 py-2 text-sm font-semibold text-white"
            >
              {t('booking.enterRoom') ?? 'Entrar na sala'}
            </a>
          </div>
        )}

        {state === 'cancelled' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Ban className="text-gray-400" size={40} />
            <p className="text-sm text-gray-600">
              {t('booking.cancelled') ?? 'Solicitação cancelada'}
            </p>
            <button
              onClick={onClose}
              className="mt-2 rounded-xl bg-gray-900 px-6 py-2 text-sm text-white"
            >
              {t('common.close') ?? 'Fechar'}
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertCircle className="text-red-500" size={40} />
            <p className="text-sm text-gray-700">
              {errorMessage ?? t('common.error') ?? 'Algo deu errado'}
            </p>
            <button
              onClick={onClose}
              className="mt-2 rounded-xl bg-gray-900 px-6 py-2 text-sm text-white"
            >
              {t('common.close') ?? 'Fechar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
