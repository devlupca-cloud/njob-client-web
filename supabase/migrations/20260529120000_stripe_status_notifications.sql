-- ============================================================================
-- Notificação de status do Stripe Connect do creator
-- ============================================================================
-- O creator agora ACESSA o app mesmo sem o Stripe aprovado (acesso liberado),
-- com travas nas features que tocam Stripe. Para ele saber quando algo muda,
-- este trigger insere uma notificação no sininho (tabela notifications, já em
-- realtime via 20260528180000) sempre que o estado/pendências do Stripe mudam.
--
-- Fonte de verdade = creator_payout_info.account_details (charges_enabled,
-- payouts_enabled, disabled_reason, currently_due, past_due) + status. Mesma
-- regra do front (isCreatorStripeReady). Dispara no UPDATE do webhook
-- (stripe-payouts-webhook / creator-payout-update-link) e no INSERT inicial.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_notify_stripe_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_charges boolean := COALESCE((NEW.account_details->>'charges_enabled')::boolean, false);
  v_new_payouts boolean := COALESCE((NEW.account_details->>'payouts_enabled')::boolean, false);
  v_new_reason  text    := NULLIF(NEW.account_details->>'disabled_reason', '');
  v_new_ready   boolean := (NEW.status = 'COMPLETED' AND v_new_charges AND v_new_payouts);
  v_new_state   text;
  v_old_charges boolean;
  v_old_payouts boolean;
  v_old_reason  text;
  v_old_ready   boolean;
  v_old_state   text;
  v_new_sig     text;
  v_old_sig     text;
  v_title       text;
  v_message     text;
BEGIN
  v_new_state := CASE
    WHEN v_new_ready THEN 'ready'
    WHEN v_new_reason IS NOT NULL THEN 'rejected'
    WHEN NEW.status IN ('COMPLETED', 'VERIFYING') THEN 'verifying'
    ELSE 'pending'
  END;
  v_new_sig := v_new_state
    || '|' || COALESCE(NEW.account_details->>'currently_due', '')
    || '|' || COALESCE(NEW.account_details->>'past_due', '')
    || '|' || COALESCE(v_new_reason, '');

  IF TG_OP = 'UPDATE' THEN
    v_old_charges := COALESCE((OLD.account_details->>'charges_enabled')::boolean, false);
    v_old_payouts := COALESCE((OLD.account_details->>'payouts_enabled')::boolean, false);
    v_old_reason  := NULLIF(OLD.account_details->>'disabled_reason', '');
    v_old_ready   := (OLD.status = 'COMPLETED' AND v_old_charges AND v_old_payouts);
    v_old_state := CASE
      WHEN v_old_ready THEN 'ready'
      WHEN v_old_reason IS NOT NULL THEN 'rejected'
      WHEN OLD.status IN ('COMPLETED', 'VERIFYING') THEN 'verifying'
      ELSE 'pending'
    END;
    v_old_sig := v_old_state
      || '|' || COALESCE(OLD.account_details->>'currently_due', '')
      || '|' || COALESCE(OLD.account_details->>'past_due', '')
      || '|' || COALESCE(v_old_reason, '');
    -- Nada relevante mudou (ex.: update de last_seen/outros campos) → não notifica.
    IF v_new_sig = v_old_sig THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_new_state = 'ready' THEN
    v_title := 'Conta Stripe aprovada';
    v_message := 'Tudo certo! Você já pode vender conteúdo, criar lives e ficar online.';
  ELSIF v_new_state = 'rejected' THEN
    v_title := 'Pendência na sua conta Stripe';
    v_message := 'O Stripe encontrou uma pendência (' || COALESCE(v_new_reason, 'requirements') || '). Reabra o cadastro para resolver e liberar suas vendas.';
  ELSIF v_new_state = 'verifying' THEN
    v_title := 'Conta Stripe em análise';
    v_message := 'Recebemos seus dados. O Stripe está analisando sua conta — avisaremos quando liberar.';
  ELSE
    v_title := 'Configure seus pagamentos';
    v_message := 'Conclua o cadastro no Stripe para liberar a criação de conteúdo, lives e chamadas.';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (
    NEW.creator_id,
    'stripe_status',
    v_title,
    v_message,
    jsonb_build_object(
      'state', v_new_state,
      'disabled_reason', v_new_reason,
      'currently_due', NEW.account_details->'currently_due',
      'past_due', NEW.account_details->'past_due'
    ),
    false,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_stripe_status_change ON public.creator_payout_info;
CREATE TRIGGER trg_notify_stripe_status_change
AFTER INSERT OR UPDATE ON public.creator_payout_info
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_stripe_status_change();
