-- ============================================================================
-- Fluxo novo de Videochamada Individual — Schema base
-- Aplicado em 20/04/2026
-- ============================================================================

-- 1) Novos valores no enum one_on_one_call_status.
--    Cada ADD VALUE precisa ir em statement separado e commitar antes de ser
--    usado em literal/default dentro da mesma migration.
ALTER TYPE public.one_on_one_call_status ADD VALUE IF NOT EXISTS 'awaiting_payment';
ALTER TYPE public.one_on_one_call_status ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE public.one_on_one_call_status ADD VALUE IF NOT EXISTS 'expired';

-- 2) Colunas novas em one_on_one_calls (ciclo de vida request-based).
ALTER TABLE public.one_on_one_calls
  ADD COLUMN IF NOT EXISTS expires_at       timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at      timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at          timestamptz,
  ADD COLUMN IF NOT EXISTS request_flow     boolean NOT NULL DEFAULT false;

-- No novo fluxo a call não nasce com horário agendado — ele só existe pra legado.
ALTER TABLE public.one_on_one_calls
  ALTER COLUMN scheduled_start_time DROP NOT NULL;

-- 3) Toggle de disponibilidade para videochamada no profile.
--    is_active continua significando "perfil publicado/ativo no sistema".
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_available_for_calls boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at           timestamptz;

-- 4) Tabela de presença do creator. Mantida por heartbeat / Realtime Presence.
CREATE TABLE IF NOT EXISTS public.creator_presence (
  creator_id        uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  online            boolean NOT NULL DEFAULT false,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  source            text NOT NULL DEFAULT 'manual',
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Índice parcial: só os creators online interessam para consultas rápidas.
CREATE INDEX IF NOT EXISTS idx_creator_presence_online
  ON public.creator_presence (online)
  WHERE online = true;

-- 5) Índices para queries do novo fluxo.
CREATE INDEX IF NOT EXISTS idx_calls_creator_status
  ON public.one_on_one_calls (creator_id, status);

CREATE INDEX IF NOT EXISTS idx_calls_user_status
  ON public.one_on_one_calls (user_id, status);

-- Índice parcial específico para o job de expiração.
CREATE INDEX IF NOT EXISTS idx_calls_expires_at_pending
  ON public.one_on_one_calls (expires_at)
  WHERE status = 'requested';
