-- ============================================================================
-- Hardening: revogar grants de ESCRITA das views públicas
-- ============================================================================
-- Default privileges do Supabase concedem ALL (INSERT/UPDATE/DELETE/...) a
-- anon/authenticated em novos objetos do schema public. Views são lidas com a
-- identidade do OWNER (não security_invoker) → bypassam RLS da tabela base.
-- Quando a view é auto-updatable (tabela única, sem join/agregação), esses
-- grants de escrita permitiriam que anon ALTERASSE/DELETASSE a tabela base
-- pela view, ignorando RLS.
--
-- `vw_packs_listing` é auto-updatable (is_updatable=YES) e estava com grants de
-- escrita p/ anon → anon poderia escrever em `packs`. As demais têm join/agreg
-- (is_updatable=NO) e o grant é inócuo, mas revogamos por defesa em profundidade.
-- Views só devem ser SELECT-adas pelos apps.
-- ============================================================================

DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'vw_packs_listing',
    'vw_messages',
    'vw_creator_conversations',
    'vw_creator_events',
    'total_gasto_cliente'
  ]
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated, PUBLIC',
      v
    );
  END LOOP;
END $$;
