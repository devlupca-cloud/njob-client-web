-- ============================================================================
-- RLS Policies para NJOB - APLICADO EM 22/02/2026
-- ============================================================================

-- Removidas policies "all_access" (ALL true) das seguintes tabelas:
-- creator_payout_info, payouts, transactions, one_on_one_calls, notifications,
-- creator_subscriptions, pack_purchases, live_stream_tickets, live_streams,
-- subscription_plans, platform_settings, creator_availability, creator_description,
-- pack_items, packs, profile_documents, profile_images, profile_settings, profiles

-- ─── TABELAS SENSÍVEIS (dados privados) ─────────────────────────────────────

-- creator_payout_info: só o criador vê/edita
DROP POLICY IF EXISTS "all_access" ON creator_payout_info;
CREATE POLICY "payout_info_select_own" ON creator_payout_info FOR SELECT USING (auth.uid() = creator_id);
CREATE POLICY "payout_info_update_own" ON creator_payout_info FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "payout_info_insert_own" ON creator_payout_info FOR INSERT WITH CHECK (auth.uid() = creator_id);

-- payouts: só o criador vê seus saques
DROP POLICY IF EXISTS "all_access" ON payouts;
CREATE POLICY "payouts_select_own" ON payouts FOR SELECT USING (auth.uid() = creator_id);
CREATE POLICY "payouts_insert_own" ON payouts FOR INSERT WITH CHECK (auth.uid() = creator_id);

-- transactions: só o usuário vê suas transações
DROP POLICY IF EXISTS "all_access" ON transactions;
CREATE POLICY "transactions_select_own" ON transactions FOR SELECT USING (auth.uid() = user_id);

-- one_on_one_calls: apenas participantes (cliente ou criador)
DROP POLICY IF EXISTS "all_access" ON one_on_one_calls;
CREATE POLICY "calls_select_participant" ON one_on_one_calls FOR SELECT USING (auth.uid() = user_id OR auth.uid() = creator_id);
CREATE POLICY "calls_update_participant" ON one_on_one_calls FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = creator_id);
CREATE POLICY "calls_insert_own" ON one_on_one_calls FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = creator_id);

-- notifications: privadas por usuário
DROP POLICY IF EXISTS "all_access" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notifications_delete_own" ON notifications FOR DELETE USING (auth.uid() = user_id);

-- creator_subscriptions: só o criador vê suas assinaturas
DROP POLICY IF EXISTS "all_access" ON creator_subscriptions;
CREATE POLICY "subscriptions_select_own" ON creator_subscriptions FOR SELECT USING (auth.uid() = creator_id);
CREATE POLICY "subscriptions_update_own" ON creator_subscriptions FOR UPDATE USING (auth.uid() = creator_id);

-- pack_purchases: comprador + criador do pack
DROP POLICY IF EXISTS "all_access" ON pack_purchases;
CREATE POLICY "pack_purchases_select_buyer" ON pack_purchases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pack_purchases_select_creator" ON pack_purchases FOR SELECT USING (EXISTS (SELECT 1 FROM packs WHERE packs.id = pack_purchases.pack_id AND packs.profile_id = auth.uid()));

-- live_stream_tickets: comprador + criador da live
DROP POLICY IF EXISTS "all_access" ON live_stream_tickets;
CREATE POLICY "live_tickets_select_buyer" ON live_stream_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "live_tickets_select_creator" ON live_stream_tickets FOR SELECT USING (EXISTS (SELECT 1 FROM live_streams WHERE live_streams.id = live_stream_tickets.live_stream_id AND live_streams.creator_id = auth.uid()));

-- ─── TABELAS PÚBLICAS (leitura aberta, escrita restrita) ────────────────────

-- live_streams: leitura pública, escrita do criador
DROP POLICY IF EXISTS "all_access" ON live_streams;
CREATE POLICY "lives_select_all" ON live_streams FOR SELECT USING (true);
CREATE POLICY "lives_insert_own" ON live_streams FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "lives_update_own" ON live_streams FOR UPDATE USING (auth.uid() = creator_id);

-- subscription_plans: leitura pública
DROP POLICY IF EXISTS "all_access" ON subscription_plans;
CREATE POLICY "plans_select_all" ON subscription_plans FOR SELECT USING (true);

-- platform_settings: leitura pública
DROP POLICY IF EXISTS "all_access" ON platform_settings;
CREATE POLICY "platform_settings_select_all" ON platform_settings FOR SELECT USING (true);

-- ─── REMOVER all_access REDUNDANTE ──────────────────────────────────────────

DROP POLICY IF EXISTS "all_access" ON creator_availability;
DROP POLICY IF EXISTS "all_access" ON creator_description;
DROP POLICY IF EXISTS "all_access" ON pack_items;
DROP POLICY IF EXISTS "all_access" ON packs;
DROP POLICY IF EXISTS "all_access" ON profile_documents;
DROP POLICY IF EXISTS "all_access" ON profile_images;
DROP POLICY IF EXISTS "all_access" ON profile_settings;
DROP POLICY IF EXISTS "all_access" ON profiles;

-- ─── TABELAS SEM RLS → HABILITAR ───────────────────────────────────────────

ALTER TABLE creator_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favorites_select_own" ON creator_favorites FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "favorites_insert_own" ON creator_favorites FOR INSERT WITH CHECK (auth.uid() = client_id);
CREATE POLICY "favorites_delete_own" ON creator_favorites FOR DELETE USING (auth.uid() = client_id);

ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;
-- Sem policies = ninguém acessa via anon/authenticated (só service_role)
