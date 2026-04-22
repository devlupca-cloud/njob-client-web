-- ─── CREATOR_AVAILABILITY_SLOTS ───────────────────────────────────────────────
-- Leitura publica (clientes veem slots disponiveis)
-- Update por qualquer autenticado (cliente marca purchased = true ao agendar)
-- Insert/Delete somente pelo criador (via parent creator_availability.creator_id)

-- Habilita RLS caso ainda nao esteja
ALTER TABLE creator_availability_slots ENABLE ROW LEVEL SECURITY;

-- SELECT: publico (clientes precisam ver slots)
DROP POLICY IF EXISTS "slots_select_all" ON creator_availability_slots;
CREATE POLICY "slots_select_all" ON creator_availability_slots
  FOR SELECT USING (true);

-- UPDATE: qualquer usuario autenticado (para marcar purchased = true no booking)
DROP POLICY IF EXISTS "slots_update_authenticated" ON creator_availability_slots;
CREATE POLICY "slots_update_authenticated" ON creator_availability_slots
  FOR UPDATE USING (auth.role() = 'authenticated');

-- INSERT: somente o criador dono (via join com creator_availability)
DROP POLICY IF EXISTS "slots_insert_creator" ON creator_availability_slots;
CREATE POLICY "slots_insert_creator" ON creator_availability_slots
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM creator_availability ca
      WHERE ca.id = availability_id
        AND ca.creator_id = auth.uid()
    )
  );

-- DELETE: somente o criador dono
DROP POLICY IF EXISTS "slots_delete_creator" ON creator_availability_slots;
CREATE POLICY "slots_delete_creator" ON creator_availability_slots
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM creator_availability ca
      WHERE ca.id = availability_id
        AND ca.creator_id = auth.uid()
    )
  );
