import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Package,
  Radio,
  PhoneCall,
  ShoppingBag,
  Image,
  Lock,
  Clock,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PackPurchase {
  id: string
  pack_id: string
  user_id: string
  purchased_at: string | null
  purchase_price: number
  packs: {
    id: string
    title: string
    cover_image_url: string | null
    price: number
    profile_id: string
  } | null
}

interface LiveTicket {
  id: string
  live_stream_id: string
  user_id: string
  purchased_at: string | null
  purchase_price: number
  live_streams: {
    id: string
    title: string
    cover_image_url: string | null
    scheduled_start_time: string
    ticket_price: number | null
    status: 'scheduled' | 'live' | 'ended'
  } | null
}

interface CallPurchase {
  id: string
  creator_id: string
  user_id: string
  created_at: string
  scheduled_start_time: string
  scheduled_duration_minutes: number
  call_price: number
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  profiles: {
    id: string
    full_name: string | null
    avatar_url: string | null
  } | null
}

interface PurchasesData {
  packs: PackPurchase[]
  lives: LiveTicket[]
  calls: CallPurchase[]
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchPurchases(userId: string): Promise<PurchasesData> {
  const [packsRes, livesRes, callsRes] = await Promise.all([
    Promise.resolve(
      supabase
        .from('pack_purchases')
        .select('*, packs(id, title, cover_image_url, price, profile_id)')
        .eq('user_id', userId)
        .order('purchased_at', { ascending: false })
        .limit(50)
    )
      .then((r) => r.data as PackPurchase[] | null)
      .catch(() => null),

    Promise.resolve(
      supabase
        .from('live_stream_tickets')
        .select('*, live_streams(id, title, cover_image_url, scheduled_start_time, ticket_price, status)')
        .eq('user_id', userId)
        .order('purchased_at', { ascending: false })
        .limit(50)
    )
      .then((r) => r.data as LiveTicket[] | null)
      .catch(() => null),

    Promise.resolve(
      supabase
        .from('one_on_one_calls')
        .select('*, profiles!creator_id(id, full_name, avatar_url)')

        .eq('user_id', userId)
        .order('scheduled_start_time', { ascending: false })
        .limit(50)
    )
      .then((r) => r.data as CallPurchase[] | null)
      .catch(() => null),
  ])

  return {
    packs: packsRes ?? [],
    lives: livesRes ?? [],
    calls: callsRes ?? [],
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Clock that ticks every minute so countdowns stay fresh */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** How many minutes until `target`? Returns a human-readable string or null if past */
function countdownText(now: Date, target: Date): string | null {
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return null
  const mins = Math.ceil(diffMs / 60_000)
  if (mins >= 60 * 24) return `${Math.floor(mins / (60 * 24))}d`
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}min`
  return `${mins}min`
}

/** Allow entry from ENTRY_BUFFER_MIN before start until end */
const ENTRY_BUFFER_MIN = 5

function callStatusClass(status: CallPurchase['status']): string {
  switch (status) {
    case 'completed': return 'text-green-400 bg-green-500/10'
    case 'confirmed': return 'text-blue-400 bg-blue-500/10'
    case 'pending': return 'text-yellow-400 bg-yellow-500/10'
    case 'cancelled': return 'text-red-400 bg-red-500/10'
    default: return 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))]'
  }
}

function liveStatusClass(status: string): string {
  switch (status) {
    case 'live': return 'text-red-400 bg-red-500/10'
    case 'scheduled': return 'text-blue-400 bg-blue-500/10'
    case 'ended': return 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))]'
    default: return 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))]'
  }
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

type Tab = 'packs' | 'lives' | 'calls'

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: Tab }) {
  const { t } = useTranslation()
  const messages = {
    packs: t('purchases.emptyPacks'),
    lives: t('purchases.emptyLives'),
    calls: t('purchases.emptyCalls'),
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <ShoppingBag size={32} className="text-[hsl(var(--muted-foreground))] opacity-50" />
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{messages[tab]}</p>
    </div>
  )
}

// ─── Pack List ────────────────────────────────────────────────────────────────

function PackList({ packs, onTap }: { packs: PackPurchase[]; onTap: (creatorId: string) => void }) {
  const { t } = useTranslation()
  if (packs.length === 0) return <EmptyState tab="packs" />

  return (
    <div className="flex flex-col gap-3">
      {packs.map((purchase) => {
        const pack = purchase.packs
        return (
          <button
            key={purchase.id}
            onClick={() => pack?.profile_id && onTap(pack.profile_id)}
            disabled={!pack?.profile_id}
            className="flex items-center gap-3 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-3 text-left w-full disabled:opacity-70"
          >
            {/* Thumbnail */}
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-[hsl(var(--secondary))] shrink-0 flex items-center justify-center">
              {pack?.cover_image_url ? (
                <img
                  src={pack.cover_image_url}
                  alt={pack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Image size={20} className="text-[hsl(var(--muted-foreground))]" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
                {pack?.title ?? t('purchases.packRemoved')}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                {purchase.purchased_at ? formatDate(purchase.purchased_at) : '—'}
              </p>
            </div>

            {/* Valor */}
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-[hsl(var(--primary))]">
                {formatCurrency(purchase.purchase_price)}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Live List ────────────────────────────────────────────────────────────────

function LiveList({ lives, now, onTap }: { lives: LiveTicket[]; now: Date; onTap: (liveId: string) => void }) {
  const { t } = useTranslation()
  if (lives.length === 0) return <EmptyState tab="lives" />

  return (
    <div className="flex flex-col gap-3">
      {lives.map((ticket) => {
        const live = ticket.live_streams
        // Only allow entry when live is actually streaming
        const isLive = live?.status === 'live'
        const isScheduled = live?.status === 'scheduled'
        const isEnded = live?.status === 'ended'
        const canEnter = isLive

        // Countdown for scheduled lives
        const scheduledDate = live?.scheduled_start_time ? new Date(live.scheduled_start_time) : null
        const remaining = scheduledDate && isScheduled ? countdownText(now, scheduledDate) : null

        return (
          <button
            key={ticket.id}
            onClick={() => live && canEnter && onTap(live.id)}
            disabled={!canEnter}
            className="flex items-center gap-3 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-3 text-left w-full disabled:opacity-70"
          >
            {/* Thumbnail */}
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-[hsl(var(--secondary))] shrink-0 flex items-center justify-center">
              {live?.cover_image_url ? (
                <img
                  src={live.cover_image_url}
                  alt={live.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Radio size={20} className="text-[hsl(var(--muted-foreground))]" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
                {live?.title ?? t('purchases.liveRemoved')}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                {live?.scheduled_start_time ? formatDateTime(live.scheduled_start_time) : '—'}
              </p>

              {/* Status badge */}
              {isLive && (
                <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 ${liveStatusClass('live')}`}>
                  {t('purchases.liveStatuses.live')}
                </span>
              )}
              {isEnded && (
                <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 ${liveStatusClass('ended')}`}>
                  {t('purchases.liveStatuses.ended')}
                </span>
              )}

              {/* Time lock for scheduled */}
              {isScheduled && remaining && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 text-yellow-400 bg-yellow-500/10">
                  <Lock size={10} />
                  {t('purchases.availableIn', { time: remaining })}
                </span>
              )}
              {isScheduled && !remaining && (
                <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 ${liveStatusClass('scheduled')}`}>
                  {t('purchases.liveStatuses.scheduled')}
                </span>
              )}
            </div>

            {/* Valor */}
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-[hsl(var(--primary))]">
                {ticket.purchase_price ? formatCurrency(ticket.purchase_price) : t('purchases.freeTag')}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Call List ────────────────────────────────────────────────────────────────

