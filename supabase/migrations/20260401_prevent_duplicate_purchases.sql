-- Impede compras duplicadas de packs e ingressos de live

-- Pack: um usuário só pode comprar o mesmo pack uma vez
ALTER TABLE public.pack_purchases
  ADD CONSTRAINT pack_purchases_user_pack_unique UNIQUE (user_id, pack_id);

-- Live ticket: um usuário só pode comprar ingresso da mesma live uma vez
ALTER TABLE public.live_stream_tickets
  ADD CONSTRAINT live_stream_tickets_user_live_unique UNIQUE (user_id, live_stream_id);
