-- ============================================================================
-- Função para expirar solicitações de videochamada pendentes (timeout 2 min)
-- ============================================================================
-- Chamada pelo pg_cron a cada 30s (migration A6). Usa SECURITY DEFINER para
-- bypassar RLS e trigger (session_replication_role='replica' na transação).

CREATE OR REPLACE FUNCTION public.fn_expire_pending_calls()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL session_replication_role = 'replica';

  WITH affected AS (
    UPDATE public.one_on_one_calls
       SET status = 'expired',
           updated_at = now()
     WHERE status = 'requested'
       AND expires_at IS NOT NULL
       AND expires_at < now()
     RETURNING id
  )
  SELECT count(*) INTO v_count FROM affected;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_expire_pending_calls() FROM public;
GRANT EXECUTE ON FUNCTION public.fn_expire_pending_calls() TO service_role;
