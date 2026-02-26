import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Video, Loader2, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { generateToken, ZegoUIKitPrebuilt } from '@/lib/zegocloud'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallInfo {
  id: string
  creator_id: string
  user_id: string
  scheduled_start_time: string
  scheduled_duration_minutes: number
  status: string
  creator_name: string
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCall(callId: string, userId: string): Promise<CallInfo> {
  const { data, error } = await supabase
    .from('one_on_one_calls')
    .select('id, creator_id, user_id, scheduled_start_time, scheduled_duration_minutes, status, profiles!creator_id(full_name)')
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
    creator_name: (data as any).profiles?.full_name ?? 'Creator',
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCallWindow(call: CallInfo): 'open' | 'ended' {
  const now = Date.now()
  const start = new Date(call.scheduled_start_time).getTime()
  const end = start + call.scheduled_duration_minutes * 60 * 1000

  if (now > end) return 'ended'
  return 'open'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CallRoomPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const { t } = useTranslation()
  const [joined, setJoined] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const zegoRef = useRef<InstanceType<typeof ZegoUIKitPrebuilt> | null>(null)

  const { data: call, isLoading, isError, error } = useQuery({
    queryKey: ['call-room', id],
    queryFn: () => fetchCall(id!, user!.id),
    enabled: !!id && !!user?.id,
  })

  const callWindow = call ? getCallWindow(call) : null

  useEffect(() => {
    if (!call || !user?.id || !containerRef.current || callWindow !== 'open') return

    let cancelled = false

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
          navigate('/purchases')
        },
      })

      setJoined(true)
    }

    joinRoom().catch((err) => {
      console.error('Error joining call room:', err)
    })

    return () => {
      cancelled = true
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
