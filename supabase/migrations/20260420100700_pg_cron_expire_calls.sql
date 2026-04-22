-- ============================================================================
-- Agendamento do job de expiração de calls (pg_cron a cada 30 segundos)
-- ============================================================================
-- O Supabase gerenciado expõe pg_cron. Se o ambiente local não tiver a
-- extensão, o CREATE EXTENSION abaixo falhará — nesse caso, agendar via
-- Supabase Scheduled Triggers (painel) apontando para fn_expire_pending_calls.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove agendamento anterior (idempotente).
DO $$
DECLARE
  v_job_id integer;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'expire-pending-calls';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

-- pg_cron menor granularidade é 1 minuto. Para 30s usamos o formato estendido
-- de 6 campos quando disponível; caso contrário, *-minute funciona com 1 min.
-- Supabase (Postgres 15+) aceita formato com segundos: '30 seconds'.
SELECT cron.schedule(
  'expire-pending-calls',
  '30 seconds',
  $$ SELECT public.fn_expire_pending_calls(); $$
);
