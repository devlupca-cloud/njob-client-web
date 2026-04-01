-- Criação da RPC get_creators_filtered com suporte a filtro e busca pelo backend
-- Filtros: todos, online, lives, conteudo, presencial, mulheres, homens
-- Busca: ILIKE no full_name

CREATE OR REPLACE FUNCTION public.get_creators_filtered(
  p_filter TEXT DEFAULT 'todos',
  p_search TEXT DEFAULT ''
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
SELECT COALESCE(
  jsonb_agg(creator ORDER BY (creator->>'quantidade_likes')::INT DESC),
  '[]'::jsonb
)
FROM (
  SELECT jsonb_build_object(
    'id',                    p.id,
    'nome',                  p.full_name,
    'foto_perfil',           p.avatar_url,
    'status',                CASE
                                WHEN live_count  > 0 THEN 'em live'
                                WHEN p.is_active = true THEN 'online'
                                ELSE 'offline'
                              END,
    'quantidade_likes',      likes_count,
    'data_criacao',          to_char(p.created_at, 'YYYY-MM-DD'),
    'vende_conteudo',        ps.sell_packs,
    'faz_encontro_presencial', ps.face_to_face_meeting,
    'genero',                cd.gender
  ) AS creator
  FROM public.profiles p
  JOIN public.profile_settings ps ON ps.profile_id = p.id
  LEFT JOIN public.creator_description cd ON cd.profile_id = p.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS live_count
      FROM public.live_streams ls
     WHERE ls.creator_id = p.id
       AND ls.status = 'live'::live_stream_status
  ) live ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS likes_count
      FROM public.content_likes cl
     WHERE cl.creator_id = p.id
  ) likes ON TRUE
  WHERE p.role = 'creator'
    AND (
      p_filter = 'todos'
      OR (p_filter = 'online' AND p.is_active = true)
      OR (p_filter = 'lives' AND live_count > 0)
      OR (p_filter = 'conteudo' AND ps.sell_packs = true)
      OR (p_filter = 'presencial' AND ps.face_to_face_meeting = true)
      OR (p_filter = 'mulheres' AND cd.gender = 'Mulher')
      OR (p_filter = 'homens' AND cd.gender = 'Homem')
    )
    AND (
      p_search = ''
      OR p.full_name ILIKE '%' || p_search || '%'
    )
) sub;
$$;

-- Atualização da get_creators_status original para usar is_active no status
CREATE OR REPLACE FUNCTION public.get_creators_status()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
SELECT COALESCE(
  jsonb_agg(creator ORDER BY (creator->>'quantidade_likes')::INT DESC),
  '[]'::jsonb
)
FROM (
  SELECT jsonb_build_object(
    'id',                    p.id,
    'nome',                  p.full_name,
    'foto_perfil',           p.avatar_url,
    'status',                CASE
                                WHEN live_count  > 0 THEN 'em live'
                                WHEN p.is_active = true THEN 'online'
                                ELSE 'offline'
                              END,
    'quantidade_likes',      likes_count,
    'data_criacao',          to_char(p.created_at, 'YYYY-MM-DD'),
    'vende_conteudo',        ps.sell_packs,
    'faz_encontro_presencial', ps.face_to_face_meeting,
    'genero',                cd.gender
  ) AS creator
  FROM public.profiles p
  JOIN public.profile_settings ps ON ps.profile_id = p.id
  LEFT JOIN public.creator_description cd ON cd.profile_id = p.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS live_count
      FROM public.live_streams ls
     WHERE ls.creator_id = p.id
       AND ls.status = 'live'::live_stream_status
  ) live ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS likes_count
      FROM public.content_likes cl
     WHERE cl.creator_id = p.id
  ) likes ON TRUE
  WHERE p.role = 'creator'
) sub;
$$;
