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

const webhookSecret = Deno.env.get("STRIPE_SUBSCRIPTIONS_WEBHOOK_SECRET");

function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active": return "active";
    case "past_due": return "past_due";
    case "canceled": return "cancelled";
    case "unpaid": return "past_due";
    case "trialing": return "active";
    case "incomplete": return "pending";
    case "incomplete_expired": return "expired";
    default: return stripeStatus;
  }
}

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

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription: any = event.data.object;
        await upsertSubscription(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription: any = event.data.object;
        await supabaseAdmin
          .from("creator_subscriptions")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("gateway_subscription_id", subscription.id);
        break;
      }

      case "invoice.paid": {
        const invoice: any = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          await upsertSubscription(subscription);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice: any = event.data.object;
        if (invoice.subscription) {
          await supabaseAdmin
            .from("creator_subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("gateway_subscription_id", invoice.subscription);
        }
        break;
      }

      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error: any) {
    console.error("Erro no webhook de subscriptions:", error?.message ?? error);

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

async function upsertSubscription(subscription: any, userIdOverride?: string) {
  const stripeCustomerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;

  let userId = userIdOverride || subscription.metadata?.supabase_user_id;

  if (!userId && stripeCustomerId) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", stripeCustomerId)
      .single();
    userId = profile?.id;
  }

  if (!userId) {
    console.error("upsertSubscription: nao foi possivel resolver user_id", subscription.id);
    return;
  }

  const stripePriceId = subscription.items?.data?.[0]?.price?.id;
  let planId: string | null = null;

  if (stripePriceId) {
    const { data: plan } = await supabaseAdmin
      .from("subscription_plans")
      .select("id")
      .eq("stripe_price_id", stripePriceId)
      .single();
    planId = plan?.id ?? null;
  }

  if (!planId) {
    console.error("upsertSubscription: stripe_price_id nao encontrado:", stripePriceId);
    return;
  }

  const payload = {
    creator_id: userId,
    plan_id: planId,
    gateway_subscription_id: subscription.id,
    status: mapStripeStatus(subscription.status),
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    cancelled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("creator_subscriptions")
    .upsert(payload, { onConflict: "creator_id" });

  if (error) {
    console.error("Erro ao upsert creator_subscriptions:", error.message);
  }
}
