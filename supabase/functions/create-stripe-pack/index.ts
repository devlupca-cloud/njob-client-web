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

    // 2) Body — espera p_payload com dados do pack
    const body = await req.json();
    const pPayload = body.p_payload ?? body;

    const packId = pPayload.pack_id;
    const title = pPayload.title || "Pacote de conteudo";
    const price = Number(pPayload.price);
    const coverUrl = pPayload.cover_image_url || "";

    if (!packId) throw new Error("pack_id e obrigatorio");
    if (!price || price <= 0) throw new Error("Preco invalido");

    // 3) Buscar conta Stripe conectada do creator
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
        name: title,
        images: coverUrl ? [coverUrl] : [],
        metadata: { supabase_pack_id: packId, creator_id: userId },
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

    // 5) Atualizar pack no Supabase com IDs do Stripe
    const { error: updateError } = await supabaseAdmin
      .from("packs")
      .update({
        stripe_product_id: product.id,
        stripe_price_id: stripePrice.id,
        status: "published",
      })
      .eq("id", packId);

    if (updateError) {
      console.error("Erro ao atualizar pack:", updateError.message);
      throw new Error("Produto criado no Stripe mas falhou ao atualizar banco de dados.");
    }

    return new Response(
      JSON.stringify({
        status: true,
        message: "Pacote criado com sucesso no Stripe",
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
