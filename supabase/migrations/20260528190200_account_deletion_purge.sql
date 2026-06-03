-- ============================================================================
-- Exclusão de conta — anonimização definitiva + pg_cron
-- ============================================================================
-- Após 30 dias sem login (deletion_requested_at < now() - 30d, deleted_at NULL)
-- a conta é ANONIMIZADA, não apagada: a linha de profiles permanece para não
-- quebrar FKs de transactions/payouts/pack_purchases/live_stream_tickets/
-- one_on_one_calls (necessárias para fins fiscais/contábeis). Removemos só os
-- dados pessoais e bloqueamos o login em auth.users.
--
-- SECURITY DEFINER roda como o owner (postgres), que tem acesso ao schema auth.
-- Não exposta a authenticated — só o pg_cron (que roda como postgres) a chama.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_purge_deleted_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now   timestamptz := now();
  v_count integer := 0;
  v_id    uuid;
BEGIN
  FOR v_id IN
    SELECT id
      FROM public.profiles
     WHERE deletion_requested_at IS NOT NULL
       AND deleted_at IS NULL
       AND deletion_requested_at < v_now - interval '30 days'
  LOOP
    -- 1) Anonimiza o profile (mantém a linha para preservar FKs financeiras).
    UPDATE public.profiles
       SET full_name = 'Conta excluída',
           username = NULL,
           avatar_url = NULL,
           whatsapp = NULL,
           date_birth = NULL,
           is_active = false,
           is_available_for_calls = false,
           deleted_at = v_now,
           updated_at = v_now
     WHERE id = v_id;

    -- 2) Remove conteúdo/descrição pessoal do creator.
    DELETE FROM public.profile_images WHERE profile_id = v_id;
    DELETE FROM public.creator_description WHERE profile_id = v_id;

    -- 3) Bloqueia o login definitivamente e libera email/telefone para reuso.
    UPDATE auth.users
       SET email = 'deleted+' || v_id::text || '@deleted.invalid',
           phone = NULL,
           banned_until = 'infinity'::timestamptz,
           raw_user_meta_data = '{}'::jsonb,
           updated_at = v_now
     WHERE id = v_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_purge_deleted_accounts() FROM public;

-- ─── Agendamento diário (03:00) ─────────────────────────────────────────────
-- Cron de 5 campos (a granularidade diária dispensa o formato 'N seconds').
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_job_id integer;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'purge-deleted-accounts';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'purge-deleted-accounts',
  '0 3 * * *',
  $$ SELECT public.fn_purge_deleted_accounts(); $$
);

-- Roda uma vez no deploy (no-op enquanto não houver pendências de 30+ dias).
SELECT public.fn_purge_deleted_accounts();
