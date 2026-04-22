-- ============================================================================
-- Consentimento legal (Termos de Uso + Política de Privacidade)
-- ============================================================================
-- Registra quando o usuário aceitou os termos vigentes durante o cadastro.
-- terms_version permite forçar re-aceite no futuro se os documentos mudarem.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_version text;
