import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1?target=deno";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();

  if (!signature || !webhookSecret) {
    return new Response("Webhook secret or signature missing.", { status: 400 });
  }

  try {
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );

    // Idempotencia
    const { error: idemErr } = await supabaseAdmin
      .from("processed_webhook_events")
      .insert({ id: event.id });

    if (idemErr) {
      return new Response(
        JSON.stringify({ received: true, duplicate: true }),
        { status: 200 },
      );
    }

    const connectedAccountId = event.account;

    switch (event.type) {
      // Conta conectada atualizada (onboarding, verificacao, etc.)
      case "account.updated": {
        const account: any = event.data.object;
        if (connectedAccountId) {
          await supabaseAdmin
            .from("creator_payout_info")
            .update({
              status: account.charges_enabled ? "COMPLETED" : "PENDING",
              account_details: {
                stripe_account_id: connectedAccountId,
                charges_enabled: account.charges_enabled ?? false,
                payouts_enabled: account.payouts_enabled ?? false,
                last_synced_at: new Date().toISOString(),
              },
            })
            .eq("account_details->>stripe_account_id", connectedAccountId);
        }
        break;
      }

      // Checkout completado em conta conectada (fallback/complementar ao handle-purchases-webhook)
      case "checkout.session.completed": {
        const session: any = event.data.object;
        console.log(
          "handle-stripe-webhook: checkout.session.completed",
          session.id,
          "mode:", session.mode,
          "payment_status:", session.payment_status,
        );
        // Processamento principal e feito pelo handle-purchases-webhook
        // Este handler serve como fallback/log
        break;
      }

      default:
        console.log("handle-stripe-webhook: evento nao tratado:", event.type);
        break;
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error: any) {
    console.error("Erro no webhook geral:", error?.message ?? error);

    if (
      (error?.message || "").includes("duplicate key value") ||
      (error?.message || "").includes("23505")
    ) {
      return new Response(
        JSON.stringify({ received: true, deduped: true }),
        { status: 200 },
      );
    }

    return new Response(
      JSON.stringify({ error: error?.message ?? "unknown" }),
      { status: 400 },
    );
  }
});
