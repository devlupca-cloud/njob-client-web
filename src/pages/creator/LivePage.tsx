import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Radio, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { LiveStream } from '@/types'

const LIVE_CANVAS_BASE = 'https://live-canvas-vue.lovable.app'

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
  const [status, setStatus] = useState<'loading' | 'no-ticket' | 'redirecting' | 'error'>('loading')

  const { data: live, isError } = useQuery({
    queryKey: ['live-stream', id],
    queryFn: () => fetchLive(id!),
    enabled: !!id,
  })

  useEffect(() => {
    if (!live || !user?.id) return

    async function enter() {
      const isFree = !live!.ticket_price
      const isLive = live!.status === 'live'

      // Se é pago, verifica ticket
      if (!isFree) {
        const hasTicket = await checkTicket(live!.id, user!.id)
        if (!hasTicket) {
          setStatus('no-ticket')
          return
        }
      }

      // Redireciona para live-canvas
      const userName = profile?.full_name ?? user!.email?.split('@')[0] ?? 'Viewer'
      const url = `${LIVE_CANVAS_BASE}/live?room=${live!.id}&mode=viewer&userName=${encodeURIComponent(userName)}&userID=${user!.id}`

      setStatus('redirecting')

      if (isLive) {
        // Live ativa — redireciona direto
        window.location.href = url
      } else {
        // Live agendada — abre em nova aba
        window.open(url, '_blank', 'noopener,noreferrer')
        navigate(-1)
      }
    }

    enter().catch(() => setStatus('error'))
  }, [live, user?.id])

  if (isError || status === 'error') {
    return (
      <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">
        <Header onBack={() => navigate(-1)} />
        <main className="flex-1 flex items-center justify-center px-8">
          <div className="text-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Não foi possível carregar a live. Tente novamente.
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
    )
  }

  if (status === 'no-ticket') {
    return (
      <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">
        <Header onBack={() => navigate(-1)} />
        <main className="flex-1 flex items-center justify-center px-8">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
              <ShieldAlert size={28} className="text-amber-500" />
            </div>
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">
              Ingresso necessário
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Você precisa comprar um ingresso para acessar essa live.
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
    )
  }

  // Loading / redirecting
  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">
      <Header onBack={() => navigate(-1)} />
      <main className="flex-1 flex items-center justify-center px-8">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <Radio size={28} className="text-red-500 animate-pulse" />
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {status === 'redirecting' ? 'Entrando na live...' : 'Conectando à live...'}
          </p>
        </div>
      </main>
    </div>
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
