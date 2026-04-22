import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { OneOnOneCall } from '@/types'

/**
 * Observa uma call pelo id e retorna o estado atual em tempo real.
 * Usa Supabase Realtime (postgres_changes) + fetch inicial.
 */
export function useCallStatus(callId: string | null | undefined) {
  const [call, setCall] = useState<OneOnOneCall | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchNow = useCallback(async () => {
    if (!callId) return
    setLoading(true)
    const { data } = await supabase
      .from('one_on_one_calls')
      .select('*')
      .eq('id', callId)
      .maybeSingle()
    setCall((data as unknown as OneOnOneCall | null) ?? null)
    setLoading(false)
  }, [callId])

  useEffect(() => {
    if (!callId) {
      setCall(null)
      return
    }

    void fetchNow()

    const channel = supabase
      .channel(`call:${callId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'one_on_one_calls',
          filter: `id=eq.${callId}`,
        },
        (payload) => {
          const next = (payload.new ?? null) as OneOnOneCall | null
          if (next) setCall(next)
        },
      )
      .subscribe()

    // Polling de segurança (3s): se o Realtime atrasar/falhar, a UI ainda
    // reage em até 3s à transição de status (aceito → pago → etc).
    const pollId = setInterval(() => {
      void fetchNow()
    }, 3000)

    return () => {
      clearInterval(pollId)
      void supabase.removeChannel(channel)
    }
  }, [callId, fetchNow])

  return { call, loading, refetch: fetchNow }
}
