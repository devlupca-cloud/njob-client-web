import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Radio, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/Toast'
import { generateToken, ZegoUIKitPrebuilt } from '@/lib/zegocloud'
import { observeZegoTranslation } from '@/lib/zegoI18n'
import type { LiveStream } from '@/types'

async function fetchLive(id: string): Promise<LiveStream> {
  const { data, error } = await supabase
    .from('live_streams')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as LiveStream
}

async function checkTicket(liveId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('live_stream_tickets')
    .select('id')
    .eq('live_stream_id', liveId)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .maybeSingle()
  return !!data
}

export default function LivePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, user } = useAuthStore()
  const { toast } = useToast()
  const { i18n } = useTranslation()
  const [status, setStatus] = useState<'loading' | 'no-ticket' | 'not-started' | 'ended' | 'joined' | 'error'>('loading')
  const containerRef = useRef<HTMLDivElement>(null)
  const zegoRef = useRef<InstanceType<typeof ZegoUIKitPrebuilt> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endedRef = useRef(false)

  // Traduz a UI do ZegoCloud UIKit (SDK só vem em en/zh).
  useEffect(() => {
    if (!containerRef.current) return
    return observeZegoTranslation(containerRef.current, i18n.language)
  }, [i18n.language])

  const { data: live, isError } = useQuery({
    queryKey: ['live-stream', id],
    queryFn: () => fetchLive(id!),
    enabled: !!id,
    // Enquanto a live ainda não começou, refaz a consulta a cada 3s para
    // detectar quando o host entra na sala (status vira 'live'). Sem isso, o
    // espectador que abre a tela antes do host fica preso em "não começou"
    // até dar F5. Para de pollar assim que entra na sala ou a live termina.
    refetchInterval: status === 'loading' || status === 'not-started' ? 3000 : false,
  })

  useEffect(() => {
    if (!live || !user?.id || !containerRef.current) return

    let cancelled = false
    endedRef.current = false

    // Sai da live quando a duração acaba (espectador). Idempotente.
    const endView = () => {
      if (endedRef.current) return
      endedRef.current = true
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (zegoRef.current) {
        try {
          zegoRef.current.destroy()
        } catch {
          /* noop */
        }
        zegoRef.current = null
      }
      toast({ title: 'A live foi encerrada.', type: 'info' })
      navigate(-1)
    }

    async function joinLive() {
      // Gate de status: só entra se a live está realmente AO VIVO. Em
      // scheduled o host ainda nem entrou — espectador ficaria preso em
      // sala vazia. Em finished/cancelled a sala não existe mais.
      const liveStatus = (live as unknown as { status?: string }).status
      if (liveStatus === 'finished' || liveStatus === 'cancelled') {
        setStatus('ended')
        return
      }
      if (liveStatus !== 'live') {
        setStatus('not-started')
        return
      }

      const isFree = !live!.ticket_price

      // Verifica ingresso se for paga
      if (!isFree) {
        const hasTicket = await checkTicket(live!.id, user!.id)
        if (!hasTicket) {
          setStatus('no-ticket')
          return
        }
      }

      if (cancelled) return

      // Gera token e entra na live como viewer
      const userName = profile?.full_name ?? user!.email?.split('@')[0] ?? 'Viewer'
      const token = await generateToken(live!.id, user!.id, userName)

      const zp = ZegoUIKitPrebuilt.create(token)
      zegoRef.current = zp

      zp.joinRoom({
        container: containerRef.current!,
        scenario: {
          mode: ZegoUIKitPrebuilt.LiveStreaming,
          config: {
            role: ZegoUIKitPrebuilt.Audience,
          },
        },
        showPreJoinView: false,
        showLeavingView: false,
        showRoomTimer: true,
        onLeaveRoom: () => {
          navigate(-1)
        },
      })

      setStatus('joined')

      // Timer de encerramento: actual_start_time (host iniciou) + duração
      // estimada (30/60 min). Se o host ainda não iniciou, não arma o timer.
      const liveRow = live! as unknown as {
        actual_start_time: string | null
        estimated_duration_minutes: number | null
      }
      if (liveRow.actual_start_time && liveRow.estimated_duration_minutes) {
        const endAt =
          new Date(liveRow.actual_start_time).getTime() +
          liveRow.estimated_duration_minutes * 60_000
        let warned = false
        timerRef.current = setInterval(() => {
          const remaining = endAt - Date.now()
          if (remaining <= 60_000 && remaining > 0 && !warned) {
            warned = true
            toast({ title: 'A live encerra em 1 minuto.', type: 'warning' })
          }
          if (remaining <= 0) endView()
        }, 1000)
      }
    }

    joinLive().catch(() => {
      if (!cancelled) setStatus('error')
    })

    return () => {
      cancelled = true
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (zegoRef.current) {
        zegoRef.current.destroy()
        zegoRef.current = null
      }
    }
  }, [live, user?.id])

  return (
    <>
      {/* Not-started overlay — live ainda não começou */}
      {status === 'not-started' && (
        <div className="fixed inset-0 z-[60] bg-[hsl(var(--background))] flex flex-col min-h-screen">
          <Header onBack={() => navigate(-1)} />
          <main className="flex-1 flex items-center justify-center px-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Radio size={28} className="text-amber-500" />
              </div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                A live ainda não começou
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Aguarde o creator iniciar a transmissão.
              </p>
              <button
                onClick={() => navigate(-1)}
                className="mt-6 px-6 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
              >
                Voltar ao perfil
              </button>
            </div>
          </main>
        </div>
      )}

      {/* Ended overlay — live já encerrou */}
      {status === 'ended' && (
        <div className="fixed inset-0 z-[60] bg-[hsl(var(--background))] flex flex-col min-h-screen">
          <Header onBack={() => navigate(-1)} />
          <main className="flex-1 flex items-center justify-center px-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[hsl(var(--muted))]/20 flex items-center justify-center">
                <Radio size={28} className="text-[hsl(var(--muted-foreground))]" />
              </div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                Esta live já encerrou
              </p>
              <button
                onClick={() => navigate(-1)}
                className="mt-6 px-6 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
              >
                Voltar ao perfil
              </button>
            </div>
          </main>
        </div>
      )}

      {/* No-ticket overlay */}
      {status === 'no-ticket' && (
        <div className="fixed inset-0 z-[60] bg-[hsl(var(--background))] flex flex-col min-h-screen">
          <Header onBack={() => navigate(-1)} />
          <main className="flex-1 flex items-center justify-center px-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
                <ShieldAlert size={28} className="text-amber-500" />
              </div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                Ingresso necessario
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Voce precisa comprar um ingresso para acessar essa live.
              </p>
              <button
                onClick={() => navigate(-1)}
                className="mt-6 px-6 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
              >
                Voltar ao perfil
              </button>
            </div>
          </main>
        </div>
      )}

      {/* Error overlay */}
      {(isError || status === 'error') && (
        <div className="fixed inset-0 z-[60] bg-[hsl(var(--background))] flex flex-col min-h-screen">
          <Header onBack={() => navigate(-1)} />
          <main className="flex-1 flex items-center justify-center px-8">
            <div className="text-center">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Nao foi possivel carregar a live. Tente novamente.
              </p>
              <button
                onClick={() => navigate(-1)}
                className="mt-4 text-sm text-[hsl(var(--primary))] underline"
              >
                Voltar
              </button>
            </div>
          </main>
        </div>
      )}

      {/* Loading overlay */}
      {status === 'loading' && (
        <div className="fixed inset-0 z-[60] bg-[hsl(var(--background))] flex flex-col min-h-screen">
          <Header onBack={() => navigate(-1)} />
          <main className="flex-1 flex items-center justify-center px-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                <Radio size={28} className="text-red-500 animate-pulse" />
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Conectando a live...
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
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-red-500" />
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">Live</span>
        </div>
      </div>
    </header>
  )
}
