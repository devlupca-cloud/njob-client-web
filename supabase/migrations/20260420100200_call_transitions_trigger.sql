-- ============================================================================
-- Trigger que impõe transições válidas em one_on_one_calls.status
-- ============================================================================
-- RLS autoriza "quem pode fazer UPDATE". O trigger abaixo valida "para onde
-- cada papel pode mover o status". service_role (usado pelos webhooks) faz
-- bypass via session_replication_role='replica' dentro da transação.

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

  -- Bypass para replicação / service_role (webhooks).
  IF current_setting('session_replication_role', true) = 'replica' THEN
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

DROP TRIGGER IF EXISTS trg_validate_call_transition ON public.one_on_one_calls;
CREATE TRIGGER trg_validate_call_transition
  BEFORE UPDATE OF status ON public.one_on_one_calls
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_call_transition();
