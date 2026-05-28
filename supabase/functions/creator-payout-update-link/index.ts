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
    const { data: payoutInfo } = await supabaseAdmin
      .from("creator_payout_info")
      .select("account_details, status")
      .eq("creator_id", userId)
      .maybeSingle();

    if (!payoutInfo || !payoutInfo.account_details?.stripe_account_id) {
      // Registro nao existe — retornar indicacao para o frontend criar a conta
      return new Response(
        JSON.stringify({ error: "account_onboarding", status: "NOT_FOUND", message: "Conta Stripe não encontrada. É necessário criar a conta." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const stripeAccountId = payoutInfo.account_details.stripe_account_id;

    // 3) Verificar status da conta no Stripe
    const account = await stripe.accounts.retrieve(stripeAccountId);

    // Status COMPLETED exige charges_enabled E payouts_enabled — só então a
    // conta efetivamente recebe pagamentos. details_submitted=true sem
    // charges_enabled significa que Stripe ainda está verificando OU rejeitou
    // (vide requirements.disabled_reason). Se houver disabled_reason, fica
    // VERIFYING/REJECTED no front, nunca COMPLETED.
    const disabledReason = account.requirements?.disabled_reason || null;
    const pastDue = account.requirements?.past_due || [];
    const currentlyDue = account.requirements?.currently_due || [];
    const fullyEnabled = account.charges_enabled && account.payouts_enabled;

    const newStatus = fullyEnabled
      ? "COMPLETED"
      : account.details_submitted
        ? "VERIFYING"
        : "PENDING";
    await supabaseAdmin
      .from("creator_payout_info")
      .update({
        status: newStatus,
        account_details: {
          ...payoutInfo.account_details,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          disabled_reason: disabledReason,
          past_due: pastDue,
          currently_due: currentlyDue,
          last_synced_at: new Date().toISOString(),
        },
      })
      .eq("creator_id", userId);

    // 4) Gerar link apropriado
    if (fullyEnabled) {
      // Conta totalmente verificada: gerar login link para Express Dashboard
      const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
      return new Response(
        JSON.stringify({ url: loginLink.url, login_url: loginLink.url, status: "COMPLETED" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (account.details_submitted) {
      // Onboarding concluido. Pode estar em verificacao (sem disabled_reason)
      // OU rejeitado/com pendencias (com disabled_reason ou past_due). Em
      // ambos os casos devolvemos tambem um account_link para o creator poder
      // reabrir o onboarding e completar/corrigir os campos.
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: "https://creator.njob.com.br/stripe-setup",
        return_url: "https://creator.njob.com.br/stripe-setup",
        type: "account_onboarding",
      });
      return new Response(
        JSON.stringify({
          status: disabledReason || pastDue.length > 0 ? "REJECTED" : "VERIFYING",
          message: disabledReason
            ? "O Stripe identificou pendências na sua conta. Reabra o cadastro para corrigir."
            : "Sua conta está em verificação pelo Stripe. Isso pode levar alguns minutos.",
          disabled_reason: disabledReason,
          past_due: pastDue,
          currently_due: currentlyDue,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          onboarding_url: accountLink.url,
          url: accountLink.url,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // Conta incompleta: gerar link de onboarding/atualizacao
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: "https://creator.njob.com.br/home",
      return_url: "https://creator.njob.com.br/home",
      type: "account_onboarding",
    });
    return new Response(
      JSON.stringify({ error: "account_onboarding", url: accountLink.url, onboarding_url: accountLink.url }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
