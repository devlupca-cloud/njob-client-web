-- ============================================================================
-- Exclusividade 1-a-1 da videochamada on-demand
-- ============================================================================
-- A videochamada individual é 1-a-1. A partir do ACEITE do creator
-- (status='awaiting_payment') — ou enquanto há uma chamada paga em andamento
-- (status='paid') — nenhum outro cliente pode SOLICITAR nem PAGAR até essa
-- chamada terminar / expirar / cancelar.
--
-- "Ocupando" = uma call do creator em:
--   - status='awaiting_payment' aceita há menos de 30 min
--       (alinha com fn_expire_pending_calls, que expira awaiting_payment órfão);
--   - status='paid' pago há menos de 2h
--       (alinha com a janela do ActiveCallCTA / generate-zego-token).
-- Os limites de tempo evitam que uma linha "presa" trave o creator pra sempre.
--
-- Enforced em dois pontos server-side (defesa em profundidade):
--   1) fn_create_call_request       -> recusa NOVA solicitação se já há call ativa.
--   2) fn_validate_call_transition  -> recusa o ACEITE (requested->awaiting_payment)
--      se já há OUTRA call ativa do mesmo creator (impede 2 awaiting_payment).
-- O checkout (create-stripe-checkout) faz a checagem autoritativa final no pagamento.
-- ============================================================================

-- ─── 1) fn_create_call_request: bloqueia nova solicitação se o creator está ocupado ───
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

  -- Exclusividade 1-a-1: se o creator já tem uma chamada ativa (aceita ou paga
  -- em andamento), não aceita nova solicitação.
  IF EXISTS (
    SELECT 1 FROM public.one_on_one_calls c
     WHERE c.creator_id = p_creator_id
       AND (
            (c.status = 'awaiting_payment'
              AND COALESCE(c.accepted_at, c.created_at) > now() - interval '30 minutes')
         OR (c.status = 'paid'
              AND c.paid_at > now() - interval '2 hours')
       )
  ) THEN
    RAISE EXCEPTION 'creator_busy';
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


-- ─── 2) fn_validate_call_transition: bloqueia ACEITE concorrente ───
CREATE OR REPLACE FUNCTION public.fn_validate_call_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  -- creator_id e user_id nunca mudam após a criação
  IF NEW.creator_id IS DISTINCT FROM OLD.creator_id THEN
    RAISE EXCEPTION 'creator_id é imutável';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id é imutável';
  END IF;

  -- Sem mudança de status? Nada a validar.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Bypass para replicação (pg_cron / sessões postgres diretas).
  IF current_setting('session_replication_role', true) = 'replica' THEN
    RETURN NEW;
  END IF;

  -- Bypass por GUC custom: setado APENAS dentro de RPCs SECURITY DEFINER
  -- (fn_mark_call_paid no webhook, fn_demo_mark_call_paid). session_replication_role
  -- não pode ser setado por session_user='authenticator' (PostgREST/webhook), então
  -- usamos este GUC. Clientes via PostgREST não conseguem injetar app.* num UPDATE
  -- normal, então isto NÃO afrouxa as regras de transição para usuário/creator.
  IF current_setting('app.bypass_call_transition', true) = '1' THEN
    RETURN NEW;
  END IF;

  -- Sem sessão autenticada: bloqueia por segurança.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sem sessão autenticada para mudar status';
  END IF;

  -- Regras por papel.
  IF v_actor = NEW.creator_id THEN
    -- Creator: aceitar/recusar solicitação, cancelar própria call, finalizar.
    IF NOT (
      (OLD.status = 'requested' AND NEW.status IN ('awaiting_payment','rejected','cancelled_by_creator'))
      OR (OLD.status = 'awaiting_payment' AND NEW.status = 'cancelled_by_creator')
      OR (OLD.status IN ('paid','confirmed') AND NEW.status = 'completed')
    ) THEN
      RAISE EXCEPTION 'Transição não permitida para creator: % -> %', OLD.status, NEW.status;
    END IF;

    -- Exclusividade 1-a-1 no aceite: não pode aceitar uma segunda chamada
    -- enquanto outra do mesmo creator já está ativa (awaiting_payment/paid).
    IF OLD.status = 'requested' AND NEW.status = 'awaiting_payment' THEN
      IF EXISTS (
        SELECT 1 FROM public.one_on_one_calls c
         WHERE c.creator_id = NEW.creator_id
           AND c.id <> NEW.id
           AND (
                (c.status = 'awaiting_payment'
                  AND COALESCE(c.accepted_at, c.created_at) > now() - interval '30 minutes')
             OR (c.status = 'paid'
                  AND c.paid_at > now() - interval '2 hours')
           )
      ) THEN
        RAISE EXCEPTION 'creator_busy';
      END IF;
    END IF;

  ELSIF v_actor = NEW.user_id THEN
    -- Cliente: apenas cancelar enquanto ainda não pagou.
    IF NOT (
      OLD.status IN ('requested','awaiting_payment')
      AND NEW.status = 'cancelled_by_user'
    ) THEN
      RAISE EXCEPTION 'Transição não permitida para user: % -> %', OLD.status, NEW.status;
    END IF;

  ELSE
    RAISE EXCEPTION 'Usuário não participa desta call';
  END IF;

  RETURN NEW;
END;
$$;
