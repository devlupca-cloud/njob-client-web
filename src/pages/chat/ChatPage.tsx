import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Send, Check, CheckCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VwMessage {
  message_id: string | null
  conversation_id: string | null
  sender_id: string | null
  sender_name: string | null
  sender_avatar_url: string | null
  content: string | null
  created_at: string | null
  client_id: string | null
  client_name: string | null
  client_avatar_url: string | null
  client_last_read_at: string | null
  creator_id: string | null
  creator_name: string | null
  creator_avatar_url: string | null
  creator_last_read_at: string | null
  is_read_by_client: boolean | null
  is_read_by_creator: boolean | null
}

interface RawMessage {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
  media_url: string | null
  media_type: string | null
  is_read: boolean
}

interface LocationState {
  peerId?: string
  peerName?: string
  peerAvatarUrl?: string
  peerIsOnline?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(isoString: string | null): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDateLabel(isoString: string | null): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (isToday) return 'Hoje'

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  if (isYesterday) return 'Ontem'

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function isSameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  url,
  name,
  isOnline,
  size = 'md',
}: {
  url: string | null
  name: string | null
  isOnline?: boolean
  size?: 'sm' | 'md'
}) {
  const initials = (name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()

  const dim = size === 'sm' ? 'w-8 h-8' : 'w-11 h-11'
  const text = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <div className={`relative ${dim} shrink-0`}>
      {url ? (
        <img src={url} alt={name ?? ''} className={`${dim} rounded-full object-cover`} />
      ) : (
        <div
          className={`${dim} rounded-full bg-[hsl(var(--primary))] flex items-center justify-center text-white ${text} font-semibold`}
        >
          {initials}
        </div>
      )}
      {isOnline && (
        <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[hsl(var(--background))]" />
      )}
    </div>
  )
}

