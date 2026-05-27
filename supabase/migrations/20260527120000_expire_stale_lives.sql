-- ============================================================================
-- Encerramento automático de lives vencidas (server-side, não depende da aba)
-- ============================================================================
-- Problema: o único mecanismo que marcava live_streams como 'finished' era um
-- setInterval client-side na aba do creator (live/[id]/page.tsx:endLive). Se a
-- aba fechasse antes do tempo, o status ficava preso em 'live' para sempre — e
-- tanto o client (get_creators_filtered: status='live') quanto o perfil
-- (status IN ('scheduled','live')) passavam a exibir o creator como "AO VIVO"
-- indefinidamente. Não havia job server-side (diferente das videochamadas, que
-- têm fn_expire_pending_calls + pg_cron).
--
-- Solução: fn_expire_stale_lives() roda via pg_cron e marca como 'finished'
-- qualquer live cujo tempo de duração já passou. Âncora de tempo:
--   COALESCE(actual_start_time, scheduled_start_time, created_at) + duração.
-- - status='live'      -> usa actual_start_time (gravado por fn_mark_live_started)
-- - status='scheduled' (abandonada) -> usa scheduled_start_time
-- Carência de 2 min evita brigar com o timer client-side e com clock skew.
--
-- Não há trigger de transição em live_streams (só em one_on_one_calls), então
-- o UPDATE direto é suficiente — sem bypass de session_replication_role.
-- ============================================================================

-- Janela de expiração compartilhada como expressão SQL (anchor + duração + carência).
-- duração padrão 60 min quando estimated_duration_minutes for null.

CREATE OR REPLACE FUNCTION public.fn_expire_stale_lives()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.live_streams
     SET status = 'finished'::live_stream_status,
         actual_end_time = COALESCE(actual_end_time, now())
   WHERE status IN ('live'::live_stream_status, 'scheduled'::live_stream_status)
     AND now() > COALESCE(actual_start_time, scheduled_start_time, created_at)
               + make_interval(mins => COALESCE(estimated_duration_minutes, 60))
               + interval '2 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_expire_stale_lives() FROM public;

-- ----------------------------------------------------------------------------
-- cleanup_expired_live_streams(p_creator_id): versão por-creator, chamada pelo
-- hook useLiveStreamCleanup no app do creator. Estava declarada em database.ts
-- e era chamada via .rpc(), mas NUNCA havia sido criada — a chamada falhava
-- silenciosamente. Implementada aqui com a mesma regra, escopada ao creator.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_expired_live_streams(p_creator_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.live_streams
     SET status = 'finished'::live_stream_status,
         actual_end_time = COALESCE(actual_end_time, now())
   WHERE creator_id = p_creator_id
     AND status IN ('live'::live_stream_status, 'scheduled'::live_stream_status)
     AND now() > COALESCE(actual_start_time, scheduled_start_time, created_at)
               + make_interval(mins => COALESCE(estimated_duration_minutes, 60))
               + interval '2 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cleanup_expired_live_streams(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_live_streams(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- pg_cron: roda o expirador global a cada 1 minuto (menor granularidade comum).
-- Mesmo padrão do 20260420100700_pg_cron_expire_calls.sql.
-- ----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_job_id integer;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'expire-stale-lives';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

-- '* * * * *' = a cada minuto (cron padrão). NÃO usar '1 minute' — o pg_cron
-- desta instância só aceita cron de 5 campos ou o formato sub-minuto 'N seconds'.
SELECT cron.schedule(
  'expire-stale-lives',
  '* * * * *',
  $$ SELECT public.fn_expire_stale_lives(); $$
);

-- ----------------------------------------------------------------------------
-- Limpeza imediata no deploy: encerra de uma vez as lives já vencidas que
-- ficaram presas em 'live'/'scheduled' antes deste job existir.
-- ----------------------------------------------------------------------------

SELECT public.fn_expire_stale_lives();
