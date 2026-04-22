-- ============================================================================
-- RPC fn_create_call_request — cliente solicita videochamada
-- ============================================================================
-- Valida sell_calls, presença online, duração válida, preço configurado.
-- Insere a call com status='requested' e expires_at=now()+2min.

CREATE OR REPLACE FUNCTION public.fn_create_call_request(
  p_creator_id uuid,
  p_duration_minutes integer
) RETURNS public.one_on_one_calls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settings public.profile_settings%ROWTYPE;
  v_presence public.creator_presence%ROWTYPE;
  v_price numeric;
  v_row public.one_on_one_calls%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF auth.uid() = p_creator_id THEN
    RAISE EXCEPTION 'cannot_call_self';
  END IF;

  IF p_duration_minutes NOT IN (30, 60) THEN
    RAISE EXCEPTION 'invalid_duration';
  END IF;

  SELECT * INTO v_settings FROM public.profile_settings WHERE profile_id = p_creator_id;
  IF NOT FOUND OR COALESCE(v_settings.sell_calls, false) = false THEN
    RAISE EXCEPTION 'creator_does_not_sell_calls';
  END IF;

  SELECT * INTO v_presence FROM public.creator_presence WHERE creator_id = p_creator_id;
  IF NOT FOUND OR COALESCE(v_presence.online, false) = false THEN
    RAISE EXCEPTION 'creator_offline';
  END IF;

  v_price := CASE
               WHEN p_duration_minutes = 60 THEN v_settings.call_per_1_hr
               ELSE v_settings.call_per_30_min
             END;

  IF v_price IS NULL OR v_price <= 0 THEN
    RAISE EXCEPTION 'price_not_configured';
  END IF;

  INSERT INTO public.one_on_one_calls (
    user_id,
    creator_id,
    scheduled_duration_minutes,
    call_price,
    currency,
    status,
    request_flow,
    expires_at
  ) VALUES (
    auth.uid(),
    p_creator_id,
    p_duration_minutes,
    v_price,
    'BRL',
    'requested',
    true,
    now() + interval '2 minutes'
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_create_call_request(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_create_call_request(uuid, integer) TO authenticated;
