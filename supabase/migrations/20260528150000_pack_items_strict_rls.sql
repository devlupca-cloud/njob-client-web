-- ============================================================================
-- pack_items: RLS estrita + view pública para count
-- ============================================================================
-- Antes: pack_items_select_all USING(true) — qualquer usuário (até guest)
-- abria DevTools e fazia .from('pack_items').select('*') retornando todos os
-- file_url públicos, baixando conteúdo pago. O bucket "images" do storage é
-- public=true, então a URL bate. Não é problema de teste — é vazamento.
--
-- Agora: SELECT só para o dono do pack (creator) OU para quem tem
-- pack_purchases.status='completed'. Telas que precisam apenas do COUNT de
-- itens (lista pública de packs no perfil) passam a usar a view
-- vw_packs_listing — count é computado num SECURITY DEFINER implícito da view
-- e nunca expõe file_url.
--
-- IMPORTANTE: o bucket de storage continua público. A próxima fase é mover
-- assets para um bucket privado + signed URL via edge function — fora do
-- escopo deste fix-prazo.
-- ============================================================================

DROP POLICY IF EXISTS "pack_items_select_all" ON public.pack_items;
DROP POLICY IF EXISTS "pack_items_select_owner_or_buyer" ON public.pack_items;

CREATE POLICY "pack_items_select_owner_or_buyer"
  ON public.pack_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.packs p
      WHERE p.id = pack_items.pack_id
        AND p.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.pack_purchases pp
      WHERE pp.pack_id = pack_items.pack_id
        AND pp.user_id = auth.uid()
        AND pp.status = 'completed'
    )
  );

-- ----------------------------------------------------------------------------
-- vw_packs_listing — lista pública de packs com count seguro
-- ----------------------------------------------------------------------------
-- security_invoker = OFF (default em PG 14+) faz a view rodar como o owner
-- (postgres → superuser → bypassa RLS na subquery de pack_items). Como a view
-- NÃO retorna file_url, é seguro contar todos os itens.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.vw_packs_listing AS
SELECT
  p.id,
  p.profile_id,
  p.title,
  p.description,
  p.price,
  p.currency,
  p.cover_image_url,
  p.status,
  p.stripe_price_id,
  p.stripe_product_id,
  p.published_at,
  p.created_at,
  p.updated_at,
  (SELECT COUNT(*) FROM public.pack_items pi WHERE pi.pack_id = p.id) AS items_count
FROM public.packs p;

GRANT SELECT ON public.vw_packs_listing TO authenticated, anon;
