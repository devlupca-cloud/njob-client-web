import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Video,
  Calendar,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreatorCallInfo {
  id: string
  full_name: string
  avatar_url: string | null
  call_per_30_min: number
  call_per_1_hr: number
}

interface AvailabilityDate {
  id: string
  availability_date: string
  slots: AvailabilitySlot[]
}

interface AvailabilitySlot {
  id: string
  slot_time: string
  purchased: boolean
}

type Duration = 30 | 60

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
}

function formatTime(time: string): string {
  return time.slice(0, 5)
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCallData(creatorId: string): Promise<{
  creator: CreatorCallInfo
  dates: AvailabilityDate[]
}> {
  const [profileRes, settingsRes, availabilityRes, livesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', creatorId)
      .single(),
    supabase
      .from('profile_settings')
      .select('call_per_30_min, call_per_1_hr')
      .eq('profile_id', creatorId)
      .single(),
    // Use local date (not UTC) — availability_date is stored as local date
    (() => {
      const now = new Date()
      const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      return supabase
        .from('creator_availability')
        .select('id, availability_date, creator_availability_slots(id, slot_time, purchased)')
        .eq('creator_id', creatorId)
        .gte('availability_date', localToday)
        .order('availability_date', { ascending: true })
    })(),
    supabase
      .from('live_streams')
      .select('scheduled_start_time, estimated_duration_minutes')
      .eq('creator_id', creatorId)
      .in('status', ['scheduled', 'live'])
      .gte('scheduled_start_time', new Date().toISOString())
      .limit(30),
  ])

  if (profileRes.error) throw profileRes.error

  const creator: CreatorCallInfo = {
    id: profileRes.data.id,
    full_name: profileRes.data.full_name ?? 'Creator',
    avatar_url: profileRes.data.avatar_url,
    call_per_30_min: settingsRes.data?.call_per_30_min ?? 0,
    call_per_1_hr: settingsRes.data?.call_per_1_hr ?? 0,
  }

  // Monta set de horarios bloqueados por lives
  const blockedSlots = new Set<string>()
  for (const live of livesRes.data ?? []) {
    const start = new Date(live.scheduled_start_time)
    const durationMs = (live.estimated_duration_minutes ?? 60) * 60 * 1000
    const end = new Date(start.getTime() + durationMs)

    const dateKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    let cursor = new Date(start)
    while (cursor < end) {
      const hh = String(cursor.getHours()).padStart(2, '0')
      const mm = String(cursor.getMinutes()).padStart(2, '0')
      blockedSlots.add(`${dateKey}_${hh}:${mm}`)
      cursor = new Date(cursor.getTime() + 30 * 60 * 1000)
    }
  }

  // Filtra disponibilidade: remove slots comprados e bloqueados por lives
  const dates: AvailabilityDate[] = []
  for (const av of availabilityRes.data ?? []) {
    const slots = ((av as any).creator_availability_slots ?? [])
      .filter((s: any) => {
        if (s.purchased) return false
        const timeKey = `${av.availability_date}_${formatTime(s.slot_time)}`
        return !blockedSlots.has(timeKey)
      })
      .sort((a: any, b: any) => a.slot_time.localeCompare(b.slot_time))

    if (slots.length > 0) {
      dates.push({
        id: av.id,
        availability_date: av.availability_date,
        slots,
      })
    }
  }

  return { creator, dates }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewCallPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const creatorId = searchParams.get('creatorId')
  const { user, session } = useAuthStore()

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [duration, setDuration] = useState<Duration>(30)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['call-availability', creatorId],
    queryFn: () => fetchCallData(creatorId!),
    enabled: !!creatorId,
  })

  const selectedDateData = data?.dates.find((d) => d.availability_date === selectedDate)
  const price = data?.creator
    ? duration === 60
      ? data.creator.call_per_1_hr
      : data.creator.call_per_30_min
    : 0

  const handleCheckout = async () => {
    const userId = user?.id || session?.user?.id
    if (!userId || !creatorId || !selectedSlot || !selectedDate) return

    setIsCheckingOut(true)
    setError(null)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) {
        setError('Sessão expirada. Faça login novamente.')
        return
      }

      const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin).trim()

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            creator_id: creatorId,
            product_id: selectedSlot.id,
            product_type: 'video-call',
            duration,
            success_url: `${appUrl}/purchases`,
            cancel_url: `${appUrl}/home`,
          }),
        }
      )

      const json = await res.json()

      if (!json.success || !json.checkoutUrl) {
        throw new Error(json.error || 'Checkout error')
      }

      window.location.href = json.checkoutUrl
    } catch (err: any) {
      console.error('[NewCallPage] Checkout error:', err)
      setError(err?.message || 'Erro ao agendar chamada. Tente novamente.')
    } finally {
      setIsCheckingOut(false)
    }
  }

  if (!creatorId) {
    return (
      <div className="flex flex-col min-h-screen bg-[hsl(var(--background))]">
        <Header onBack={() => navigate(-1)} />
        <main className="flex-1 flex items-center justify-center px-8">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Creator nao encontrado.</p>
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-[hsl(var(--background))]">
      <Header onBack={() => navigate(-1)} />

      {/* Loading */}
      {isLoading && (
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--primary))]" />
        </main>
      )}

      {/* Error */}
      {isError && (
        <main className="flex-1 flex items-center justify-center px-8">
          <div className="text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Erro ao carregar disponibilidade.
            </p>
          </div>
        </main>
      )}

      {/* Content */}
      {data && !isLoading && (
        <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">

          {/* Creator info */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-[hsl(var(--secondary))] shrink-0">
              {data.creator.avatar_url ? (
                <img src={data.creator.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Video size={20} className="text-[hsl(var(--muted-foreground))]" />
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                {data.creator.full_name}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Videochamada
              </p>
            </div>
          </div>

          {/* Duration selector */}
          <div>
            <label className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2 block">
              <Clock size={12} className="inline mr-1" />
              Duracao
            </label>
            <div className="flex gap-2">
              {([30, 60] as Duration[]).map((d) => {
                const p = d === 60 ? data.creator.call_per_1_hr : data.creator.call_per_30_min
                return (
                  <button
                    key={d}
                    onClick={() => { setDuration(d); setSelectedSlot(null) }}
                    className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors border ${
                      duration === d
                        ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]'
                        : 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)]'
                    }`}
                  >
                    {d} min
                    {p > 0 && (
                      <span className="block text-xs mt-0.5 opacity-80">
                        {formatCurrency(p)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date selector */}
          <div>
            <label className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2 block">
              <Calendar size={12} className="inline mr-1" />
              Data disponivel
            </label>
            {data.dates.length === 0 ? (
              <div className="py-8 text-center">
                <Calendar className="w-10 h-10 text-[hsl(var(--muted-foreground))] mx-auto mb-2 opacity-40" />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Nenhum horario disponivel no momento.
                </p>
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                {data.dates.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setSelectedDate(d.availability_date); setSelectedSlot(null) }}
                    className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                      selectedDate === d.availability_date
                        ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]'
                        : 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)]'
                    }`}
                  >
                    {formatDateLabel(d.availability_date)}
                    <span className="block text-[10px] mt-0.5 opacity-70">
                      {d.slots.length} {d.slots.length === 1 ? 'horario' : 'horarios'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Time slots */}
          {selectedDateData && (
            <div>
              <label className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2 block">
                <Clock size={12} className="inline mr-1" />
                Horario
              </label>
              <div className="grid grid-cols-4 gap-2">
                {selectedDateData.slots.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                      selectedSlot?.id === slot.id
                        ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]'
                        : 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)]'
                    }`}
                  >
                    {formatTime(slot.slot_time)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Checkout button */}
          {selectedSlot && (
            <div className="sticky bottom-4 pt-2">
              <button
                onClick={handleCheckout}
                disabled={isCheckingOut || !(user?.id || session?.user?.id)}
                className="
                  w-full flex items-center justify-center gap-2 py-3.5 rounded-xl
                  bg-[hsl(var(--primary))] text-white font-semibold text-sm
                  hover:opacity-90 active:scale-[0.98] transition-all duration-150
                  disabled:opacity-60 disabled:cursor-not-allowed
                "
              >
                {isCheckingOut ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Video size={18} />
                )}
                {isCheckingOut
                  ? 'Processando...'
                  : `Agendar por ${formatCurrency(price)}`}
              </button>
              <p className="text-[10px] text-center text-[hsl(var(--muted-foreground))] mt-2">
                {formatDateLabel(selectedDate!)} as {formatTime(selectedSlot.slot_time)} · {duration} min
              </p>
            </div>
          )}
        </main>
      )}
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
        <span className="text-base font-semibold text-[hsl(var(--foreground))]">
          Agendar videochamada
        </span>
      </div>
    </header>
  )
}
