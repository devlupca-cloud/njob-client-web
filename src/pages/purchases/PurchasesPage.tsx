import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Package,
  Radio,
  PhoneCall,
  ShoppingBag,
  Image,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

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
    supabase
      .from('pack_purchases')
      .select('*, packs(id, title, cover_image_url, price, profile_id)')
      .eq('user_id', userId)
      .order('purchased_at', { ascending: false }),

    supabase
      .from('live_stream_tickets')
      .select('*, live_streams(id, title, cover_image_url, scheduled_start_time, ticket_price, status)')
      .eq('user_id', userId)
      .order('purchased_at', { ascending: false }),

    supabase
      .from('one_on_one_calls')
      .select('*, profiles!creator_id(id, full_name, avatar_url)')
      .eq('user_id', userId)
      .order('scheduled_start_time', { ascending: false }),
  ])

  return {
    packs: (packsRes.data ?? []) as PackPurchase[],
    lives: (livesRes.data ?? []) as LiveTicket[],
    calls: (callsRes.data ?? []) as CallPurchase[],
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function callStatusLabel(status: CallPurchase['status']): string {
  const map: Record<CallPurchase['status'], string> = {
    pending: 'Pendente',
    confirmed: 'Confirmada',
    completed: 'Realizada',
    cancelled: 'Cancelada',
  }
  return map[status]
}

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

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'packs', label: 'Pacotes', icon: <Package size={14} /> },
  { key: 'lives', label: 'Lives', icon: <Radio size={14} /> },
  { key: 'calls', label: 'Chamadas', icon: <PhoneCall size={14} /> },
]

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: Tab }) {
  const messages = {
    packs: 'Você ainda não comprou nenhum pacote.',
    lives: 'Você ainda não comprou ingresso para nenhuma live.',
    calls: 'Você ainda não agendou nenhuma chamada.',
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <ShoppingBag size={32} className="text-[hsl(var(--muted-foreground))] opacity-50" />
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{messages[tab]}</p>
    </div>
  )
}

// ─── Pack List ────────────────────────────────────────────────────────────────

function PackList({ packs }: { packs: PackPurchase[] }) {
  if (packs.length === 0) return <EmptyState tab="packs" />

  return (
    <div className="flex flex-col gap-3">
      {packs.map((purchase) => {
        const pack = purchase.packs
        return (
          <div
            key={purchase.id}
            className="flex items-center gap-3 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-3"
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
                {pack?.title ?? 'Pack removido'}
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
          </div>
        )
      })}
    </div>
  )
}

// ─── Live List ────────────────────────────────────────────────────────────────

function LiveList({ lives }: { lives: LiveTicket[] }) {
  if (lives.length === 0) return <EmptyState tab="lives" />

  return (
    <div className="flex flex-col gap-3">
      {lives.map((ticket) => {
        const live = ticket.live_streams
        return (
          <div
            key={ticket.id}
            className="flex items-center gap-3 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-3"
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
                {live?.title ?? 'Live removida'}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                {live?.scheduled_start_time ? formatDate(live.scheduled_start_time) : '—'}
              </p>
              {live?.status && (
                <span
                  className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 ${liveStatusClass(live.status)}`}
                >
                  {live.status === 'live' ? 'Ao vivo' : live.status === 'scheduled' ? 'Agendada' : 'Encerrada'}
                </span>
              )}
            </div>

            {/* Valor */}
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-[hsl(var(--primary))]">
                {ticket.purchase_price ? formatCurrency(ticket.purchase_price) : 'Grátis'}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Call List ────────────────────────────────────────────────────────────────

function CallList({ calls }: { calls: CallPurchase[] }) {
  if (calls.length === 0) return <EmptyState tab="calls" />

  return (
    <div className="flex flex-col gap-3">
      {calls.map((call) => {
        const creator = call.profiles
        return (
          <div
            key={call.id}
            className="flex items-center gap-3 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-3"
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
                {formatDate(call.scheduled_start_time)} · {call.scheduled_duration_minutes} min
              </p>
              <span
                className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 ${callStatusClass(call.status)}`}
              >
                {callStatusLabel(call.status)}
              </span>
            </div>

            {/* Valor */}
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-[hsl(var(--primary))]">
                {formatCurrency(call.call_price)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PurchasesPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [activeTab, setActiveTab] = useState<Tab>('packs')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['purchases', user?.id],
    queryFn: () => fetchPurchases(user!.id),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
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
            aria-label="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">Compras</span>
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
            Erro ao carregar compras. Tente novamente.
          </p>
        </div>
      )}

      {/* Content */}
      {!isLoading && !isError && data && (
        <main className="flex-1 px-4 py-4 max-w-3xl mx-auto w-full">
          {activeTab === 'packs' && <PackList packs={data.packs} />}
          {activeTab === 'lives' && <LiveList lives={data.lives} />}
          {activeTab === 'calls' && <CallList calls={data.calls} />}
        </main>
      )}
    </div>
  )
}
