-- ============================================================================
-- RPC fn_mark_call_paid — chamada pelo webhook Stripe após pagamento confirmado
-- ============================================================================
-- Usa session_replication_role='replica' para bypassar fn_validate_call_transition
-- (service_role pode chamar; RLS já foi garantida upstream).

CREATE OR REPLACE FUNCTION public.fn_mark_call_paid(
  p_call_id uuid,
  p_transaction_id uuid,
  p_platform_fee numeric,
  p_creator_share numeric
) RETURNS public.one_on_one_calls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.one_on_one_calls%ROWTYPE;
BEGIN
  SET LOCAL session_replication_role = 'replica';

  UPDATE public.one_on_one_calls
     SET status = 'paid',
         paid_at = now(),
         transaction_id = p_transaction_id,
         platform_fee = p_platform_fee,
         creator_share = p_creator_share,
         updated_at = now()
   WHERE id = p_call_id
     AND status IN ('awaiting_payment', 'requested')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'call_not_in_payable_state: %', p_call_id;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_mark_call_paid(uuid, uuid, numeric, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_mark_call_paid(uuid, uuid, numeric, numeric) TO service_role;
