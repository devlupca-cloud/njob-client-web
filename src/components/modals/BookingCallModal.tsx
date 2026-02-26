import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Video,
  Calendar,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface BookingCallModalProps {
  isOpen: boolean
  onClose: () => void
  creatorId: string
  creatorName: string
  avatarUrl: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

/** Check if a slot time has already passed for a given date */
function isSlotPast(dateStr: string, slotTime: string): boolean {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  // Only check for today — future dates are never past
  if (dateStr !== todayStr) return false
  const [hh, mm] = slotTime.split(':').map(Number)
  const slotDate = new Date(now)
  slotDate.setHours(hh, mm, 0, 0)
  return now > slotDate
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

async function fetchCallAvailability(creatorId: string) {
  const [settingsRes, availabilityRes, livesRes] = await Promise.all([
    supabase
      .from('profile_settings')
      .select('call_per_30_min, call_per_1_hr')
      .eq('profile_id', creatorId)
      .single(),
    supabase
      .from('creator_availability')
      .select('id, availability_date, creator_availability_slots(id, slot_time, purchased)')
      .eq('creator_id', creatorId)
      .gte('availability_date', new Date().toISOString().split('T')[0])
      .order('availability_date', { ascending: true }),
    supabase
      .from('live_streams')
      .select('scheduled_start_time, estimated_duration_minutes')
      .eq('creator_id', creatorId)
      .in('status', ['scheduled', 'live'])
      .gte('scheduled_start_time', new Date().toISOString())
      .limit(30),
  ])

  const pricing = {
    call_per_30_min: settingsRes.data?.call_per_30_min ?? 0,
    call_per_1_hr: settingsRes.data?.call_per_1_hr ?? 0,
  }

  // Build blocked slots set from lives
  const blockedSlots = new Set<string>()
  for (const live of livesRes.data ?? []) {
    const start = new Date(live.scheduled_start_time)
    const durationMs = (live.estimated_duration_minutes ?? 60) * 60 * 1000
    const end = new Date(start.getTime() + durationMs)
    const dateKey = start.toISOString().split('T')[0]
    let cursor = new Date(start)
    while (cursor < end) {
      const hh = String(cursor.getHours()).padStart(2, '0')
      const mm = String(cursor.getMinutes()).padStart(2, '0')
      blockedSlots.add(`${dateKey}_${hh}:${mm}`)
      cursor = new Date(cursor.getTime() + 30 * 60 * 1000)
    }
  }

  // Filter availability: remove purchased and live-blocked slots
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
      dates.push({ id: av.id, availability_date: av.availability_date, slots })
    }
  }

  return { pricing, dates }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BookingCallModal({
  isOpen,
  onClose,
  creatorId,
  creatorName,
  avatarUrl,
}: BookingCallModalProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [duration, setDuration] = useState<Duration>(30)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['call-availability-modal', creatorId],
    queryFn: () => fetchCallAvailability(creatorId),
    enabled: isOpen && !!creatorId,
    staleTime: 1000 * 30,
  })

  const selectedDateData = data?.dates.find((d) => d.availability_date === selectedDate)
  const price = data?.pricing
    ? duration === 60
      ? data.pricing.call_per_1_hr
      : data.pricing.call_per_30_min
    : 0

  const handleCheckout = async () => {
    if (!user?.id || !creatorId || !selectedSlot || !selectedDate) return

    setIsCheckingOut(true)
    setError(null)

    try {
      // 1. Mark slot as purchased atomically via RPC
      const { error: slotError } = await supabase
        .rpc('book_availability_slot', { p_slot_id: selectedSlot.id })

      if (slotError) {
        queryClient.invalidateQueries({ queryKey: ['call-availability-modal', creatorId] })
        setSelectedSlot(null)
        setError(t('booking.slotTaken'))
        setIsCheckingOut(false)
        return
      }

      // 2. Insert one_on_one_calls
      const { error: callError } = await supabase
        .from('one_on_one_calls')
        .insert({
          user_id: user.id,
          creator_id: creatorId,
          availability_slot_id: selectedSlot.id,
          scheduled_start_time: new Date(`${selectedDate}T${selectedSlot.slot_time}`).toISOString(),
          scheduled_duration_minutes: duration,
          call_price: price,
          currency: 'BRL',
          status: 'confirmed',
        })

      if (callError) {
        await supabase.rpc('unbook_availability_slot', { p_slot_id: selectedSlot.id })
        throw callError
      }

      onClose()
      navigate('/purchases?tab=calls')
    } catch (err) {
      console.error('[BookingCallModal] Checkout error:', err)
      setError(t('booking.error'))
    } finally {
      setIsCheckingOut(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full sm:max-w-lg max-h-[85vh] bg-[hsl(var(--background))] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-[hsl(var(--secondary))] shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Video size={18} className="text-[hsl(var(--muted-foreground))]" />
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{creatorName}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{t('creator.videoCall')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-7 h-7 animate-spin text-[hsl(var(--primary))]" />
            </div>
          ) : !data || data.dates.length === 0 ? (
            <div className="py-10 text-center">
              <Calendar className="w-10 h-10 text-[hsl(var(--muted-foreground))] mx-auto mb-3 opacity-40" />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {t('booking.noSlots')}
              </p>
            </div>
          ) : (
            <>
              {/* Duration */}
              <div>
                <label className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2 block">
                  <Clock size={12} className="inline mr-1.5" />
                  {t('booking.duration')}
                </label>
                <div className="flex gap-2">
                  {([30, 60] as Duration[]).map((d) => {
                    const p = d === 60 ? data.pricing.call_per_1_hr : data.pricing.call_per_30_min
                    return (
                      <button
                        key={d}
                        onClick={() => { setDuration(d); setSelectedSlot(null) }}
                        className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors border ${
                          duration === d
                            ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]'
                            : 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))]'
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

              {/* Dates */}
              <div>
                <label className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2 block">
                  <Calendar size={12} className="inline mr-1.5" />
                  {t('booking.availableDate')}
                </label>
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                  {data.dates.map((d) => {
                    const futureCount = d.slots.filter((s) => !isSlotPast(d.availability_date, s.slot_time)).length
                    return (
                    <button
                      key={d.id}
                      onClick={() => { setSelectedDate(d.availability_date); setSelectedSlot(null); setError(null) }}
                      className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                        selectedDate === d.availability_date
                          ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]'
                          : 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))]'
                      }`}
                    >
                      {formatDateLabel(d.availability_date)}
                      <span className="block text-[10px] mt-0.5 opacity-70">
                        {futureCount} {futureCount === 1 ? t('booking.slot') : t('booking.slots')}
                      </span>
                    </button>
                    )
                  })}
                </div>
              </div>

              {/* Time slots */}
              {selectedDateData && (
                <div>
                  <label className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2 block">
                    <Clock size={12} className="inline mr-1.5" />
                    {t('booking.time')}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {selectedDateData.slots.map((slot) => {
                      const past = isSlotPast(selectedDate!, slot.slot_time)
                      const selected = selectedSlot?.id === slot.id
                      return (
                        <button
                          key={slot.id}
                          onClick={() => {
                            if (past) {
                              setError(t('booking.slotPast'))
                              return
                            }
                            setError(null)
                            setSelectedSlot(slot)
                          }}
                          className={`py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                            past
                              ? 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))]/40 border-[hsl(var(--border))]/40 opacity-40 cursor-not-allowed line-through'
                              : selected
                                ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]'
                                : 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))]'
                          }`}
                        >
                          {formatTime(slot.slot_time)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertCircle size={16} className="text-red-400 shrink-0" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer: Checkout */}
        {selectedSlot && (
          <div className="px-5 py-4 border-t border-[hsl(var(--border))]">
            <button
              onClick={handleCheckout}
              disabled={isCheckingOut || !user?.id}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[hsl(var(--primary))] text-white font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isCheckingOut ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Video size={18} />
              )}
              {isCheckingOut
                ? t('booking.processing')
                : price > 0
                  ? `${t('booking.bookFor')} ${formatCurrency(price)}`
                  : t('booking.bookFree')}
            </button>
            <p className="text-[10px] text-center text-[hsl(var(--muted-foreground))] mt-2">
              {formatDateLabel(selectedDate!)} {t('booking.at')} {formatTime(selectedSlot.slot_time)} · {duration} min
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
