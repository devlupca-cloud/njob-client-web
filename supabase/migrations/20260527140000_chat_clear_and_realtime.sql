-- ============================================================================
-- "Excluir conversa só para mim" (estilo WhatsApp) + realtime do chat
-- ============================================================================
-- Excluir para mim = marca conversation_participants.cleared_at do MEU registro.
-- A partir daí o client/creator escondem a conversa da minha lista (enquanto não
-- houver mensagem mais nova que cleared_at) e ocultam as mensagens anteriores ao
-- cleared_at. O outro participante mantém tudo. Se chegar mensagem nova depois,
-- a conversa reaparece só com o conteúdo novo. Nenhuma view é alterada — o
-- filtro é aplicado na aplicação usando cleared_at.
-- ============================================================================

ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz;

-- RPC para limpar a conversa para o usuário autenticado. SECURITY DEFINER para
-- não depender de detalhes da policy de UPDATE da tabela.
CREATE OR REPLACE FUNCTION public.clear_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  UPDATE public.conversation_participants
     SET cleared_at = now(),
         last_read_at = now()
   WHERE conversation_id = p_conversation_id
     AND profile_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.clear_conversation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.clear_conversation(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Realtime: garante que messages e conversations estão publicados (o chat já
-- assinava postgres_changes em messages; versiona isso explicitamente).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations';
  END IF;
END $$;

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
