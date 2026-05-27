// Janelas de tempo de lives e videochamadas — fonte única de verdade.
// Antes esses valores e a lógica de "ainda está aberta?" estavam repetidos
// inline em HomePage, CreatorProfilePage, PurchasesPage e CallRoomPage, com
// risco de divergência. As edge functions (Deno) replicam a mesma regra de
// propósito, por serem módulos isolados — mantenha-as em sincronia com este
// arquivo ao alterar os valores.

/** Carência após o fim teórico da live antes de considerá-la encerrada. */
export const LIVE_GRACE_MS = 2 * 60 * 1000

/** Janela para entrar numa videochamada paga, contada a partir de paid_at. */
export const POST_PAID_CALL_WINDOW_MS = 2 * 60 * 60 * 1000

/** Carência após o fim de uma chamada agendada (fluxo legado 'confirmed'). */
export const LEGACY_CALL_GRACE_MS = 5 * 60 * 1000

type LiveWindowFields = {
  actual_start_time: string | null
  scheduled_start_time: string | null
  estimated_duration_minutes: number | null
}

/**
 * Uma live só está "ao vivo" enquanto a janela de duração não venceu. Âncora:
 * actual_start_time (host iniciou) ou scheduled_start_time (ainda não iniciou),
 * + duração + LIVE_GRACE_MS. Sem âncora, assume aberta (benefício da dúvida).
 * Mesma regra do fn_expire_stale_lives no backend.
 */
export function isLiveWindowOpen(live: LiveWindowFields): boolean {
  const anchor = live.actual_start_time ?? live.scheduled_start_time
  if (!anchor) return true
  const endMs =
    new Date(anchor).getTime() +
    (live.estimated_duration_minutes ?? 60) * 60_000 +
    LIVE_GRACE_MS
  return Date.now() < endMs
}
