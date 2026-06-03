-- ============================================================================
-- vw_profiles_public — fundação para fechar a exposição da tabela profiles
-- ============================================================================
-- Hoje a policy `profiles_select_all USING(true)` expõe TODAS as colunas de
-- TODOS os perfis (whatsapp, stripe_customer_id, date_birth, deletion_*,
-- is_active) a qualquer usuário. RLS é por linha, não por coluna — então a
-- correção é ler perfis de OUTROS usuários por esta view, que expõe apenas
-- colunas não-sensíveis, e restringir a tabela base ao próprio usuário.
--
-- IMPORTANTE (ordem de cutover): esta view é ADITIVA e segura de aplicar agora.
-- O DROP da policy `profiles_select_all` e a migração dos reads no front só
-- podem ir DEPOIS de o front (que usa esta view) estar deployado — senão o
-- front antigo em produção quebra ao ler perfis de outros.
--
-- Decisão de produto pendente: `whatsapp` é mostrado de propósito ao consumidor
-- no perfil do creator (botão de contato). Se for confirmado como público,
-- adicionar `whatsapp` aqui; por ora fica de fora (conservador).
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_profiles_public AS
SELECT
  id,
  full_name,
  avatar_url,
  username,
  role,
  is_available_for_calls,
  last_seen_at,
  created_at
FROM public.profiles;

-- Default privileges do Supabase concedem ALL a anon/authenticated em novos
-- objetos do schema public. Como esta view é de tabela única (auto-updatable)
-- e roda como owner (bypassa RLS), precisamos revogar TUDO de anon/authenticated
-- e conceder somente SELECT — senão anon poderia escrever/deletar profiles.
REVOKE ALL ON public.vw_profiles_public FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.vw_profiles_public TO anon, authenticated;
