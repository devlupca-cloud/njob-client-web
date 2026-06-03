-- ============================================================================
-- Exclusão de conta — RPCs de solicitar e cancelar (chamadas pelo cliente)
-- ============================================================================
-- Ambas SECURITY DEFINER e agem APENAS sobre a linha do auth.uid(), então não
-- dependem de RLS e um usuário nunca consegue marcar/cancelar a conta de outro.
-- profiles não tem trigger de transição, então não há bypass de GUC aqui.
-- ============================================================================

-- ─── Solicitar exclusão ─────────────────────────────────────────────────────
-- Marca deletion_requested_at=now(), oculta a conta (is_active=false) e derruba
-- a presença/disponibilidade do creator. Retorna a data prevista de exclusão.
CREATE OR REPLACE FUNCTION public.fn_request_account_deletion()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
     SET deletion_requested_at = v_now,
         is_active = false,
         is_available_for_calls = false,
         updated_at = v_now
   WHERE id = v_uid
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found_or_deleted';
  END IF;

  -- Auto-offline: tira o creator do ar imediatamente (se houver presença).
  UPDATE public.creator_presence
     SET online = false,
         source = 'deletion',
         updated_at = v_now
   WHERE creator_id = v_uid;

  RETURN v_now + interval '30 days';
END;
$$;

REVOKE ALL ON FUNCTION public.fn_request_account_deletion() FROM public;
GRANT EXECUTE ON FUNCTION public.fn_request_account_deletion() TO authenticated;

-- ─── Cancelar exclusão ──────────────────────────────────────────────────────
-- Chamada automaticamente no login enquanto a conta estiver pendente. Reativa
-- a conta. Não toca em creator_presence (o creator volta a ficar online manualmente).
CREATE OR REPLACE FUNCTION public.fn_cancel_account_deletion()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
     SET deletion_requested_at = NULL,
         is_active = true,
         updated_at = v_now
   WHERE id = v_uid
     AND deletion_requested_at IS NOT NULL
     AND deleted_at IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_cancel_account_deletion() FROM public;
GRANT EXECUTE ON FUNCTION public.fn_cancel_account_deletion() TO authenticated;
