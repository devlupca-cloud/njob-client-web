import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Transaction } from '@/types'

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchTransactions(userId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, amount, currency, status, created_at, gateway')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return (data ?? []) as unknown as Transaction[]
}

// ─── Period Filter ────────────────────────────────────────────────────────────

type Period = '1m' | '3m' | '6m' | '1y' | 'all'

function getPeriodStart(period: Period): Date | null {
  const now = new Date()
  switch (period) {
    case '1m':
      return new Date(now.getFullYear(), now.getMonth(), 1)
    case '3m': {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 3)
      return d
    }
    case '6m': {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 6)
      return d
    }
    case '1y': {
      const d = new Date(now)
      d.setFullYear(d.getFullYear() - 1)
      return d
    }
    case 'all':
      return null
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDebit(type: Transaction['type']): boolean {
  return type === 'purchase' || type === 'subscription' || type === 'call' || type === 'live'
}

function statusClass(status: Transaction['status']): string {
  switch (status) {
    case 'completed': return 'text-green-400 bg-green-500/10'
    case 'pending': return 'text-yellow-400 bg-yellow-500/10'
    case 'failed': return 'text-red-400 bg-red-500/10'
    case 'refunded': return 'text-blue-400 bg-blue-500/10'
    default: return 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))]'
  }
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  colorClass,
}: {
  label: string
  value: string
  icon: React.ReactNode
  colorClass: string
}) {
  return (
    <div className="flex-1 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-3 flex flex-col gap-2">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colorClass}`}>
        {icon}
      </div>
      <p className="text-[11px] text-[hsl(var(--muted-foreground))] leading-tight">{label}</p>
      <p className="text-sm font-bold text-[hsl(var(--foreground))] leading-tight">{value}</p>
    </div>
  )
}

// ─── Transaction Item ─────────────────────────────────────────────────────────

function TransactionItem({ tx, typeLabel, statusLabel }: { tx: Transaction; typeLabel: (type: Transaction['type']) => string; statusLabel: (status: Transaction['status']) => string }) {
  const debit = isDebit(tx.type)

  return (
    <div className="flex items-center gap-3 py-3 border-b border-[hsl(var(--border))] last:border-0">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          debit ? 'bg-red-500/10' : 'bg-green-500/10'
        }`}
      >
        {debit
          ? <ArrowDownRight size={16} className="text-red-400" />
          : <ArrowUpRight size={16} className="text-green-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
          {typeLabel(tx.type)}
        </p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
          {formatDate(tx.created_at)}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p
          className={`text-sm font-bold ${
            debit ? 'text-red-400' : 'text-green-400'
          }`}
        >
          {debit ? '-' : '+'}{formatCurrency(tx.amount)}
        </p>
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusClass(tx.status)}`}
        >
          {statusLabel(tx.status)}
        </span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinancialPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [period, setPeriod] = useState<Period>('1m')
  const [periodOpen, setPeriodOpen] = useState(false)

  const PERIODS: { key: Period; label: string }[] = [
    { key: '1m', label: t('financial.periods.thisMonth') },
    { key: '3m', label: t('financial.periods.3months') },
    { key: '6m', label: t('financial.periods.6months') },
    { key: '1y', label: t('financial.periods.1year') },
    { key: 'all', label: t('financial.periods.all') },
  ]

  function typeLabel(type: Transaction['type']): string {
    const map: Record<Transaction['type'], string> = {
      purchase: t('financial.types.packPurchase'),
      subscription: t('financial.types.subscription'),
      call: t('financial.types.videoCall'),
      live: t('financial.types.liveTicket'),
      refund: t('financial.types.refund'),
    }
    return map[type] ?? type
  }

  function statusLabel(status: Transaction['status']): string {
    const map: Record<Transaction['status'], string> = {
      pending: t('financial.statuses.pending'),
      completed: t('financial.statuses.completed'),
      failed: t('financial.statuses.failed'),
      refunded: t('financial.statuses.refunded'),
    }
    return map[status] ?? status
  }

  const { data: transactions, isLoading, isError } = useQuery({
    queryKey: ['transactions', user?.id],
    queryFn: () => fetchTransactions(user!.id),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
  })

  // Filtragem por período
  const filtered = useMemo(() => {
    if (!transactions) return []
    const start = getPeriodStart(period)
    if (!start) return transactions
    return transactions.filter((tx) => new Date(tx.created_at) >= start)
  }, [transactions, period])

  // Cálculo de resumo
  const summary = useMemo(() => {
    const completed = filtered.filter((tx) => tx.status === 'completed')
    const saidas = completed
      .filter((tx) => isDebit(tx.type))
      .reduce((acc, tx) => acc + tx.amount, 0)
    const entradas = completed
      .filter((tx) => !isDebit(tx.type))
      .reduce((acc, tx) => acc + tx.amount, 0)
    const saldo = entradas - saidas
    return { saldo, entradas, saidas }
  }, [filtered])

  const currentPeriodLabel = PERIODS.find((p) => p.key === period)?.label ?? t('financial.periods.thisMonth')

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="relative flex items-center justify-center h-7 max-w-3xl mx-auto px-4 pt-4 pb-3">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-7 h-7 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
            aria-label={t('common.back')}
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">{t('financial.title')}</span>
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
            {t('financial.loadError')}
          </p>
        </div>
      )}

      {/* Content */}
      {!isLoading && !isError && (
        <main className="flex-1 px-4 py-4 flex flex-col gap-4 max-w-3xl mx-auto w-full">

          {/* Filtro de período */}
          <div className="relative">
            <button
              onClick={() => setPeriodOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))]"
            >
              <span>{currentPeriodLabel}</span>
              <ChevronDown
                size={14}
                className={`text-[hsl(var(--muted-foreground))] transition-transform ${periodOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {periodOpen && (
              <div className="absolute top-full left-0 mt-1 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden z-20 min-w-[140px] shadow-lg">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => {
                      setPeriod(p.key)
                      setPeriodOpen(false)
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      period === p.key
                        ? 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] font-medium'
                        : 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cards de resumo */}
          <div className="flex gap-2">
            <SummaryCard
              label={t('financial.balance')}
              value={formatCurrency(summary.saldo)}
              icon={<Wallet size={15} className="text-[hsl(var(--primary))]" />}
              colorClass="bg-[hsl(var(--primary)/0.15)]"
            />
            <SummaryCard
              label={t('financial.income')}
              value={formatCurrency(summary.entradas)}
              icon={<TrendingUp size={15} className="text-green-400" />}
              colorClass="bg-green-500/10"
            />
            <SummaryCard
              label={t('financial.expenses')}
              value={formatCurrency(summary.saidas)}
              icon={<TrendingDown size={15} className="text-red-400" />}
              colorClass="bg-red-500/10"
            />
          </div>

          {/* Lista de transações */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('financial.transactions')}</h2>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                {filtered.length} {filtered.length !== 1 ? t('common.records') : t('common.record')}
              </span>
            </div>

            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Wallet size={32} className="mx-auto text-[hsl(var(--muted-foreground))] mb-3 opacity-50" />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {t('financial.empty')}
                </p>
              </div>
            ) : (
              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl px-4">
                {filtered.map((tx) => (
                  <TransactionItem key={tx.id} tx={tx} typeLabel={typeLabel} statusLabel={statusLabel} />
                ))}
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  )
}
