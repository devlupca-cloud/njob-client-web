-- ============================================================================
-- fn_mark_live_started — registra o início real da live (host vai ao vivo)
-- ============================================================================
-- Gravado quando o creator (host) entra na sala. Idempotente, SECURITY DEFINER
-- (bypassa RLS). Marca status='live' (se estava 'scheduled') e retorna
-- actual_start_time. Usado pelas salas de live para calcular o fechamento
-- automático (actual_start_time + estimated_duration_minutes).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_mark_live_started(p_live_stream_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_creator uuid;
  v_start   timestamptz;
BEGIN
  SELECT creator_id, actual_start_time INTO v_creator, v_start
    FROM public.live_streams WHERE id = p_live_stream_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'live_not_found'; END IF;
  IF v_uid IS NULL OR v_uid <> v_creator THEN RAISE EXCEPTION 'not_host'; END IF;

  IF v_start IS NULL THEN
    UPDATE public.live_streams
       SET actual_start_time = now(),
           status = CASE WHEN status = 'scheduled' THEN 'live'::live_stream_status ELSE status END
     WHERE id = p_live_stream_id AND actual_start_time IS NULL
    RETURNING actual_start_time INTO v_start;
    IF v_start IS NULL THEN
      SELECT actual_start_time INTO v_start FROM public.live_streams WHERE id = p_live_stream_id;
    END IF;
  END IF;
  RETURN v_start;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_mark_live_started(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_mark_live_started(uuid) TO authenticated;
