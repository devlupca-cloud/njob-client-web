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
    const userEmail = payload?.email as string | undefined;
    if (!userId) throw new Error("ID do usuario nao encontrado no token");

    // 2) Verificar se ja existe conta Stripe conectada
    const { data: existing } = await supabaseAdmin
      .from("creator_payout_info")
      .select("account_details")
      .eq("creator_id", userId)
      .maybeSingle();

    let stripeAccountId = existing?.account_details?.stripe_account_id;

    // 3) Criar conta Express se nao existir
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "BR",
        email: userEmail || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          boleto_payments: { requested: true },
        },
        business_type: "individual",
        metadata: { supabase_user_id: userId },
      });

      stripeAccountId = account.id;

      // Salvar na tabela creator_payout_info
      await supabaseAdmin.from("creator_payout_info").upsert(
        {
          creator_id: userId,
          payout_method: "stripe",
          status: "PENDING",
          account_details: {
            stripe_account_id: stripeAccountId,
            charges_enabled: false,
            payouts_enabled: false,
          },
        },
        { onConflict: "creator_id" },
      );
    }

    // 4) Criar link de onboarding
    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${baseUrl}/functions/v1/create-stripe-connected-account`,
      return_url: "https://njob-creator-web.vercel.app/profile",
      type: "account_onboarding",
    });

    return new Response(
      JSON.stringify({ url: accountLink.url, onboarding_url: accountLink.url }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message ?? "unknown" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
