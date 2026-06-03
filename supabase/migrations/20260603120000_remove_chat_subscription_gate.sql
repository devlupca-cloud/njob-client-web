-- ============================================================================
-- Chat: remoção da trava de assinatura (paywall do cliente)
-- ============================================================================
-- Reverte o gate introduzido em 20260528200000_chat_subscription_gate.sql.
-- O chat passa a ser totalmente livre: nenhuma mensagem é mascarada e o cliente
-- não tem mais limite de mensagens grátis.
--
-- Estratégia: CREATE OR REPLACE (não DROP) para preservar os GRANTs aplicados em
-- 20260529140000_fix_view_write_grants.sql e evitar quebra por dependências.
-- As colunas is_locked / last_message_locked são mantidas (CREATE OR REPLACE não
-- permite removê-las) porém fixadas em FALSE — ficam inertes; o front não as lê
-- mais. A função client_has_active_chat_subscription é removida de vez.
-- ============================================================================

-- ─── vw_messages: sem mascaramento, is_locked sempre false ───────────────────
CREATE OR REPLACE VIEW public.vw_messages AS
SELECT
  m.id AS message_id,
  m.conversation_id,
  m.sender_id,
  m.content,
  m.created_at,
  cp_client.profile_id AS client_id,
  cp_client.last_read_at AS client_last_read_at,
  CASE
    WHEN m.sender_id = cp_client.profile_id THEN true
    WHEN cp_client.last_read_at >= m.created_at THEN true
    ELSE false
  END AS is_read_by_client,
  CASE
    WHEN m.sender_id = cp_creator.profile_id THEN true
    WHEN cp_creator.last_read_at >= m.created_at THEN true
    ELSE false
  END AS is_read_by_creator,
  cp_creator.profile_id AS creator_id,
  false AS is_locked
FROM public.messages m
  JOIN public.profiles sender ON sender.id = m.sender_id
  JOIN public.conversation_participants cp_client ON cp_client.conversation_id = m.conversation_id
  JOIN public.profiles client ON client.id = cp_client.profile_id AND client.role = 'consumer'::user_role
  JOIN public.conversation_participants cp_creator ON cp_creator.conversation_id = m.conversation_id
  JOIN public.profiles creator ON creator.id = cp_creator.profile_id AND creator.role = 'creator'::user_role;

-- ─── vw_creator_conversations: preview sem mascaramento, locked sempre false ──
CREATE OR REPLACE VIEW public.vw_creator_conversations AS
SELECT
  c.id AS conversation_id,
  cp.profile_id,
  cp.last_read_at AS profile_last_read_at,
  other.id AS peer_id,
  other.full_name AS peer_name,
  other.avatar_url AS peer_avatar_url,
  lm.content AS last_message,
  to_char(lm.created_at, 'DD/MM/YY HH24:MI'::text) AS last_message_time,
  CASE
    WHEN lm.sender_id <> cp.profile_id THEN false
    WHEN cp2.last_read_at >= lm.created_at THEN true
    ELSE false
  END AS last_message_read_by_client,
  COALESCE(unread.unread_count, 0::bigint) AS unread_count,
  lm.created_at AS last_message_created_at,
  false AS last_message_locked
FROM conversations c
  JOIN conversation_participants cp ON cp.conversation_id = c.id
  JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.profile_id <> cp.profile_id
  JOIN profiles other ON other.id = cp2.profile_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at, m.sender_id
    FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS unread_count
    FROM messages m
    WHERE m.conversation_id = c.id
      AND m.sender_id <> cp.profile_id
      AND m.created_at > COALESCE(cp.last_read_at, to_timestamp(0::double precision))
  ) unread ON true;

-- ─── Remove o stub de assinatura (não é mais referenciado por nenhuma view) ───
DROP FUNCTION IF EXISTS public.client_has_active_chat_subscription(uuid, uuid);
