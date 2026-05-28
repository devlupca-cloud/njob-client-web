-- ============================================================================
-- Realtime para creator_payout_info — feedback ao vivo do onboarding Stripe
-- ============================================================================
-- O webhook stripe-payouts-webhook atualiza esta tabela quando o Stripe envia
-- account.updated (charges_enabled/payouts_enabled/disabled_reason mudam).
-- Sem realtime, o creator com a aba aberta só vê o novo estado se der refresh.
-- Publicando + REPLICA IDENTITY FULL, o CreatorLoader libera o app no instante
-- da aprovação e a página /stripe-setup atualiza motivo/pendências sem reload.
--
-- RLS já garante que cada creator só vê sua própria linha
-- (payout_info_select_own: auth.uid() = creator_id), então o broker do
-- Realtime entrega o evento certo para o usuário certo.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'creator_payout_info'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.creator_payout_info';
  END IF;
END $$;

ALTER TABLE public.creator_payout_info REPLICA IDENTITY FULL;