// ─── Date divider ─────────────────────────────────────────────────────────────

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-4 px-2">
      <div className="flex-1 h-px bg-[hsl(var(--border))]" />
      <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">{label}</span>
      <div className="flex-1 h-px bg-[hsl(var(--border))]" />
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isMine,
}: {
  msg: VwMessage
  isMine: boolean
}) {
  const isRead = isMine ? msg.is_read_by_client : msg.is_read_by_creator

  if (isMine) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[72%] rounded-tl-2xl rounded-tr-sm rounded-bl-2xl rounded-br-2xl px-4 pt-3 pb-2"
          style={{ backgroundColor: 'hsl(var(--primary))' }}
        >
          <p className="text-white text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {msg.content ?? ''}
          </p>
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[11px] text-white/70">{formatTime(msg.created_at)}</span>
            {isRead ? (
              <CheckCheck className="w-3 h-3 text-white/70" />
            ) : (
              <Check className="w-3 h-3 text-white/70" />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[72%] rounded-tl-sm rounded-tr-2xl rounded-bl-2xl rounded-br-2xl px-4 pt-3 pb-2 bg-[hsl(var(--card))]">
        <p className="text-[hsl(var(--foreground))] text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          {msg.content ?? ''}
        </p>
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
            {formatTime(msg.created_at)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── ChatPage ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const { id: conversationId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [messages, setMessages] = useState<VwMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isSending, setIsSending] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Fetch messages via vw_messages ──────────────────────────────────────────

  const { isLoading } = useQuery({
    queryKey: ['vw_messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('vw_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (error) throw error
      const rows = (data ?? []) as VwMessage[]
      setMessages(rows)
      return rows
    },
    enabled: !!conversationId,
  })

  // ── Scroll to bottom ────────────────────────────────────────────────────────

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior })
    }, 80)
  }, [])

  useEffect(() => {
    if (messages.length > 0) scrollToBottom('auto')
  }, [messages.length, scrollToBottom])

  // ── Mark messages as read ───────────────────────────────────────────────────

  useEffect(() => {
    if (!conversationId || !user?.id) return
    supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('profile_id', user.id)
      .then(() => {
        // invalidate conversations list so unread count updates
        queryClient.invalidateQueries({ queryKey: ['vw_creator_conversations'] })
      })
  }, [conversationId, user?.id, queryClient])

  // ── Realtime subscription ───────────────────────────────────────────────────

  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const raw = payload.new as RawMessage

          // Re-fetch from vw_messages to get all enriched fields for this message
          const { data } = await supabase
            .from('vw_messages')
            .select('*')
            .eq('message_id', raw.id)
            .maybeSingle()

          if (data) {
            const enriched = data as VwMessage
            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.message_id === enriched.message_id)) return prev
              return [...prev, enriched]
            })
            scrollToBottom()
          } else {
            // Fallback: build a minimal VwMessage from the raw INSERT payload
            const fallback: VwMessage = {
              message_id: raw.id,
              conversation_id: raw.conversation_id,
              sender_id: raw.sender_id,
              sender_name: null,
              sender_avatar_url: null,
              content: raw.content,
              created_at: raw.created_at,
              client_id: null,
              client_name: null,
              client_avatar_url: null,
              client_last_read_at: null,
              creator_id: null,
              creator_name: null,
              creator_avatar_url: null,
              creator_last_read_at: null,
              is_read_by_client: false,
              is_read_by_creator: false,
            }
            setMessages((prev) => {
              if (prev.some((m) => m.message_id === fallback.message_id)) return prev
              return [...prev, fallback]
            })
            scrollToBottom()
          }

          // Mark as read when the incoming message is from someone else
          if (raw.sender_id !== user?.id) {
            supabase
              .from('conversation_participants')
              .update({ last_read_at: new Date().toISOString() })
              .eq('conversation_id', conversationId)
              .eq('profile_id', user?.id ?? '')
              .then(() => {
                queryClient.invalidateQueries({ queryKey: ['vw_creator_conversations'] })
              })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, user?.id, scrollToBottom, queryClient])

  // ── Auto-grow textarea ──────────────────────────────────────────────────────

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputText(e.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Send message ────────────────────────────────────────────────────────────

  async function handleSend() {
    const text = inputText.trim()
    if (!text || isSending || !conversationId || !user?.id) return

    setIsSending(true)
    setInputText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: text,
    })

    setIsSending(false)

    if (error) {
      console.error('Erro ao enviar mensagem:', error)
      setInputText(text)
    }
  }

  // ── Peer info (from location state or first message) ────────────────────────

  const peerName =
    state.peerName ??
    (messages.length > 0
      ? messages[0].sender_id !== user?.id
        ? messages[0].sender_name
        : messages[0].creator_id !== user?.id
          ? messages[0].creator_name
          : messages[0].client_name
      : null)

  const peerAvatarUrl =
    state.peerAvatarUrl ??
    (messages.length > 0
      ? messages[0].sender_id !== user?.id
        ? messages[0].sender_avatar_url
        : messages[0].creator_id !== user?.id
          ? messages[0].creator_avatar_url
          : messages[0].client_avatar_url
      : null)

  const peerIsOnline = state.peerIsOnline ?? false

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col bg-[hsl(var(--background))]"
      style={{ height: 'calc(100vh - 4rem)' }}
    >
      {/* Header */}
      <div className="shrink-0 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
      <div className="flex items-center gap-3 px-4 py-3 max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/chat')}
          className="p-1.5 -ml-1.5 text-[hsl(var(--foreground))] rounded-full hover:bg-[hsl(var(--card))] transition-colors"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <Avatar url={peerAvatarUrl} name={peerName} isOnline={peerIsOnline} />

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[hsl(var(--foreground))] truncate">
            {peerName ?? 'Conversa'}
          </p>
          {peerIsOnline && (
            <p className="text-xs text-green-500">Online</p>
          )}
        </div>
      </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-[hsl(var(--card)/0.3)]">
      <div className="max-w-3xl mx-auto px-4 py-3">
        {isLoading ? (
          /* Loading skeleton */
          <div className="flex flex-col gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="h-10 rounded-2xl bg-[hsl(var(--muted))] animate-pulse"
                  style={{ width: `${40 + Math.random() * 30}%` }}
                />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <div className="w-14 h-14 rounded-full bg-[hsl(var(--card))] flex items-center justify-center">
              <Send className="w-6 h-6 text-[hsl(var(--muted-foreground))]" />
            </div>
            <p className="text-[hsl(var(--muted-foreground))] text-sm">
              Envie uma mensagem para iniciar a conversa
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((msg, index) => {
              const isMine = msg.sender_id === user?.id
              const prevMsg = messages[index - 1] ?? null
              const showDateDivider =
                index === 0 || !isSameDay(prevMsg?.created_at ?? null, msg.created_at)

              return (
                <div key={msg.message_id ?? index}>
                  {showDateDivider && (
                    <DateDivider label={formatDateLabel(msg.created_at)} />
                  )}
                  <MessageBubble msg={msg} isMine={isMine} />
                </div>
              )
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      </div>

      {/* Input bar */}
      <div className="shrink-0 bg-[hsl(var(--background))] border-t border-[hsl(var(--border))]">
      <div className="flex items-end gap-3 px-4 py-3 max-w-3xl mx-auto">
        <div className="flex-1 flex items-end bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl px-4 py-2.5 min-h-[44px]">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Escreva sua mensagem..."
            className="flex-1 bg-transparent resize-none outline-none text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] leading-relaxed max-h-[120px] overflow-y-auto"
          />
        </div>

        <button
          onClick={handleSend}
          disabled={!inputText.trim() || isSending}
          aria-label="Enviar mensagem"
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all"
          style={{
            backgroundColor:
              inputText.trim() && !isSending
                ? 'hsl(var(--primary))'
                : 'hsl(var(--muted))',
          }}
        >
          {isSending ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send
              className="w-4 h-4"
              style={{
                color:
                  inputText.trim()
                    ? 'white'
                    : 'hsl(var(--muted-foreground))',
              }}
            />
          )}
        </button>
      </div>
      </div>
    </div>
  )
}
