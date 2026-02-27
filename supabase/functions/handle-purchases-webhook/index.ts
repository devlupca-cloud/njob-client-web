import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1?target=deno";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const webhookSecret = Deno.env.get("STRIPE_PURCHASES_WEBHOOK_SECRET");

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

    // Idempotencia: checar se já foi processado (sem inserir ainda)
    const { data: existing } = await supabaseAdmin
      .from("processed_webhook_events")
      .select("id")
      .eq("id", event.id)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ received: true, duplicate: true }),
        { status: 200 },
      );
    }

    // Conta conectada (para compras via Stripe Connect)
    const connectedAccountId = event.account;

    switch (event.type) {
      // ─── Compras one-time (packs, lives, video-calls) ─────────────────
      case "checkout.session.completed": {
        const session: any = event.data.object;

        // Assinatura concluida via checkout
        if (session.mode === "subscription" && session.payment_status === "paid") {
          await handleSubscriptionCheckoutCompleted(session);
          break;
        }

        // Compras one-shot pagas
        if (session.mode === "payment" && session.payment_status === "paid") {
          await handlePaymentCheckoutCompleted(session, connectedAccountId);
        }
        break;
      }

      // ─── Subscription lifecycle events ────────────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription: any = event.data.object;
        await upsertSubscription(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription: any = event.data.object;
        await cancelSubscription(subscription);
        break;
      }

      case "invoice.paid": {
        const invoice: any = event.data.object;
        if (invoice.subscription) {
          // Renovacao de assinatura — atualizar periodo
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          await upsertSubscription(subscription);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice: any = event.data.object;
        if (invoice.subscription) {
          // Marcar assinatura como past_due
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

    // Marcar como processado APÓS sucesso (permite retry se falhar)
    await supabaseAdmin
      .from("processed_webhook_events")
      .insert({ id: event.id });

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error: any) {
    console.error("Erro no webhook:", error?.message ?? error);

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

// ─── Subscription Helpers ─────────────────────────────────────────────────────

async function handleSubscriptionCheckoutCompleted(session: any) {
  const userId = session.client_reference_id || session.metadata?.supabase_user_id;
  if (!userId) {
    console.error("checkout.session.completed (subscription): sem user_id");
    return;
  }

  // Salvar stripe_customer_id no perfil se ainda nao tiver
  const stripeCustomerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id;

  if (stripeCustomerId) {
    await supabaseAdmin
      .from("profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", userId);
  }

  // Se tiver subscription ID, buscar e salvar
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id;

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await upsertSubscription(subscription, userId);
  }
}

async function upsertSubscription(subscription: any, clientIdOverride?: string) {
  const stripeCustomerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;

  // Resolver client_id (the subscriber/fan): usar override ou metadata ou buscar pelo stripe_customer_id
  let clientId = clientIdOverride || subscription.metadata?.supabase_user_id;

  if (!clientId && stripeCustomerId) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", stripeCustomerId)
      .single();
    clientId = profile?.id;
  }

  if (!clientId) {
    console.error("upsertSubscription: nao foi possivel resolver client_id para subscription", subscription.id);
    return;
  }

  // Resolver creator_id from metadata
  const creatorId = subscription.metadata?.creator_id;
  if (!creatorId) {
    console.error("upsertSubscription: creator_id ausente no metadata da subscription", subscription.id);
    return;
  }

  // Resolver plan_id pelo stripe_price_id
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
    console.error("upsertSubscription: stripe_price_id nao encontrado em subscription_plans:", stripePriceId);
    return;
  }

  const payload = {
    client_id: clientId,
    creator_id: creatorId,
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

  // Upsert: composite unique on (client_id, creator_id)
  const { error } = await supabaseAdmin
    .from("creator_subscriptions")
    .upsert(payload, { onConflict: "client_id,creator_id" });

  if (error) {
    console.error("Erro ao upsert creator_subscriptions:", error.message);
  }
}

async function cancelSubscription(subscription: any) {
  const { error } = await supabaseAdmin
    .from("creator_subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("gateway_subscription_id", subscription.id);

  if (error) {
    console.error("Erro ao cancelar subscription:", error.message);
  }
}

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

// ─── One-time Payment Helpers ─────────────────────────────────────────────────

async function handlePaymentCheckoutCompleted(session: any, connectedAccountId?: string) {
  if (!connectedAccountId) {
    console.warn("Webhook sem event.account — verifique se o endpoint ouve contas conectadas.");
  }

  const {
    product_id,
    product_type,
    creator_id: metaCreatorId,
    duration,
  } = session.metadata ?? {};

  const customerId = session.client_reference_id;
  const amount = (session.amount_total ?? 0) / 100;
  const currency = String(session.currency || "brl").toUpperCase();

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  if (!paymentIntentId) throw new Error("payment_intent ausente na session");

  // Em direct charge, o PI vive NA CONTA CONECTADA
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    stripeAccount: connectedAccountId,
  });

  const platformFeeInCents = pi.application_fee_amount ?? 0;
  const platformFee = platformFeeInCents / 100;
  const creatorShare = amount - platformFee;

  // UPSERT por gateway_transaction_id
  const txPayload = {
    user_id: customerId,
    amount,
    currency,
    gateway: "stripe",
    gateway_transaction_id: paymentIntentId,
    status: "completed",
  };

  const { data: txRows, error: txErr } = await supabaseAdmin
    .from("transactions")
    .upsert(txPayload, {
      onConflict: "gateway_transaction_id",
      ignoreDuplicates: false,
    })
    .select("id")
    .limit(1);

  if (txErr) {
    throw new Error(`Erro ao criar/atualizar transação: ${txErr.message}`);
  }

  const transactionId = txRows?.[0]?.id;
  if (!transactionId) {
    throw new Error("Falha ao obter transactionId após upsert");
  }

  // Registro especifico da compra
  if (product_type === "pack") {
    const { error } = await supabaseAdmin.from("pack_purchases").insert({
      user_id: customerId,
      pack_id: product_id,
      purchase_price: amount,
      currency,
      status: "completed",
      transaction_id: transactionId,
      platform_fee: platformFee,
      creator_share: creatorShare,
    });
    if (error) throw error;
  } else if (product_type === "live_ticket") {
    const { error } = await supabaseAdmin
      .from("live_stream_tickets")
      .insert({
        user_id: customerId,
        live_stream_id: product_id,
        purchase_price: amount,
        status: "completed",
        transaction_id: transactionId,
        platform_fee: platformFee,
        creator_share: creatorShare,
      });
    if (error) throw error;
  } else if (product_type === "video-call") {
    if (!product_id) {
      throw new Error("product_id (slot_id) ausente em video-call metadata");
    }

    const { data: slotRow, error: slotErr } = await supabaseAdmin
      .from("creator_availability_slots")
      .select(`
        id,
        slot_time,
        availability:creator_availability!inner (
          id,
          availability_date,
          creator_id
        )
      `)
      .eq("id", product_id)
      .single();

    if (slotErr || !slotRow) {
      throw new Error(`Slot de disponibilidade não encontrado para id=${product_id}`);
    }

    const slotId = slotRow.id;
    const slotTime: string = slotRow.slot_time;
    const availabilityDate: string = slotRow.availability.availability_date;
    const availabilityCreatorId: string = slotRow.availability.creator_id;

    if (metaCreatorId && metaCreatorId !== availabilityCreatorId) {
      console.warn(
        "creator_id do metadata diferente do creator_id da availability. Usando o da availability.",
      );
    }

    const durationMinutes =
      typeof duration === "string"
        ? parseInt(duration, 10) || 30
        : typeof duration === "number"
        ? duration
        : 30;

    // Build UTC timestamp from local BRT date+time (UTC-3)
    const timePart = String(slotTime).slice(0, 8); // ensure HH:mm:ss only
    const scheduledStartTime = new Date(`${availabilityDate}T${timePart}-03:00`).toISOString();

    // 1) Marcar slot como comprado ATOMICAMENTE (previne race condition)
    const { data: updatedSlots, error: slotUpdateErr } = await supabaseAdmin
      .from("creator_availability_slots")
      .update({ purchased: true })
      .eq("id", slotId)
      .eq("purchased", false)
      .select("id");

    if (slotUpdateErr) {
      throw new Error(`Erro ao reservar slot: ${slotUpdateErr.message}`);
    }

    if (!updatedSlots || updatedSlots.length === 0) {
      console.warn(`Slot ${slotId} já foi comprado por outro cliente. Ignorando duplicata.`);
      return;
    }

    // 1b) Se duração é 60 min, marcar o próximo slot de 30 min como comprado também
    if (durationMinutes === 60) {
      const [hh, mm] = String(slotTime).slice(0, 5).split(":").map(Number);
      const nextMin = hh * 60 + mm + 30;
      const nextH = String(Math.floor(nextMin / 60) % 24).padStart(2, "0");
      const nextM = String(nextMin % 60).padStart(2, "0");
      const nextTime = `${nextH}:${nextM}`;

      // Find the availability_id for this slot
      const availabilityId = (slotRow as any).availability.id;

      const { error: nextSlotErr } = await supabaseAdmin
        .from("creator_availability_slots")
        .update({ purchased: true })
        .eq("availability_id", availabilityId)
        .like("slot_time", `${nextTime}%`)
        .eq("purchased", false);

      if (nextSlotErr) {
        console.warn(`Erro ao reservar slot seguinte (${nextTime}): ${nextSlotErr.message}`);
      }
    }

    // 2) Criar registro da chamada (slot já reservado)
    const { error: callErr } = await supabaseAdmin
      .from("one_on_one_calls")
      .insert({
        user_id: customerId,
        creator_id: availabilityCreatorId,
        availability_slot_id: slotId,
        scheduled_start_time: scheduledStartTime,
        scheduled_duration_minutes: durationMinutes,
        call_price: amount,
        currency,
        status: "confirmed",
        transaction_id: transactionId,
        platform_fee: platformFee,
        creator_share: creatorShare,
      });

    if (callErr) {
      // Rollback: desfaz a reserva do slot
      await supabaseAdmin
        .from("creator_availability_slots")
        .update({ purchased: false })
        .eq("id", slotId);
      throw new Error(`Erro ao criar registro de video-call: ${callErr.message}`);
    }
  }
}
