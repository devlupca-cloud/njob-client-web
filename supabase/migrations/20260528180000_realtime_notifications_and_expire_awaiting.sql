-- ============================================================================
-- Realtime de notifications + expiração de awaiting_payment órfãs
-- ============================================================================

-- 1) notifications na publication supabase_realtime + REPLICA IDENTITY FULL.
--    O webhook cria notificação para cliente e creator a cada compra; com
--    realtime habilitado, badge e lista atualizam sem reload.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- 2) Estende fn_expire_pending_calls para cobrir awaiting_payment órfãs.
--    Antes: só expirava status='requested'. Cliente que abandonava o Stripe
--    Checkout deixava awaiting_payment para sempre — bloqueava o creator
--    de receber nova solicitação do mesmo cliente e poluía métricas.
--
--    Agora: também marca como 'expired' qualquer awaiting_payment cujo
--    accepted_at já passou de 30 min (janela do Stripe Checkout).
--
--    Mantém o bypass de trigger via session_replication_role para não bater
--    no fn_validate_call_transition (igual ao expire de 'requested').

CREATE OR REPLACE FUNCTION public.fn_expire_pending_calls()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count_requested integer;
  v_count_awaiting  integer;
BEGIN
  SET LOCAL session_replication_role = 'replica';

  -- requested → expired (após expires_at)
  UPDATE public.one_on_one_calls
     SET status = 'expired'::one_on_one_call_status
   WHERE status = 'requested'::one_on_one_call_status
     AND expires_at IS NOT NULL
     AND expires_at < now();
  GET DIAGNOSTICS v_count_requested = ROW_COUNT;

  -- awaiting_payment → expired (cliente abandonou o Stripe Checkout)
  -- 30 min é margem confortável; o checkout do Stripe expira em ~24h, mas
  -- a UX da plataforma assume que o cliente paga rápido após o creator aceitar.
  UPDATE public.one_on_one_calls
     SET status = 'expired'::one_on_one_call_status
   WHERE status = 'awaiting_payment'::one_on_one_call_status
     AND COALESCE(accepted_at, created_at) < now() - interval '30 minutes';
  GET DIAGNOSTICS v_count_awaiting = ROW_COUNT;

  RETURN v_count_requested + v_count_awaiting;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_expire_pending_calls() FROM public;

-- 3) fn_cancel_call_refund — usado pelo webhook handle-purchases-webhook
--    no case charge.refunded. Cancela uma call paga/confirmada quando o
--    Stripe estorna o pagamento. Bypassa o trigger fn_validate_call_transition
--    via session_replication_role='replica' (igual ao fn_mark_call_paid).
CREATE OR REPLACE FUNCTION public.fn_cancel_call_refund(p_call_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  SET LOCAL session_replication_role = 'replica';
  UPDATE public.one_on_one_calls
     SET status = 'cancelled_by_user'::one_on_one_call_status,
         updated_at = now()
   WHERE id = p_call_id
     AND status IN ('paid'::one_on_one_call_status,
                    'confirmed'::one_on_one_call_status,
                    'awaiting_payment'::one_on_one_call_status);
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_cancel_call_refund(uuid) FROM public;
