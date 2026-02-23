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

const webhookSecret = Deno.env.get("STRIPE_PAYOUTS_WEBHOOK_SECRET");

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
      // Conta conectada atualizada (onboarding completo, etc.)
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

      // Payout criado
      case "payout.created": {
        const payout: any = event.data.object;
        if (connectedAccountId) {
          // Buscar creator_id pelo stripe_account_id
          const { data: creator } = await supabaseAdmin
            .from("creator_payout_info")
            .select("creator_id")
            .eq("account_details->>stripe_account_id", connectedAccountId)
            .single();

          if (creator) {
            await supabaseAdmin.from("payouts").upsert(
              {
                creator_id: creator.creator_id,
                amount: (payout.amount ?? 0) / 100,
                currency: String(payout.currency || "brl").toUpperCase(),
                status: "processing",
                requested_at: new Date().toISOString(),
                transaction_reference: payout.id,
                idempotency_key: event.id,
              },
              { onConflict: "idempotency_key" },
            );
          }
        }
        break;
      }

      // Payout concluido
      case "payout.paid": {
        const payout: any = event.data.object;
        await supabaseAdmin
          .from("payouts")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
          })
          .eq("transaction_reference", payout.id);
        break;
      }

      // Payout falhou
      case "payout.failed": {
        const payout: any = event.data.object;
        await supabaseAdmin
          .from("payouts")
          .update({
            status: "failed",
            notes: payout.failure_message || "Payout falhou",
          })
          .eq("transaction_reference", payout.id);
        break;
      }

      // Payout atualizado
      case "payout.updated": {
        const payout: any = event.data.object;
        const statusMap: Record<string, string> = {
          paid: "completed",
          pending: "processing",
          in_transit: "processing",
          canceled: "failed",
          failed: "failed",
        };
        const newStatus = statusMap[payout.status] || "processing";
        await supabaseAdmin
          .from("payouts")
          .update({ status: newStatus })
          .eq("transaction_reference", payout.id);
        break;
      }

      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error: any) {
    console.error("Erro no webhook de payouts:", error?.message ?? error);

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
