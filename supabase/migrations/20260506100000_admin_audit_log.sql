-- Tabela de auditoria do painel admin
-- Toda mutation feita pelo painel admin grava uma linha aqui.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  actor_email text NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  payload jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON public.admin_audit_log (action, created_at DESC);

-- RLS: apenas admins podem ler. INSERT só via service-role (admin panel server-side).
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_admin_read ON public.admin_audit_log;
CREATE POLICY audit_log_admin_read ON public.admin_audit_log
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_log FROM authenticated, anon;
