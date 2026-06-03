import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Send, Check, CheckCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from 'react-i18next'

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
  /** Coluna legada da view (sempre false) — o chat não tem mais paywall. */
  is_locked: boolean | null
}

// Paginação estilo WhatsApp: carrega as N mensagens mais recentes e busca lotes
// mais antigos conforme o usuário rola para o topo.
const PAGE_SIZE = 30

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
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatDateLabel(isoString: string | null): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (isToday) return '_TODAY_'

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  if (isYesterday) return '_YESTERDAY_'

  return date.toLocaleDateString(undefined, {
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
  // Check-duplo na minha mensagem aparece quando o OUTRO leu. No client_web o
  // remetente é tipicamente o cliente — quem leu é o creator. is_read_by_creator
  // (não is_read_by_client) é o sinal correto. Para mensagens recebidas o ícone
  // não é desenhado, então a outra metade do ternário fica inerte.
  const isRead = isMine ? msg.is_read_by_creator : msg.is_read_by_client

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
  const { t } = useTranslation()

  const [messages, setMessages] = useState<VwMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasMoreOlder, setHasMoreOlder] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // cleared_at do participante: mensagens anteriores à exclusão ficam ocultas.
  const clearedAtRef = useRef<string | null>(null)

  // ── Helpers de paginação ─────────────────────────────────────────────────────

  // Mantém apenas mensagens posteriores ao meu cleared_at (exclusão estilo WhatsApp).
  const applyClearedFilter = useCallback((rows: VwMessage[]): VwMessage[] => {
    const c = clearedAtRef.current
    if (!c) return rows
    const clearedMs = new Date(c).getTime()
    return rows.filter((m) => !!m.created_at && new Date(m.created_at).getTime() > clearedMs)
  }, [])

  // Mescla lotes (recentes, antigos, realtime) por message_id, mantendo ordem
  // cronológica. Lotes novos sobrescrevem os antigos (atualiza recibos de leitura)
  // e nada é descartado — preserva o histórico já carregado ao paginar.
  const mergeRows = useCallback((incoming: VwMessage[]) => {
    setMessages((prev) => {
      const map = new Map<string, VwMessage>()
      for (const m of prev) if (m.message_id) map.set(m.message_id, m)
      for (const m of incoming) if (m.message_id) map.set(m.message_id, m)
      return Array.from(map.values()).sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0
        return ta - tb
      })
    })
  }, [])

  // ── Scroll to bottom ────────────────────────────────────────────────────────

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior })
    }, 80)
  }, [])

  // Está perto do fim? (decide se auto-rola ao chegar mensagem nova)
  const isNearBottom = useCallback((): boolean => {
    const c = scrollRef.current
    if (!c) return true
    return c.scrollHeight - c.scrollTop - c.clientHeight < 120
  }, [])

  // ── Carga inicial (mensagens mais recentes) ──────────────────────────────────

  useEffect(() => {
    if (!conversationId) return
    let active = true
    ;(async () => {
      setIsLoading(true)
      setMessages([])
      setHasMoreOlder(false)
      // cleared_at primeiro, para o filtro valer já na carga inicial.
      clearedAtRef.current = null
      if (user?.id) {
        const { data: part } = await supabase
          .from('conversation_participants')
          .select('cleared_at')
          .eq('conversation_id', conversationId)
          .eq('profile_id', user.id)
          .maybeSingle()
        if (!active) return
        clearedAtRef.current = (part as { cleared_at: string | null } | null)?.cleared_at ?? null
      }

      let q = supabase
        .from('vw_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (clearedAtRef.current) q = q.gt('created_at', clearedAtRef.current)
      const { data, error } = await q
      if (!active) return
      if (!error) {
        const rawDesc = (data ?? []) as VwMessage[]
        setHasMoreOlder(rawDesc.length === PAGE_SIZE)
        setMessages(rawDesc.slice().reverse())
      }
      setIsLoading(false)
      scrollToBottom('auto')
    })()
    return () => {
      active = false
    }
  }, [conversationId, user?.id, scrollToBottom])

  // ── Carregar mensagens mais antigas (scroll para o topo) ─────────────────────

  const loadOlder = useCallback(async () => {
    if (!conversationId || isLoadingOlder || !hasMoreOlder) return
    const oldest = messages[0]?.created_at
    if (!oldest) return
    setIsLoadingOlder(true)
    const container = scrollRef.current
    const prevHeight = container?.scrollHeight ?? 0
    const prevTop = container?.scrollTop ?? 0

    let q = supabase
      .from('vw_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (clearedAtRef.current) q = q.gt('created_at', clearedAtRef.current)
    const { data, error } = await q

    if (!error) {
      const rawDesc = (data ?? []) as VwMessage[]
      setHasMoreOlder(rawDesc.length === PAGE_SIZE)
      if (rawDesc.length > 0) {
        mergeRows(rawDesc)
        // Preserva a posição de leitura ao prepender o lote antigo.
        requestAnimationFrame(() => {
          const c = scrollRef.current
          if (c) c.scrollTop = c.scrollHeight - prevHeight + prevTop
        })
      }
    }
    setIsLoadingOlder(false)
  }, [conversationId, isLoadingOlder, hasMoreOlder, messages, mergeRows])

  const handleScroll = useCallback(() => {
    const c = scrollRef.current
    if (!c) return
    if (c.scrollTop <= 60 && hasMoreOlder && !isLoadingOlder) {
      void loadOlder()
    }
  }, [hasMoreOlder, isLoadingOlder, loadOlder])

  // ── Sincroniza janela recente (poll + realtime) ──────────────────────────────
  // Refaz só o lote recente da view (mascarada) e mescla: atualiza recibos de
  // leitura e traz mensagens novas do outro lado sem descartar o histórico já
  // carregado nem mexer no scroll quando o usuário está lendo mensagens antigas.
  const syncRecent = useCallback(async () => {
    if (!conversationId) return
    let q = supabase
      .from('vw_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (clearedAtRef.current) q = q.gt('created_at', clearedAtRef.current)
    const { data, error } = await q
    if (error) return
    const rawDesc = (data ?? []) as VwMessage[]
    mergeRows(applyClearedFilter(rawDesc.slice().reverse()))
  }, [conversationId, mergeRows, applyClearedFilter])

  // Fallback contra Realtime quebrado: sincroniza a janela recente a cada 4s.
  useEffect(() => {
    if (!conversationId) return
    const id = setInterval(() => {
      void syncRecent()
    }, 4000)
    return () => clearInterval(id)
  }, [conversationId, syncRecent])

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

          // Ressincronizamos a janela recente pela view vw_messages em vez de
          // confiar no payload cru do Realtime (que não traz os campos derivados
          // da view). Só auto-rola se o usuário já estava perto do fim, para não
          // interromper a leitura de mensagens antigas.
          const stick = isNearBottom() || raw.sender_id === user?.id
          await syncRecent()
          if (stick) scrollToBottom()

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
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          console.warn(`[chat-realtime] ${conversationId}:`, status)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, user?.id, scrollToBottom, queryClient, syncRecent, isNearBottom])

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

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: text,
      })
      .select('id, conversation_id, sender_id, content, created_at')
      .single()

    setIsSending(false)

    if (error || !data) {
      console.error('Erro ao enviar mensagem:', error)
      setInputText(text)
      return
    }

    // Optimistic update: o remetente vê a própria mensagem na hora, sem depender
    // de Realtime. A subscription cuida das mensagens do outro lado.
    const raw = data as RawMessage
    const optimistic: VwMessage = {
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
      is_locked: false,
    }
    setMessages((prev) => {
      if (prev.some((m) => m.message_id === raw.id)) return prev
      return [...prev, optimistic]
    })
    scrollToBottom()
    queryClient.invalidateQueries({ queryKey: ['vw_creator_conversations'] })
  }

  // ── Peer info (from location state or first message) ────────────────────────

  const peerInfo = (() => {
    if (state.peerName) return { name: state.peerName, avatar: state.peerAvatarUrl ?? null }
    if (messages.length === 0) return { name: null, avatar: null }
    const first = messages[0]
    const isOtherSender = first.sender_id !== user?.id
    if (isOtherSender) return { name: first.sender_name, avatar: first.sender_avatar_url }
    const isCreatorPeer = first.creator_id !== user?.id
    return isCreatorPeer
      ? { name: first.creator_name, avatar: first.creator_avatar_url }
      : { name: first.client_name, avatar: first.client_avatar_url }
  })()

  const peerName = peerInfo.name
  const peerAvatarUrl = peerInfo.avatar

  const peerIsOnline = state.peerIsOnline ?? false

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col w-full h-full min-h-0 bg-[hsl(var(--background))]">
      {/* Header */}
      <div className="shrink-0 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
      <div className="flex items-center gap-3 px-4 py-3 max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/chat')}
          className="md:hidden p-1.5 -ml-1.5 text-[hsl(var(--foreground))] rounded-full hover:bg-[hsl(var(--card))] transition-colors"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <Avatar url={peerAvatarUrl} name={peerName} isOnline={peerIsOnline} />

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[hsl(var(--foreground))] truncate">
            {peerName ?? t('chat.page.title')}
          </p>
          {peerIsOnline && (
            <p className="text-xs text-green-500">{t('chat.page.online')}</p>
          )}
        </div>
      </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-[hsl(var(--card)/0.3)]"
      >
      <div className="max-w-3xl mx-auto px-4 py-3">
        {/* Spinner de carregamento de mensagens antigas (scroll para o topo) */}
        {isLoadingOlder && (
          <div className="flex justify-center py-3">
            <div className="w-5 h-5 border-2 border-[hsl(var(--muted-foreground))] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {isLoading ? (
          /* Loading skeleton */
          <div className="flex flex-col gap-4">
            {[65, 45, 55, 40, 60].map((w, i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="h-10 rounded-2xl bg-[hsl(var(--muted))] animate-pulse"
                  style={{ width: `${w}%` }}
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
              {t('chat.page.emptyHint')}
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
                    <DateDivider label={formatDateLabel(msg.created_at).replace('_TODAY_', t('chat.page.today')).replace('_YESTERDAY_', t('chat.page.yesterday'))} />
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
            placeholder={t('chat.page.inputPlaceholder')}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] leading-relaxed max-h-[120px] overflow-y-auto"
          />
        </div>

        <button
          onClick={handleSend}
          disabled={!inputText.trim() || isSending}
          aria-label={t('chat.page.send')}
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
