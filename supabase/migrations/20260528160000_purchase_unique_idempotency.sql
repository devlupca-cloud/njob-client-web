-- ============================================================================
-- UNIQUE PARCIAL em compras "completed" — defesa em camada contra duplicação
-- ============================================================================
-- handle-purchases-webhook agora reserva o lock em processed_webhook_events
-- ANTES de processar (INSERT ON CONFLICT) e rolla back no catch interno se
-- o handler falhar. Isso cobre 99% dos casos de Stripe retry simultâneo.
--
-- Estes UNIQUE parciais são a última linha de defesa: se por algum motivo
-- (bug, race entre handler/lock, manual UPDATE etc.) tentarem inserir uma
-- segunda compra "completed" para o mesmo (pack/live, user), o Postgres
-- recusa com 23505 antes de a linha duplicada existir.
--
-- "WHERE status='completed'" deixa passar compras em outros estados (pending,
-- failed, refunded) — o usuário pode comprar de novo se uma anterior falhou.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS pack_purchases_user_pack_completed_unique
  ON public.pack_purchases (pack_id, user_id)
  WHERE status = 'completed';

CREATE UNIQUE INDEX IF NOT EXISTS live_stream_tickets_user_live_completed_unique
  ON public.live_stream_tickets (live_stream_id, user_id)
  WHERE status = 'completed';
