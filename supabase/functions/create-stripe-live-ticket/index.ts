import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1) Autenticacao
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Token ausente");

    const token = authHeader.replace("Bearer ", "");
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("JWT_SECRET nao configurado");

    const key = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });

    const userId = payload?.sub as string | undefined;
    if (!userId) throw new Error("ID do usuario nao encontrado no token");

    // 2) Body
    const body = await req.json();
    const {
      title,
      description,
      scheduled_start_time,
      ticket_price,
      estimated_duration_minutes,
      cover_image_url,
      participant_limit,
    } = body;

    if (!title) throw new Error("Titulo e obrigatorio");
    if (!scheduled_start_time) throw new Error("Data/hora e obrigatoria");
    if (!ticket_price || Number(ticket_price) <= 0) throw new Error("Preco invalido");

    const price = Number(ticket_price);
    const durationMin = estimated_duration_minutes || 60;

    // 3) Buscar conta Stripe conectada
    const { data: payoutInfo, error: payoutError } = await supabaseAdmin
      .from("creator_payout_info")
      .select("account_details")
      .eq("creator_id", userId)
      .single();

    if (payoutError || !payoutInfo) {
      throw new Error("Configuracao de pagamento nao encontrada. Complete o onboarding do Stripe.");
    }

    const stripeAccountId = payoutInfo.account_details?.stripe_account_id;
    if (!stripeAccountId) {
      throw new Error("Conta Stripe nao encontrada.");
    }

    // 4) Criar produto e preco no Stripe (na conta conectada)
    const product = await stripe.products.create(
      {
        name: `Live: ${title}`,
        description: description || undefined,
        images: cover_image_url ? [cover_image_url] : [],
        metadata: { creator_id: userId, type: "live_ticket" },
      },
      { stripeAccount: stripeAccountId },
    );

    const stripePrice = await stripe.prices.create(
      {
        product: product.id,
        unit_amount: Math.round(price * 100),
        currency: "brl",
      },
      { stripeAccount: stripeAccountId },
    );

    // 5) Criar live_stream no Supabase
    const { data: liveStream, error: liveError } = await supabaseAdmin
      .from("live_streams")
      .insert({
        creator_id: userId,
        title,
        description: description || null,
        scheduled_start_time,
        ticket_price: price,
        currency: "BRL",
        status: "scheduled",
        cover_image_url: cover_image_url || null,
        estimated_duration_minutes: durationMin,
        participant_limit: participant_limit || null,
        stripe_product_id: product.id,
        stripe_price_id: stripePrice.id,
      })
      .select("id")
      .single();

    if (liveError) {
      console.error("Erro ao criar live_stream:", liveError.message);
      throw new Error("Evento criado no Stripe mas falhou ao salvar no banco.");
    }

    return new Response(
      JSON.stringify({
        status: true,
        message: "Evento criado com sucesso",
        live_stream_id: liveStream.id,
        stripe_product_id: product.id,
        stripe_price_id: stripePrice.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ status: false, error: error?.message ?? "unknown" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
