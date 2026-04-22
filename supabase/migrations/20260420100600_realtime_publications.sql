-- ============================================================================
-- Publicações Realtime para o novo fluxo
-- ============================================================================
-- one_on_one_calls → cliente/creator reagem a mudança de status.
-- creator_presence → client_web mostra botão de solicitar só se creator online.
-- profiles → toggle is_available_for_calls também observado via Realtime.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'one_on_one_calls'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.one_on_one_calls';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'creator_presence'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.creator_presence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles';
  END IF;
END $$;

-- REPLICA IDENTITY FULL é essencial para o Realtime emitir todas as colunas
-- em UPDATEs (sem isso o cliente não vê o campo status mudando).
ALTER TABLE public.one_on_one_calls REPLICA IDENTITY FULL;
ALTER TABLE public.creator_presence REPLICA IDENTITY FULL;
