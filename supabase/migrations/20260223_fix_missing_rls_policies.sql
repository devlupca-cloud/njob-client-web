-- ============================================================================
-- FIX: Policies faltantes para tabelas que tiveram all_access removido
-- sem policies de substituicao na migration 20260222_rls_policies.sql
-- ============================================================================

-- ─── PACKS ─────────────────────────────────────────────────────────────────────
-- Leitura publica (usuarios navegam pacotes), escrita restrita ao criador

CREATE POLICY "packs_select_all" ON packs
  FOR SELECT USING (true);

CREATE POLICY "packs_insert_own" ON packs
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "packs_update_own" ON packs
  FOR UPDATE USING (auth.uid() = profile_id);

CREATE POLICY "packs_delete_own" ON packs
  FOR DELETE USING (auth.uid() = profile_id);

-- ─── PACK_ITEMS ────────────────────────────────────────────────────────────────
-- Leitura publica (comprador ve itens), escrita restrita ao dono do pack

CREATE POLICY "pack_items_select_all" ON pack_items
  FOR SELECT USING (true);

CREATE POLICY "pack_items_insert_own" ON pack_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM packs
      WHERE packs.id = pack_items.pack_id
        AND packs.profile_id = auth.uid()
    )
  );

CREATE POLICY "pack_items_update_own" ON pack_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM packs
      WHERE packs.id = pack_items.pack_id
        AND packs.profile_id = auth.uid()
    )
  );

CREATE POLICY "pack_items_delete_own" ON pack_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM packs
      WHERE packs.id = pack_items.pack_id
        AND packs.profile_id = auth.uid()
    )
  );

-- ─── PROFILES ──────────────────────────────────────────────────────────────────
-- Leitura publica, escrita restrita ao proprio usuario

CREATE POLICY "profiles_select_all" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- ─── PROFILE_IMAGES ────────────────────────────────────────────────────────────
-- Leitura publica, escrita restrita ao dono

CREATE POLICY "profile_images_select_all" ON profile_images
  FOR SELECT USING (true);

CREATE POLICY "profile_images_insert_own" ON profile_images
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "profile_images_update_own" ON profile_images
  FOR UPDATE USING (auth.uid() = profile_id);

CREATE POLICY "profile_images_delete_own" ON profile_images
  FOR DELETE USING (auth.uid() = profile_id);

-- ─── PROFILE_DOCUMENTS ────────────────────────────────────────────────────────
-- Privado: so o dono ve e edita

CREATE POLICY "profile_documents_select_own" ON profile_documents
  FOR SELECT USING (auth.uid() = profile_id);

CREATE POLICY "profile_documents_insert_own" ON profile_documents
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "profile_documents_update_own" ON profile_documents
  FOR UPDATE USING (auth.uid() = profile_id);

-- ─── PROFILE_SETTINGS ─────────────────────────────────────────────────────────
-- Leitura publica (configuracoes de venda sao exibidas), escrita do dono

CREATE POLICY "profile_settings_select_all" ON profile_settings
  FOR SELECT USING (true);

CREATE POLICY "profile_settings_insert_own" ON profile_settings
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "profile_settings_update_own" ON profile_settings
  FOR UPDATE USING (auth.uid() = profile_id);

-- ─── CREATOR_AVAILABILITY ──────────────────────────────────────────────────────
-- Leitura publica (clientes veem horarios), escrita do criador

CREATE POLICY "creator_availability_select_all" ON creator_availability
  FOR SELECT USING (true);

CREATE POLICY "creator_availability_insert_own" ON creator_availability
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "creator_availability_update_own" ON creator_availability
  FOR UPDATE USING (auth.uid() = creator_id);

CREATE POLICY "creator_availability_delete_own" ON creator_availability
  FOR DELETE USING (auth.uid() = creator_id);

-- ─── CREATOR_DESCRIPTION ───────────────────────────────────────────────────────
-- Leitura publica (exibido no perfil), escrita do criador

CREATE POLICY "creator_description_select_all" ON creator_description
  FOR SELECT USING (true);

CREATE POLICY "creator_description_insert_own" ON creator_description
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "creator_description_update_own" ON creator_description
  FOR UPDATE USING (auth.uid() = profile_id);
