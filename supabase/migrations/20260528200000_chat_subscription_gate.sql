-- ============================================================================
-- Chat: paywall do cliente (camada gratuita + mascaramento autoritativo)
-- ============================================================================
-- Regra (lado do CONSUMIDOR): a 1ª resposta do creator é visível; a 2ª resposta
-- do creator (e as seguintes) ficam mascaradas até o cliente assinar. O cliente
-- pode mandar até 2 mensagens grátis (limite aplicado no front).
--
-- Mascaramento é AUTORITATIVO: a própria view vw_messages NULa o content das
-- mensagens bloqueadas, então o texto nunca chega ao navegador (nem via
-- DevTools/PostgREST). vw_creator_conversations faz o mesmo com o preview.
--
-- O creator NUNCA é afetado: o gate só dispara quando auth.uid() é o consumidor
-- (cp_client) e a mensagem é do creator (cp_creator).
--
-- O "destravar por assinatura" é centralizado em client_has_active_chat_subscription:
-- hoje retorna sempre false (o modelo consumidor->creator ainda não existe).
-- Quando a assinatura for definida, basta implementar o corpo dessa função —
-- nenhum outro objeto precisa mudar.
-- ============================================================================

-- ─── Stub de assinatura (único ponto a plugar no futuro) ─────────────────────
CREATE OR REPLACE FUNCTION public.client_has_active_chat_subscription(
  p_client uuid,
  p_creator uuid
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  -- TODO(assinatura): trocar por algo como
  --   SELECT EXISTS (
  --     SELECT 1 FROM public.<tabela_assinatura> s
  --     WHERE s.client_id = p_client AND s.creator_id = p_creator
  --       AND s.status = 'active' AND now() < s.current_period_end
  --   );
  SELECT false;
$$;

REVOKE ALL ON FUNCTION public.client_has_active_chat_subscription(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.client_has_active_chat_subscription(uuid, uuid)
  TO anon, authenticated, service_role;

-- ─── vw_messages: + creator_id, + is_locked, content mascarado ───────────────
-- Mantém todas as colunas originais na mesma ordem (CREATE OR REPLACE só permite
-- ADICIONAR colunas no fim) e acrescenta creator_id e is_locked.
CREATE OR REPLACE VIEW public.vw_messages AS
SELECT
  base.message_id,
  base.conversation_id,
  base.sender_id,
  CASE WHEN base.is_locked THEN NULL::text ELSE base.content END AS content,
  base.created_at,
  base.client_id,
  base.client_last_read_at,
  base.is_read_by_client,
  base.is_read_by_creator,
  base.creator_id,
  base.is_locked
FROM (
  SELECT
    m.id AS message_id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.created_at,
    cp_client.profile_id AS client_id,
    cp_client.last_read_at AS client_last_read_at,
    cp_creator.profile_id AS creator_id,
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
    (
      auth.uid() = cp_client.profile_id
      AND m.sender_id = cp_creator.profile_id
      AND NOT public.client_has_active_chat_subscription(cp_client.profile_id, cp_creator.profile_id)
      AND (
        SELECT count(*) FROM public.messages mm
        WHERE mm.conversation_id = m.conversation_id
          AND mm.sender_id = cp_creator.profile_id
          AND (mm.created_at < m.created_at
               OR (mm.created_at = m.created_at AND mm.id <= m.id))
      ) >= 2
    ) AS is_locked
  FROM public.messages m
    JOIN public.profiles sender ON sender.id = m.sender_id
    JOIN public.conversation_participants cp_client ON cp_client.conversation_id = m.conversation_id
    JOIN public.profiles client ON client.id = cp_client.profile_id AND client.role = 'consumer'::user_role
    JOIN public.conversation_participants cp_creator ON cp_creator.conversation_id = m.conversation_id
    JOIN public.profiles creator ON creator.id = cp_creator.profile_id AND creator.role = 'creator'::user_role
) base;

-- ─── vw_creator_conversations: preview mascarado + last_message_locked ───────
CREATE OR REPLACE VIEW public.vw_creator_conversations AS
SELECT
  c.id AS conversation_id,
  cp.profile_id,
  cp.last_read_at AS profile_last_read_at,
  other.id AS peer_id,
  other.full_name AS peer_name,
  other.avatar_url AS peer_avatar_url,
  CASE WHEN locked.is_locked THEN NULL::text ELSE lm.content END AS last_message,
  to_char(lm.created_at, 'DD/MM/YY HH24:MI'::text) AS last_message_time,
  CASE
    WHEN lm.sender_id <> cp.profile_id THEN false
    WHEN cp2.last_read_at >= lm.created_at THEN true
    ELSE false
  END AS last_message_read_by_client,
  COALESCE(unread.unread_count, 0::bigint) AS unread_count,
  lm.created_at AS last_message_created_at,
  COALESCE(locked.is_locked, false) AS last_message_locked
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
  ) unread ON true
  LEFT JOIN LATERAL (
    SELECT (
      other.role = 'creator'::user_role
      AND lm.sender_id = cp2.profile_id
      AND NOT public.client_has_active_chat_subscription(cp.profile_id, cp2.profile_id)
      AND (
        SELECT count(*) FROM messages mm
        WHERE mm.conversation_id = c.id
          AND mm.sender_id = cp2.profile_id
      ) >= 2
    ) AS is_locked
  ) locked ON true;
