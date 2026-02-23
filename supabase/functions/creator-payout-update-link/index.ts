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

    // 2) Buscar stripe_account_id
    const { data: payoutInfo, error: payoutError } = await supabaseAdmin
      .from("creator_payout_info")
      .select("account_details, status")
      .eq("creator_id", userId)
      .single();

    if (payoutError || !payoutInfo) {
      throw new Error("Informacoes de pagamento nao encontradas. Configure sua conta primeiro.");
    }

    const stripeAccountId = payoutInfo.account_details?.stripe_account_id;
    if (!stripeAccountId) {
      throw new Error("Conta Stripe nao encontrada. Faca o onboarding primeiro.");
    }

    // 3) Verificar status da conta no Stripe
    const account = await stripe.accounts.retrieve(stripeAccountId);

    // Atualizar status no banco
    const newStatus = account.charges_enabled ? "COMPLETED" : "PENDING";
    await supabaseAdmin
      .from("creator_payout_info")
      .update({
        status: newStatus,
        account_details: {
          ...payoutInfo.account_details,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          last_synced_at: new Date().toISOString(),
        },
      })
      .eq("creator_id", userId);

    // 4) Gerar link apropriado
    let url: string;

    if (account.details_submitted && account.charges_enabled) {
      // Conta completa: gerar login link para Express Dashboard
      const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
      url = loginLink.url;
    } else {
      // Conta incompleta: gerar link de onboarding/atualizacao
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: "https://njob-creator.vercel.app/profile",
        return_url: "https://njob-creator.vercel.app/profile",
        type: "account_onboarding",
      });
      url = accountLink.url;
      // Sinaliza que precisa completar onboarding
      return new Response(
        JSON.stringify({ error: "account_onboarding", url, onboarding_url: url }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ url, login_url: url }),
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
