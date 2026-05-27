-- ============================================================================
-- get_or_create_direct_conversation — abre (ou cria) a conversa 1:1
-- ============================================================================
-- O chat (conversations / conversation_participants / messages) já existia, mas
-- não havia como INICIAR uma conversa: nenhum dos apps cria conversation +
-- participants, e a RLS não permite o cliente inserir essas linhas diretamente.
-- Esta RPC SECURITY DEFINER acha a conversa 1:1 (is_group=false) entre o usuário
-- autenticado e p_peer_id; se não existir, cria. Idempotente — chamadas
-- repetidas retornam sempre a mesma conversa. Retorna o id da conversa.
--
-- Acesso aberto: qualquer usuário autenticado pode abrir conversa com qualquer
-- outro perfil (o botão "Conversar" no client só aparece para logados; guests
-- são levados ao cadastro antes de chegar aqui).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(p_peer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_conv_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_peer_id IS NULL OR p_peer_id = v_uid THEN
    RAISE EXCEPTION 'invalid_peer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_peer_id) THEN
    RAISE EXCEPTION 'peer_not_found';
  END IF;

  -- Conversa 1:1 existente onde ambos participam.
  SELECT cp1.conversation_id
    INTO v_conv_id
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2
      ON cp2.conversation_id = cp1.conversation_id
    JOIN public.conversations c
      ON c.id = cp1.conversation_id
   WHERE cp1.profile_id = v_uid
     AND cp2.profile_id = p_peer_id
     AND c.is_group = false
   LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- Não existe: cria a conversa e adiciona os dois participantes.
  INSERT INTO public.conversations (is_group)
  VALUES (false)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_conv_id, v_uid), (v_conv_id, p_peer_id);

  RETURN v_conv_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;
