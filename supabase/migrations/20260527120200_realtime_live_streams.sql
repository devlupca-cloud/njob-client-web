-- ============================================================================
-- Realtime para live_streams — propagação instantânea do fim da live
-- ============================================================================
-- live_streams não estava na publicação supabase_realtime (só one_on_one_calls,
-- creator_presence e profiles). Sem isso, quando a live encerra (host sai, cron
-- marca 'finished', ou trigger futura), os clients só descobriam no próximo
-- fetch/polling. Publicando a tabela + REPLICA IDENTITY FULL, os clients que
-- assinam postgres_changes em live_streams reagem na hora à mudança de status.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'live_streams'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.live_streams';
  END IF;
END $$;

-- REPLICA IDENTITY FULL para o Realtime emitir todas as colunas no UPDATE
-- (status, actual_start_time, etc.), e não só a PK.
ALTER TABLE public.live_streams REPLICA IDENTITY FULL;
