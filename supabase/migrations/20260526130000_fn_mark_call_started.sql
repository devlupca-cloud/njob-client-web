-- ============================================================================
-- fn_mark_call_started — registra o início real da videochamada
-- ============================================================================
-- Gravado por quem entra primeiro (cliente ou creator). Idempotente: só escreve
-- se actual_start_time for null. SECURITY DEFINER bypassa RLS para garantir a
-- escrita (o UPDATE direto via PostgREST estava falhando silenciosamente), e
-- valida que o chamador participa da call. Não toca em status, então não
-- envolve o trigger fn_validate_call_transition.
--
-- Usado pelas salas de videochamada (client_web CallRoomPage e creator_web
-- video-call/[id]) para calcular quando encerrar automaticamente
-- (actual_start_time + scheduled_duration_minutes).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_mark_call_started(p_call_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_creator uuid;
  v_user    uuid;
  v_start   timestamptz;
BEGIN
  SELECT creator_id, user_id, actual_start_time
    INTO v_creator, v_user, v_start
    FROM public.one_on_one_calls
   WHERE id = p_call_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'call_not_found';
  END IF;
  IF v_uid IS NULL OR (v_uid <> v_creator AND v_uid <> v_user) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  IF v_start IS NULL THEN
    UPDATE public.one_on_one_calls
       SET actual_start_time = now()
     WHERE id = p_call_id AND actual_start_time IS NULL
    RETURNING actual_start_time INTO v_start;

    IF v_start IS NULL THEN
      SELECT actual_start_time INTO v_start FROM public.one_on_one_calls WHERE id = p_call_id;
    END IF;
  END IF;

  RETURN v_start;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_mark_call_started(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_mark_call_started(uuid) TO authenticated;
