-- ============================================================================
-- Rebaixa creator_payout_info.status='COMPLETED' que NÃO está realmente ativo
-- ============================================================================
-- Antes desta correção, a edge function creator-payout-update-link gravava
-- COMPLETED quando account.charges_enabled=true, ignorando payouts_enabled e
-- o disabled_reason. Em alguns casos, o status foi marcado COMPLETED na
-- criação inicial (create-stripe-connected-account) sem ainda haver
-- charges/payouts efetivamente liberados. Resultado: creators caíam dentro
-- da plataforma sem poder usar Stripe (camicami@gmail.com é o caso clássico:
-- details_submitted=true, charges_enabled=false, disabled_reason='requirements.past_due').
--
-- Esta migration normaliza o estado atual: qualquer linha com status='COMPLETED'
-- cujo account_details não confirma charges+payouts é rebaixada — VERIFYING se
-- foi só submetido, REJECTED-equivalente (mantido VERIFYING) se há
-- disabled_reason, PENDING se nem details_submitted. A regra autoritativa
-- agora vive na edge function corrigida no mesmo lote.
-- ============================================================================

UPDATE public.creator_payout_info
   SET status = CASE
       WHEN COALESCE((account_details->>'details_submitted')::boolean, false) THEN 'VERIFYING'
       ELSE 'PENDING'
     END
 WHERE status = 'COMPLETED'
   AND (
     COALESCE((account_details->>'charges_enabled')::boolean, false) = false
     OR COALESCE((account_details->>'payouts_enabled')::boolean, false) = false
   );
