import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Video, Loader2, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/Toast'
import { generateToken, ZegoUIKitPrebuilt } from '@/lib/zegocloud'
import { observeZegoTranslation } from '@/lib/zegoI18n'
import { POST_PAID_CALL_WINDOW_MS, LEGACY_CALL_GRACE_MS } from '@/lib/timeWindows'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallInfo {
  id: string
  creator_id: string
  user_id: string
  scheduled_start_time: string | null
  scheduled_duration_minutes: number
  status: string
  paid_at: string | null
  creator_name: string
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCall(callId: string, userId: string): Promise<CallInfo> {
  const { data, error } = await supabase
    .from('one_on_one_calls')
    .select('id, creator_id, user_id, scheduled_start_time, scheduled_duration_minutes, status, paid_at, profiles!creator_id(full_name)')
    .eq('id', callId)
    .single()

  if (error) throw error

  // Verifica que o usuario e o dono da chamada
  if (data.user_id !== userId) {
    throw new Error('unauthorized')
  }

  return {
    id: data.id,
    creator_id: data.creator_id,
    user_id: data.user_id,
    scheduled_start_time: data.scheduled_start_time,
    scheduled_duration_minutes: data.scheduled_duration_minutes,
    status: data.status,
    paid_at: (data as { paid_at?: string | null }).paid_at ?? null,
    creator_name: (data as any).profiles?.full_name ?? 'Creator',
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type CallWindow = 'open' | 'ended' | 'not_ready'

function getCallWindow(call: CallInfo): CallWindow {
  if (call.status === 'requested' || call.status === 'awaiting_payment') {
    return 'not_ready'
  }

  if (call.status === 'paid' && call.paid_at) {
    const paidAt = new Date(call.paid_at).getTime()
    if (Date.now() > paidAt + POST_PAID_CALL_WINDOW_MS) return 'ended'
    return 'open'
  }

  if (call.status === 'confirmed' && call.scheduled_start_time) {
    const start = new Date(call.scheduled_start_time).getTime()
    const end = start + call.scheduled_duration_minutes * 60 * 1000
    if (Date.now() > end + LEGACY_CALL_GRACE_MS) return 'ended'
    return 'open'
  }

  return 'ended'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CallRoomPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [joined, setJoined] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const zegoRef = useRef<InstanceType<typeof ZegoUIKitPrebuilt> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endedRef = useRef(false)

  const { data: call, isLoading, isError, error } = useQuery({
    queryKey: ['call-room', id],
    queryFn: () => fetchCall(id!, user!.id),
    enabled: !!id && !!user?.id,
    // Enquanto a call ainda está em requested/awaiting_payment, polling de 3s
    // garante que pegamos o webhook flipando p/ 'paid' mesmo se Realtime atrasar.
    refetchInterval: (q) => {
      const status = q.state.data?.status
      return status === 'requested' || status === 'awaiting_payment' ? 3000 : false
    },
  })

  const callWindow = call ? getCallWindow(call) : null

  // Realtime sempre ativo: pega awaiting_payment → paid (webhook do Stripe)
  // sem depender do polling. Roda em paralelo ao useEffect de Zego abaixo,
  // que só assina quando a sala já está open.
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`call-status:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'one_on_one_calls',
          filter: `id=eq.${id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['call-room', id] })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [id, queryClient])

  // Traduz a UI do ZegoCloud UIKit (SDK só vem em en/zh).
  useEffect(() => {
    if (!containerRef.current) return
    return observeZegoTranslation(containerRef.current, i18n.language)
  }, [i18n.language])

  useEffect(() => {
    if (!call || !user?.id || !containerRef.current || callWindow !== 'open') return

    let cancelled = false
    endedRef.current = false

    // Encerra a sala quando a duração comprada acaba. Idempotente.
    const endCall = () => {
      if (endedRef.current) return
      endedRef.current = true
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      void supabase
        .from('one_on_one_calls')
        .update({ status: 'completed', actual_end_time: new Date().toISOString() })
        .eq('id', call!.id)
      if (zegoRef.current) {
        try {
          zegoRef.current.destroy()
        } catch {
          /* noop */
        }
        zegoRef.current = null
      }
      toast({ title: 'Tempo da videochamada encerrado.', type: 'info' })
      navigate('/purchases')
    }

    async function joinRoom() {
      if (cancelled) return

      const userName = profile?.full_name ?? user!.email?.split('@')[0] ?? 'Cliente'
      // Room ID = call ID para que creator e cliente entrem na mesma sala
      const token = await generateToken(call!.id, user!.id, userName)

      const zp = ZegoUIKitPrebuilt.create(token)
      zegoRef.current = zp

      zp.joinRoom({
        container: containerRef.current!,
        scenario: {
          mode: ZegoUIKitPrebuilt.OneONoneCall,
        },
        showPreJoinView: true,
        showLeavingView: false,
        showRoomTimer: true,
        turnOnMicrophoneWhenJoining: true,
        turnOnCameraWhenJoining: true,
        onLeaveRoom: () => {
          void supabase
            .from('one_on_one_calls')
            .update({
              status: 'completed',
              actual_end_time: new Date().toISOString(),
            })
            .eq('id', call!.id)
          navigate('/purchases')
        },
      })

      // Marca/lê o início real via RPC (idempotente, bypassa RLS, retorna o
      // timestamp canônico de quem entrou primeiro). Fallback p/ agora se falhar.
      const { data: startedIso } = await supabase.rpc('fn_mark_call_started', {
        p_call_id: call!.id,
      })
      const startMs = startedIso ? new Date(startedIso as string).getTime() : Date.now()
      const endAt = startMs + call!.scheduled_duration_minutes * 60_000

      let warned = false
      timerRef.current = setInterval(() => {
        const remaining = endAt - Date.now()
        if (remaining <= 60_000 && remaining > 0 && !warned) {
          warned = true
          toast({ title: 'A videochamada encerra em 1 minuto.', type: 'warning' })
        }
        if (remaining <= 0) endCall()
      }, 1000)

      setJoined(true)
    }

    joinRoom().catch((err) => {
      console.error('Error joining call room:', err)
    })

    // Realtime: se o OUTRO lado encerrar (status='completed'), saio também.
    // Sem isso o cliente fica preso na sala quando o creator sai (token Zego
    // vale 2h, então a sala não cai sozinha).
    const channel = supabase
      .channel(`call-room:${call!.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'one_on_one_calls',
          filter: `id=eq.${call!.id}`,
        },
        (payload) => {
          const next = (payload.new ?? null) as { status?: string } | null
          if (next?.status === 'completed' || next?.status === 'cancelled_by_creator' || next?.status === 'cancelled_by_user') {
            endCall()
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (zegoRef.current) {
        zegoRef.current.destroy()
        zegoRef.current = null
      }
    }
  }, [call, user?.id, callWindow])

  return (
    <>
      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-[60] bg-[hsl(var(--background))] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--primary))]" />
        </div>
      )}

      {/* Error / Unauthorized overlay */}
      {isError && (
        <div className="fixed inset-0 z-[60] bg-[hsl(var(--background))] flex flex-col min-h-screen">
          <Header onBack={() => navigate(-1)} />
          <main className="flex-1 flex items-center justify-center px-8">
            <div className="text-center">
              <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {(error as Error)?.message === 'unauthorized'
                  ? t('callRoom.unauthorized')
                  : t('callRoom.loadError')}
              </p>
              <button
                onClick={() => navigate('/purchases')}
                className="mt-4 text-sm text-[hsl(var(--primary))] underline"
              >
                {t('callRoom.goToPurchases')}
              </button>
            </div>
          </main>
        </div>
      )}

      {/* Not-ready overlay: call ainda em requested/awaiting_payment */}
      {!isLoading && !isError && callWindow === 'not_ready' && (
        <div className="fixed inset-0 z-[60] bg-[hsl(var(--background))] flex flex-col min-h-screen">
          <Header onBack={() => navigate(-1)} />
          <main className="flex-1 flex items-center justify-center px-8">
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--primary))] mx-auto mb-3" />
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                {t('callRoom.notReady')}
              </p>
              <button
                onClick={() => navigate('/purchases')}
                className="mt-6 px-6 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-semibold"
              >
                {t('callRoom.seePurchases')}
              </button>
            </div>
          </main>
        </div>
      )}

      {/* Ended overlay */}
      {callWindow === 'ended' && (
        <div className="fixed inset-0 z-[60] bg-[hsl(var(--background))] flex flex-col min-h-screen">
          <Header onBack={() => navigate(-1)} />
          <main className="flex-1 flex items-center justify-center px-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center">
                <Video size={28} className="text-[hsl(var(--muted-foreground))]" />
              </div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                {t('callRoom.callEnded')}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                {t('callRoom.callPast')}
              </p>
              <button
                onClick={() => navigate('/purchases')}
                className="mt-6 px-6 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-semibold"
              >
                {t('callRoom.seePurchases')}
              </button>
            </div>
          </main>
        </div>
      )}

      {/* Connecting overlay */}
      {!isLoading && !isError && callWindow === 'open' && !joined && (
        <div className="fixed inset-0 z-[60] bg-[hsl(var(--background))] flex flex-col min-h-screen">
          <Header onBack={() => navigate(-1)} />
          <main className="flex-1 flex items-center justify-center px-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Video size={28} className="text-emerald-500 animate-pulse" />
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {t('callRoom.connecting', { creatorName: call!.creator_name })}
              </p>
            </div>
          </main>
        </div>
      )}

      {/* Container persistente do ZegoCloud — nunca e desmontado */}
      <div className="fixed inset-0 z-50 bg-black">
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </>
  )
}

function Header({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()

  return (
    <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] px-4 pt-4 pb-3">
      <div className="relative flex items-center justify-center h-7">
        <button
          onClick={onBack}
          className="absolute left-0 w-7 h-7 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
          aria-label={t('callRoom.back')}
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-base font-semibold text-[hsl(var(--foreground))]">
          {t('callRoom.title')}
        </span>
      </div>
    </header>
  )
}
