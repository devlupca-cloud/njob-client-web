-- ============================================================================
-- RLS do fluxo novo de Videochamada Individual
-- ============================================================================

-- ─── one_on_one_calls ──────────────────────────────────────────────────────

-- A policy antiga permitia qualquer participante fazer UPDATE livremente.
-- Substituímos por duas policies que separam "decisão do creator" e
-- "cancelamento do cliente". As regras de transição (quem pode ir para qual
-- status) são impostas pelo trigger fn_validate_call_transition (migration A3).
DROP POLICY IF EXISTS "calls_update_participant" ON public.one_on_one_calls;

CREATE POLICY "calls_update_creator_decision"
  ON public.one_on_one_calls
  FOR UPDATE
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "calls_update_user_cancel"
  ON public.one_on_one_calls
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- INSERT: só o próprio cliente cria a request. service_role (webhook, etc.)
-- continua operando via bypass de RLS.
DROP POLICY IF EXISTS "calls_insert_own" ON public.one_on_one_calls;

CREATE POLICY "calls_insert_user"
  ON public.one_on_one_calls
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- SELECT já tratado pela policy existente "calls_select_participant".

-- ─── creator_presence ──────────────────────────────────────────────────────

ALTER TABLE public.creator_presence ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode consultar se um creator está online (botão de solicitar
-- videochamada no perfil público depende disso).
DROP POLICY IF EXISTS "presence_select_all" ON public.creator_presence;
CREATE POLICY "presence_select_all"
  ON public.creator_presence
  FOR SELECT USING (true);

-- Apenas o próprio creator insere/atualiza sua presença.
DROP POLICY IF EXISTS "presence_insert_own" ON public.creator_presence;
CREATE POLICY "presence_insert_own"
  ON public.creator_presence
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "presence_update_own" ON public.creator_presence;
CREATE POLICY "presence_update_own"
  ON public.creator_presence
  FOR UPDATE USING (auth.uid() = creator_id);
