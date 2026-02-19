import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, X, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VwCreatorConversation {
  conversation_id: string
  profile_id: string
  peer_id: string
  peer_name: string | null
  peer_avatar_url: string | null
  peer_is_online: boolean | null
  last_message: string | null
  last_message_created_at: string | null
  last_message_time: string | null
  last_message_read_by_client: boolean | null
  unread_count: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(isoString: string | null): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isToday) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()

  if (isYesterday) return 'Ontem'

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-4 animate-pulse">
      <div className="w-11 h-11 rounded-full bg-[hsl(var(--muted))] shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-4 w-32 rounded bg-[hsl(var(--muted))]" />
        <div className="h-3 w-48 rounded bg-[hsl(var(--muted))]" />
      </div>
      <div className="h-3 w-8 rounded bg-[hsl(var(--muted))]" />
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  url,
  name,
  isOnline,
}: {
  url: string | null
  name: string | null
  isOnline: boolean | null
}) {
  const initials = (name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()

  return (
    <div className="relative w-11 h-11 shrink-0">
      {url ? (
        <img
          src={url}
          alt={name ?? ''}
          className="w-11 h-11 rounded-full object-cover"
        />
      ) : (
        <div className="w-11 h-11 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center text-white text-sm font-semibold">
          {initials}
        </div>
      )}
      {isOnline && (
        <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[hsl(var(--background))]" />
      )}
    </div>
  )
}

// ─── ConversationsPage ────────────────────────────────────────────────────────

export default function ConversationsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [search, setSearch] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['vw_creator_conversations', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const { data, error } = await supabase
        .from('vw_creator_conversations')
        .select('*')
        .eq('profile_id', user.id)
        .order('last_message_created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as VwCreatorConversation[]
    },
    enabled: !!user?.id,
  })

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true
    const name = (c.peer_name ?? '').toLowerCase()
    const msg = (c.last_message ?? '').toLowerCase()
    const term = search.toLowerCase()
    return name.includes(term) || msg.includes(term)
  })

  function handleOpen(conv: VwCreatorConversation) {
    navigate(`/chat/${conv.conversation_id}`, {
      state: {
        peerId: conv.peer_id,
        peerName: conv.peer_name,
        peerAvatarUrl: conv.peer_avatar_url,
        peerIsOnline: conv.peer_is_online,
      },
    })
  }

  function handleCloseSearch() {
    setSearch('')
    setIsSearchOpen(false)
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] bg-[hsl(var(--background))]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="flex items-center justify-between px-4 py-4">
          {isSearchOpen ? (
            /* Search bar expanded */
            <div className="flex items-center gap-3 flex-1">
              <div className="flex-1 flex items-center gap-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-full px-4 h-10">
                <Search className="w-4 h-4 text-[hsl(var(--muted-foreground))] shrink-0" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Buscar conversa..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] outline-none"
                />
              </div>
              <button
                onClick={handleCloseSearch}
                className="p-1 text-[hsl(var(--muted-foreground))]"
                aria-label="Fechar busca"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            /* Default header */
            <>
              <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">
                Mensagens
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
                  aria-label="Buscar"
                >
                  <Search className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {isLoading ? (
          /* Skeletons */
          <div className="divide-y divide-[hsl(var(--border))]">
            {Array.from({ length: 6 }).map((_, i) => (
              <ConversationSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center gap-4 py-24 px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[hsl(var(--card))] flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
            </div>
            <div>
              <p className="text-[hsl(var(--foreground))] font-medium">
                {search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
              </p>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                {search
                  ? 'Tente buscar por outro nome'
                  : 'Suas mensagens com creators aparecerão aqui'}
              </p>
            </div>
          </div>
        ) : (
          /* List */
          <ul className="divide-y divide-[hsl(var(--border))]">
            {filtered.map((conv) => {
              const unread = conv.unread_count ?? 0
              return (
                <li key={conv.conversation_id}>
                  <button
                    onClick={() => handleOpen(conv)}
                    className="w-full flex items-center gap-3 px-4 py-4 hover:bg-[hsl(var(--card))] transition-colors text-left"
                  >
                    <Avatar
                      url={conv.peer_avatar_url}
                      name={conv.peer_name}
                      isOnline={conv.peer_is_online}
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm truncate ${
                          unread > 0
                            ? 'font-semibold text-[hsl(var(--foreground))]'
                            : 'font-medium text-[hsl(var(--foreground))]'
                        }`}
                      >
                        {conv.peer_name ?? 'Sem nome'}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {conv.last_message_read_by_client && (
                          <svg
                            className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))] shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M2 12l6 6L22 4" />
                            <path d="M8 12l6 6" />
                          </svg>
                        )}
                        <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                          {conv.last_message ?? 'Iniciar conversa'}
                        </p>
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        {formatTime(conv.last_message_created_at)}
                      </span>
                      {unread > 0 && (
                        <span className="w-5 h-5 rounded-full bg-[hsl(var(--primary))] text-white text-[10px] font-semibold flex items-center justify-center">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
