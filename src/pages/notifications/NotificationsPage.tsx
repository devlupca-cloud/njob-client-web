import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  CheckCheck,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatRelativeTime } from '@/lib/utils'
import type { AppNotification } from '@/types'

import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'

import { useToast } from '@/components/ui/Toast'

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'unread'

// ─── Notification icon + color ────────────────────────────────────────────────

interface TypeStyle {
  icon: React.ReactNode
  bar: string          // border-left color class
  iconBg: string       // icon background
  iconColor: string    // icon text color
}

const typeStyles: Record<AppNotification['type'], TypeStyle> = {
  success: {
    icon: <CheckCircle2 size={18} strokeWidth={2} />,
    bar: 'border-emerald-500',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-400',
  },
  info: {
    icon: <Info size={18} strokeWidth={2} />,
    bar: 'border-[hsl(var(--primary))]',
    iconBg: 'bg-[hsl(var(--primary)/0.12)]',
    iconColor: 'text-[hsl(var(--primary))]',
  },
  warning: {
    icon: <AlertTriangle size={18} strokeWidth={2} />,
    bar: 'border-yellow-500',
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-400',
  },
  error: {
    icon: <XCircle size={18} strokeWidth={2} />,
    bar: 'border-red-500',
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-400',
  },
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as AppNotification[]
}

async function markOneRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)

  if (error) throw error
}

async function markAllRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) throw error
}

// ─── Skeleton list ────────────────────────────────────────────────────────────

function NotificationSkeletonList() {
  return (
    <div className="flex flex-col divide-y divide-[hsl(var(--border))]">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-4 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-[hsl(var(--secondary))] shrink-0 mt-0.5" />
          <div className="flex-1 flex flex-col gap-2">
            <div className="h-3.5 w-2/5 bg-[hsl(var(--secondary))] rounded" />
            <div className="h-3 w-full bg-[hsl(var(--secondary))] rounded" />
            <div className="h-3 w-3/5 bg-[hsl(var(--secondary))] rounded" />
          </div>
          <div className="h-3 w-8 bg-[hsl(var(--secondary))] rounded shrink-0" />
        </div>
      ))}
    </div>
  )
}

// ─── Single notification row ──────────────────────────────────────────────────

interface NotificationItemProps {
  notification: AppNotification
  onMarkRead: (id: string) => void
  isMarkingRead: boolean
}

function NotificationItem({ notification, onMarkRead, isMarkingRead }: NotificationItemProps) {
  const style = typeStyles[notification.type]

  const handleTap = () => {
    if (!notification.is_read && !isMarkingRead) {
      onMarkRead(notification.id)
    }
  }

  return (
    <button
      onClick={handleTap}
      disabled={notification.is_read}
      className={[
        'w-full text-left flex items-start gap-3 px-4 py-4',
        'transition-colors duration-150',
        'border-b border-[hsl(var(--border))]',
        // Unread accent: left border + subtle bg tint
        !notification.is_read
          ? `border-l-2 pl-3.5 ${style.bar} bg-[hsl(var(--card)/0.6)] hover:bg-[hsl(var(--card))] cursor-pointer`
          : 'border-l-2 border-l-transparent cursor-default opacity-60',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={notification.is_read ? notification.title : `Marcar como lida: ${notification.title}`}
    >
      {/* Type icon */}
      <span
        className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center shrink-0
          ${style.iconBg} ${style.iconColor}`}
      >
        {style.icon}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-sm leading-snug ${
              notification.is_read
                ? 'font-normal text-[hsl(var(--muted-foreground))]'
                : 'font-semibold text-[hsl(var(--foreground))]'
            }`}
          >
            {notification.title}
          </p>
          <span className="text-[11px] text-[hsl(var(--muted-foreground))] shrink-0 mt-px">
            {formatRelativeTime(notification.created_at)}
          </span>
        </div>
        {notification.body && (
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))] leading-relaxed line-clamp-2">
            {notification.body}
          </p>
        )}
        {!notification.is_read && (
          <p className="mt-1.5 text-[11px] text-[hsl(var(--primary))] font-medium">
            Toque para marcar como lida
          </p>
        )}
      </div>
    </button>
  )
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

interface FilterTabsProps {
  active: FilterTab
  onChange: (tab: FilterTab) => void
  unreadCount: number
}

