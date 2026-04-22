import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Retorna se o creator está online para videochamada (creator_presence.online).
 * Fetch inicial + subscribe realtime.
 */
export function useCreatorOnline(creatorId: string | null | undefined) {
  const [online, setOnline] = useState<boolean>(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!creatorId) {
      setOnline(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const fetchInitial = async () => {
      const { data } = await supabase
        .from('creator_presence')
        .select('online')
        .eq('creator_id', creatorId)
        .maybeSingle()
      if (!cancelled) {
        setOnline(Boolean((data as { online?: boolean } | null)?.online))
        setLoading(false)
      }
    }

    void fetchInitial()

    const channel = supabase
      .channel(`presence-row:${creatorId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'creator_presence',
          filter: `creator_id=eq.${creatorId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old ?? null) as
            | { online?: boolean }
            | null
          setOnline(Boolean(row?.online))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [creatorId])

  return { online, loading }
}
