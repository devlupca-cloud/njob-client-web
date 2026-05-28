-- ============================================================================
-- get_creator_metrics — sem dupla contagem e cobrindo o fluxo novo de calls
-- ============================================================================
-- Antes a RPC somava:
--   pack_purchases.purchase_price
-- + live_stream_tickets.purchase_price
-- + one_on_one_calls.call_price (status IN ('confirmed','completed'))
-- + transactions.amount (com filtro "NOT EXISTS pack_purchases.transaction_id"
--   que tentava deduplicar mas falhava em vários casos)
-- e multiplicava por 0.771.
--
-- Problemas:
-- 1. transactions já contém o valor das outras compras (mesmo bruto), então
--    havia dupla contagem em quase todos os casos onde o filtro NOT EXISTS
--    não disparava.
-- 2. one_on_one_calls excluía status='paid' — todas as chamadas pagas pelo
--    fluxo on-demand (sem 'confirmed') apareciam como zero faturamento.
-- 3. 0.771 (taxa do Stripe?) divergia da plataforma fee real (15%).
--
-- Agora soma diretamente creator_share (valor líquido após platform_fee), que
-- as edge functions de checkout já calculam e gravam. Fallback para
-- purchase_price * 0.85 quando creator_share for null (compras antigas).
-- Inclui status='paid' nas calls.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_creator_metrics(p_profile_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT jsonb_build_object(
    'visitas_30d', (
      SELECT COUNT(*) FROM public.profile_views
      WHERE profile_id = p_profile_id
        AND viewed_at >= NOW() - INTERVAL '30 days'
    ),
    'curtidas_30d', (
      SELECT COUNT(*) FROM public.content_likes
      WHERE creator_id = p_profile_id
        AND created_at >= NOW() - INTERVAL '30 days'
    ),
    'faturamento_30d', (
      SELECT COALESCE(SUM(amount), 0)
      FROM (
        SELECT COALESCE(pp.creator_share, pp.purchase_price * 0.85) AS amount
          FROM public.pack_purchases pp
          JOIN public.packs pk ON pp.pack_id = pk.id
         WHERE pk.profile_id = p_profile_id
           AND pp.status = 'completed'
           AND pp.purchased_at >= NOW() - INTERVAL '30 days'

        UNION ALL

        SELECT COALESCE(lt.creator_share, lt.purchase_price * 0.85)
          FROM public.live_stream_tickets lt
          JOIN public.live_streams ls ON lt.live_stream_id = ls.id
         WHERE ls.creator_id = p_profile_id
           AND lt.status = 'completed'
           AND lt.purchased_at >= NOW() - INTERVAL '30 days'

        UNION ALL

        SELECT COALESCE(oc.creator_share, oc.call_price * 0.85)
          FROM public.one_on_one_calls oc
         WHERE oc.creator_id = p_profile_id
           AND oc.status IN ('paid'::one_on_one_call_status,
                             'confirmed'::one_on_one_call_status,
                             'completed'::one_on_one_call_status)
           AND oc.created_at >= NOW() - INTERVAL '30 days'
      ) sub
    )
  );
$fn$;