function FilterTabs({ active, onChange, unreadCount }: FilterTabsProps) {
  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'unread', label: 'Não lidas' },
  ]

  return (
    <div className="flex gap-1 px-4 py-3 border-b border-[hsl(var(--border))]">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={[
            'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-150',
            active === key
              ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
              : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]',
          ].join(' ')}
        >
          {label}
          {key === 'unread' && unreadCount > 0 && (
            <span
              className={`text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] flex items-center justify-center ${
                active === 'unread'
                  ? 'bg-white/20 text-white'
                  : 'bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--primary))]'
              }`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const userId = useAuthStore((s) => s.user?.id)

  const [filter, setFilter] = useState<FilterTab>('all')

  // ── Query ──────────────────────────────────────────────────────────────────

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: () => fetchNotifications(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  })

  const unreadCount = notifications.filter((n) => !n.is_read).length

  // ── Mark one as read ───────────────────────────────────────────────────────

  const { mutate: markRead, isPending: isMarkingOne } = useMutation({
    mutationFn: markOneRead,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notifications', userId] })
      const prev = queryClient.getQueryData<AppNotification[]>(['notifications', userId])
      queryClient.setQueryData<AppNotification[]>(['notifications', userId], (old = []) =>
        old.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      )
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['notifications', userId], ctx.prev)
      }
      toast({ title: 'Erro ao marcar como lida', type: 'error' })
    },
  })

  // ── Mark all as read ───────────────────────────────────────────────────────

  const { mutate: markAll, isPending: isMarkingAll } = useMutation({
    mutationFn: () => markAllRead(userId!),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications', userId] })
      const prev = queryClient.getQueryData<AppNotification[]>(['notifications', userId])
      queryClient.setQueryData<AppNotification[]>(['notifications', userId], (old = []) =>
        old.map((n) => ({ ...n, is_read: true })),
      )
      return { prev }
    },
    onSuccess: () => {
      toast({ title: 'Todas as notificações foram marcadas como lidas', type: 'success' })
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['notifications', userId], ctx.prev)
      }
      toast({ title: 'Erro ao marcar notificações', type: 'error' })
    },
  })

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = filter === 'unread'
    ? notifications.filter((n) => !n.is_read)
    : notifications

  // ── Mark all button ────────────────────────────────────────────────────────

  const handleMarkAll = useCallback(() => {
    if (unreadCount === 0 || isMarkingAll) return
    markAll()
  }, [unreadCount, isMarkingAll, markAll])

  // ── Right action: "Marcar todas como lidas" ────────────────────────────────

  const rightAction =
    unreadCount > 0 ? (
      <button
        onClick={handleMarkAll}
        disabled={isMarkingAll}
        aria-label="Marcar todas como lidas"
        className="flex items-center justify-center w-9 h-9 rounded-full
          text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]
          hover:bg-[hsl(var(--secondary))] active:scale-95
          transition-all duration-150 disabled:opacity-50"
      >
        <CheckCheck size={19} strokeWidth={2} />
      </button>
    ) : null

  // ── Empty state content ────────────────────────────────────────────────────

  const isEmpty = filtered.length === 0

  const emptyContent = (() => {
    if (filter === 'unread') {
      return (
        <EmptyState
          icon={<CheckCircle2 />}
          title="Tudo em dia!"
          description="Nenhuma notificação não lida. Você está em dia com tudo."
          action={{ label: 'Ver todas', onClick: () => setFilter('all') }}
        />
      )
    }
    return (
      <EmptyState
        icon={<Bell />}
        title="Sem notificações"
        description="Quando você tiver notificações elas aparecerão aqui."
      />
    )
  })()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
        <PageHeader
          title="Notificações"
          onBack={() => navigate(-1)}
          rightAction={rightAction}
        />

        <div className="max-w-3xl mx-auto w-full">
        {isLoading ? (
          <NotificationSkeletonList />
        ) : (
          <>
            <FilterTabs
              active={filter}
              onChange={setFilter}
              unreadCount={unreadCount}
            />

            {isEmpty ? (
              emptyContent
            ) : (
              <div className="flex flex-col">
                {filtered.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={markRead}
                    isMarkingRead={isMarkingOne}
                  />
                ))}
              </div>
            )}
          </>
        )}
        </div>
    </div>
  )
}
