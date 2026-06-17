import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

/**
 * Total de mensagens não lidas do usuário (soma de `unread_count` de todas as
 * conversas na view `vw_creator_conversations`). Atualiza em tempo real quando
 * chega mensagem nova de outra pessoa, e cai sozinho quando o usuário lê uma
 * conversa (ChatPage marca `last_read_at` e invalida `['vw_creator_conversations']`,
 * cujo prefixo também atinge esta query). Polling de 5s como rede de segurança.
 *
 * Usado para o badge do item "Chat" na navegação. Como o NavBar é montado uma
 * única vez (AppShell), pode chamar este hook diretamente.
 */
export function useUnreadMessages(): number {
  // Usa `profile.id` (persistido no localStorage, disponível já no load) e não
  // `user.id` (só populado após o AuthProvider resolver a sessão) — mesmo padrão
  // do ChatLayout/ChatPage. Com `user.id` a query ficava desabilitada e o badge 0.
  const userId = useAuthStore((s) => s.profile?.id)
  const queryClient = useQueryClient()

  const { data: total = 0 } = useQuery({
    queryKey: ['vw_creator_conversations', 'unread-total', userId],
    enabled: !!userId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_creator_conversations')
        .select('unread_count')
        .eq('profile_id', userId!)
      if (error) return 0
      return (data ?? []).reduce((sum, row) => sum + (row.unread_count ?? 0), 0)
    },
  })

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('unread-messages-badge')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=neq.${userId}` },
        () =>
          queryClient.invalidateQueries({
            queryKey: ['vw_creator_conversations', 'unread-total', userId],
          }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, queryClient])

  return total
}
