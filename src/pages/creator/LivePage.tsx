import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Radio, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { generateToken, ZegoUIKitPrebuilt } from '@/lib/zegocloud'
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
  const [status, setStatus] = useState<'loading' | 'no-ticket' | 'joined' | 'error'>('loading')
  const containerRef = useRef<HTMLDivElement>(null)
  const zegoRef = useRef<InstanceType<typeof ZegoUIKitPrebuilt> | null>(null)

  const { data: live, isError } = useQuery({
    queryKey: ['live-stream', id],
    queryFn: () => fetchLive(id!),
    enabled: !!id,
  })

  useEffect(() => {
    if (!live || !user?.id || !containerRef.current) return

    let cancelled = false

    async function joinLive() {
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
    }

    joinLive().catch(() => {
      if (!cancelled) setStatus('error')
    })

    return () => {
      cancelled = true
      if (zegoRef.current) {
        zegoRef.current.destroy()
        zegoRef.current = null
      }
    }
  }, [live, user?.id])

  return (
    <>
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
