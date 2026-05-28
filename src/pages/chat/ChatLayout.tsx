import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, X, MessageCircle, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from 'react-i18next'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VwCreatorConversation {
  conversation_id: string
  profile_id: string
  peer_id: string
  peer_name: string | null
  peer_avatar_url: string | null
  last_message: string | null
  last_message_created_at: string | null
  unread_count: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(isoString: string | null, yesterdayLabel: string): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (isToday) return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  if (isYesterday) return yesterdayLabel

  return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
}

function Avatar({ url, name }: { url: string | null; name: string | null }) {
  const initials = (name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
  return (
    <div className="relative w-12 h-12 shrink-0">
      {url ? (
        <img src={url} alt={name ?? ''} className="w-12 h-12 rounded-full object-cover" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center text-white text-sm font-semibold">
          {initials}
        </div>
      )}
    </div>
  )
}

// ─── ChatLayout (master-detail estilo WhatsApp Web) ─────────────────────────────

export default function ChatLayout() {
  const navigate = useNavigate()
  const { id: selectedId } = useParams<{ id: string }>()
  const user = useAuthStore((s) => s.profile)
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<VwCreatorConversation | null>(null)
  const queryClient = useQueryClient()

  const hasSelection = !!selectedId

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['vw_creator_conversations', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const [convRes, partsRes] = await Promise.all([
        supabase
          .from('vw_creator_conversations')
          .select('*')
          .eq('profile_id', user.id)
          .order('last_message_created_at', { ascending: false }),
        supabase
          .from('conversation_participants')
          .select('conversation_id, cleared_at')
          .eq('profile_id', user.id),
      ])
      if (convRes.error) throw convRes.error
      // Esconde conversas "excluídas para mim" enquanto não houver mensagem
      // mais nova que o cleared_at (reaparecem com atividade nova — estilo WhatsApp).
      const clearedMap = new Map<string, string | null>()
      for (const p of (partsRes.data ?? []) as { conversation_id: string; cleared_at: string | null }[]) {
        clearedMap.set(p.conversation_id, p.cleared_at)
      }
      return ((convRes.data ?? []) as VwCreatorConversation[]).filter((c) => {
        const cleared = clearedMap.get(c.conversation_id)
        if (!cleared) return true
        return (
          !!c.last_message_created_at &&
          new Date(c.last_message_created_at).getTime() > new Date(cleared).getTime()
        )
      })
    },
    enabled: !!user?.id,
    // Fallback contra Realtime quebrado: refaz a lista a cada 5s para que a
    // última mensagem / unread_count atualizem mesmo sem postgres_changes.
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  })

  // Realtime: nova mensagem de outra pessoa → atualiza a lista
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=neq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ['vw_creator_conversations', user.id] }),
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          console.warn('[conversations-realtime]', status)
        }
      })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, queryClient])

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true
    const term = search.toLowerCase()
    return (
      (c.peer_name ?? '').toLowerCase().includes(term) ||
      (c.last_message ?? '').toLowerCase().includes(term)
    )
  })

  function handleOpen(conv: VwCreatorConversation) {
    navigate(`/chat/${conv.conversation_id}`, {
      state: {
        peerId: conv.peer_id,
        peerName: conv.peer_name,
        peerAvatarUrl: conv.peer_avatar_url,
      },
    })
  }

  // Excluir a conversa só para mim (some da minha lista; o outro mantém).
  async function confirmDelete() {
    const conv = pendingDelete
    if (!conv) return
    setPendingDelete(null)
    const { error } = await supabase.rpc('clear_conversation', {
      p_conversation_id: conv.conversation_id,
    })
    if (error) {
      console.error('Erro ao excluir conversa:', error)
      return
    }
    queryClient.invalidateQueries({ queryKey: ['vw_creator_conversations', user?.id] })
    if (selectedId === conv.conversation_id) navigate('/chat')
  }

  return (
    <div className="h-[calc(100dvh-4rem)] md:h-screen md:p-6 bg-[hsl(var(--background))]">
      <div className="flex h-full overflow-hidden bg-[hsl(var(--background))] md:rounded-2xl md:border md:border-[hsl(var(--border))]">
      {/* ── Painel esquerdo: lista de conversas ──────────────────────────── */}
      <aside
        className={`${
          hasSelection ? 'hidden md:flex' : 'flex'
        } w-full md:w-[360px] shrink-0 flex-col border-r border-[hsl(var(--border))]`}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-[hsl(var(--border))]">
          <div className="flex items-center justify-between px-4 py-4">
            {isSearchOpen ? (
              <div className="flex items-center gap-3 flex-1">
                <div className="flex-1 flex items-center gap-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-full px-4 h-10">
                  <Search className="w-4 h-4 text-[hsl(var(--muted-foreground))] shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    placeholder={t('chat.conversations.searchPlaceholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] outline-none"
                  />
                </div>
                <button
                  onClick={() => {
                    setSearch('')
                    setIsSearchOpen(false)
                  }}
                  className="p-1 text-[hsl(var(--muted-foreground))]"
                  aria-label={t('chat.conversations.closeSearch')}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">
                  {t('chat.conversations.title')}
                </h1>
                <div className="flex items-center gap-2">
                  {conversations.length > 0 && (
                    <span className="text-xs bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] px-2.5 py-0.5 rounded-full font-medium">
                      {conversations.length}
                    </span>
                  )}
                  <button
                    onClick={() => setIsSearchOpen(true)}
                    className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                    aria-label={t('common.search')}
                  >
                    <Search className="w-5 h-5" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="divide-y divide-[hsl(var(--border))]">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-4 animate-pulse">
                  <div className="w-12 h-12 rounded-full bg-[hsl(var(--muted))] shrink-0" />
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="h-4 w-32 rounded bg-[hsl(var(--muted))]" />
                    <div className="h-3 w-48 rounded bg-[hsl(var(--muted))]" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 px-8 text-center">
              <div className="w-16 h-16 rounded-full bg-[hsl(var(--card))] flex items-center justify-center">
                <MessageCircle className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
              </div>
              <div>
                <p className="text-[hsl(var(--foreground))] font-medium">
                  {search ? t('chat.conversations.noResults') : t('chat.conversations.empty')}
                </p>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  {search
                    ? t('chat.conversations.noResultsHint')
                    : t('chat.conversations.emptyHint')}
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {filtered.map((conv) => {
                const unread = conv.unread_count ?? 0
                const active = conv.conversation_id === selectedId
                return (
                  <li
                    key={conv.conversation_id}
                    className={`group flex items-stretch ${
                      active ? 'bg-[hsl(var(--card))]' : 'hover:bg-[hsl(var(--card))]'
                    }`}
                  >
                    <button
                      onClick={() => handleOpen(conv)}
                      className="flex-1 min-w-0 flex items-center gap-3 px-4 py-4 text-left"
                    >
                      <Avatar url={conv.peer_avatar_url} name={conv.peer_name} />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm truncate ${
                            unread > 0
                              ? 'font-semibold text-[hsl(var(--foreground))]'
                              : 'font-medium text-[hsl(var(--foreground))]'
                          }`}
                        >
                          {conv.peer_name ?? t('chat.conversations.noName')}
                        </p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">
                          {conv.last_message ?? t('chat.conversations.startConversation')}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          {formatTime(conv.last_message_created_at, t('chat.page.yesterday'))}
                        </span>
                        {unread > 0 && (
                          <span className="w-5 h-5 rounded-full bg-[hsl(var(--primary))] text-white text-[10px] font-semibold flex items-center justify-center">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => setPendingDelete(conv)}
                      className="shrink-0 px-3 flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-red-400 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                      aria-label={t('chat.deleteConversation')}
                      title={t('chat.deleteConversation')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Painel direito: conversa selecionada (ou placeholder) ─────────── */}
      <section
        className={`${hasSelection ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col`}
      >
        <Outlet />
      </section>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title={t('chat.deleteConversation')}
        message={t('chat.deleteConfirm')}
        confirmLabel={t('chat.deleteConversation')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
