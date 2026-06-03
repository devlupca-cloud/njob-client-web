-- ============================================================================
-- Exclusão de conta com carência de 30 dias — schema
-- ============================================================================
-- Fluxo: o usuário (client ou creator) solicita exclusão -> deslogado na hora
-- e a conta fica "pendente". Se ele logar de novo dentro de 30 dias, a
-- exclusão é cancelada automaticamente. Passados 30 dias sem login, um job
-- pg_cron ANONIMIZA a conta (preserva registros financeiros) e bloqueia o
-- login definitivamente.
--
-- Duas colunas em profiles:
--   deletion_requested_at  -> quando a exclusão foi solicitada (NULL = ativa)
--   deleted_at             -> quando a anonimização definitiva ocorreu
-- A carência (30 dias) vive como constante dentro das funções, não como coluna.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Índice parcial: o job de purga só varre contas pendentes ainda não anonimizadas.
CREATE INDEX IF NOT EXISTS profiles_pending_deletion_idx
  ON public.profiles (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL AND deleted_at IS NULL;