function CallList({ calls, now, onTap }: { calls: CallPurchase[]; now: Date; onTap: (callId: string) => void }) {
  const { t } = useTranslation()

  function callStatusLabel(status: CallPurchase['status']): string {
    const map: Record<CallPurchase['status'], string> = {
      pending: t('purchases.statuses.pending'),
      confirmed: t('purchases.statuses.confirmed'),
      completed: t('purchases.statuses.done'),
      cancelled: t('purchases.statuses.canceled'),
    }
    return map[status]
  }

  if (calls.length === 0) return <EmptyState tab="calls" />

  return (
    <div className="flex flex-col gap-3">
      {calls.map((call) => {
        const creator = call.profiles
        const startTime = new Date(call.scheduled_start_time)
        const endTime = new Date(startTime.getTime() + call.scheduled_duration_minutes * 60_000)
        const entryOpensAt = new Date(startTime.getTime() - ENTRY_BUFFER_MIN * 60_000)

        const isExpired = (call.status === 'pending' || call.status === 'confirmed') && endTime < now
        const isActive = call.status === 'pending' || call.status === 'confirmed'
        const isInTimeWindow = now >= entryOpensAt && now <= endTime
        const canEnter = isActive && !isExpired && isInTimeWindow
        const isTooEarly = isActive && !isExpired && now < entryOpensAt

        // Countdown text for when it's too early
        const remaining = isTooEarly ? countdownText(now, entryOpensAt) : null

        return (
          <button
            key={call.id}
            onClick={() => canEnter && onTap(call.id)}
            disabled={!canEnter}
            className="flex items-center gap-3 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-3 text-left w-full disabled:opacity-70"
          >
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full overflow-hidden bg-[hsl(var(--secondary))] shrink-0 flex items-center justify-center">
              {creator?.avatar_url ? (
                <img
                  src={creator.avatar_url}
                  alt={creator.full_name ?? ''}
                  className="w-full h-full object-cover"
                />
              ) : (
                <PhoneCall size={20} className="text-[hsl(var(--muted-foreground))]" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
                {creator?.full_name ?? 'Creator'}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                Compra: {formatDate(call.created_at)}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                Chamada: {formatDate(call.scheduled_start_time)} às{' '}
                {startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {' - '}
                {endTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {' · '}{call.scheduled_duration_minutes} min
              </p>

              {/* Status / time lock */}
              {isExpired && (
                <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))]">
                  {t('purchases.statuses.expired')}
                </span>
              )}
              {isTooEarly && remaining && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 text-yellow-400 bg-yellow-500/10">
                  <Lock size={10} />
                  {t('purchases.availableIn', { time: remaining })}
                </span>
              )}
              {canEnter && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 text-green-400 bg-green-500/10">
                  <Clock size={10} />
                  {t('purchases.readyToJoin')}
                </span>
              )}
              {!isExpired && !isTooEarly && !canEnter && (
                <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 ${callStatusClass(call.status)}`}>
                  {callStatusLabel(call.status)}
                </span>
              )}
            </div>

            {/* Valor */}
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-[hsl(var(--primary))]">
                {formatCurrency(call.call_price)}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PurchasesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const profile = useAuthStore((s) => s.profile)
  const session = useAuthStore((s) => s.session)
  const userId = profile?.id || session?.user?.id
  const initialTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<Tab>(
    initialTab === 'calls' ? 'calls' : initialTab === 'lives' ? 'lives' : 'packs'
  )

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'packs', label: t('purchases.tabs.packs'), icon: <Package size={14} /> },
    { key: 'lives', label: t('purchases.tabs.lives'), icon: <Radio size={14} /> },
    { key: 'calls', label: t('purchases.tabs.calls'), icon: <PhoneCall size={14} /> },
  ]

  const now = useNow()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['purchases', userId],
    queryFn: () => fetchPurchases(userId!),
    enabled: !!userId,
  })

  const counts = {
    packs: data?.packs.length ?? 0,
    lives: data?.lives.length ?? 0,
    calls: data?.calls.length ?? 0,
  }

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-0">
        <div className="relative flex items-center justify-center h-7 mb-3">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-7 h-7 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
            aria-label={t('common.back')}
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">{t('purchases.title')}</span>
        </div>

        {/* Tabs */}
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                  : 'border-transparent text-[hsl(var(--muted-foreground))]'
              }`}
            >
              {tab.icon}
              {tab.label}
              {counts[tab.key] > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.key
                      ? 'bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--primary))]'
                      : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
                  }`}
                >
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>
        </div>
      </header>

      {/* Loading */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex-1 flex items-center justify-center px-8">
          <p className="text-sm text-[hsl(var(--muted-foreground))] text-center">
            {t('purchases.loadError')}
          </p>
        </div>
      )}

      {/* Content */}
      {!isLoading && !isError && (
        <main className="flex-1 px-4 py-4 max-w-3xl mx-auto w-full">
          {activeTab === 'packs' && <PackList packs={data?.packs ?? []} onTap={(creatorId) => navigate(`/creator/${creatorId}/content`)} />}
          {activeTab === 'lives' && <LiveList lives={data?.lives ?? []} now={now} onTap={(liveId) => navigate(`/lives/${liveId}`)} />}
          {activeTab === 'calls' && <CallList calls={data?.calls ?? []} now={now} onTap={(callId) => navigate(`/calls/${callId}`)} />}
        </main>
      )}
    </div>
  )
}
