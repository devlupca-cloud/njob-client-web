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

    // Idempotência atômica: marca o evento como processado JÁ. Se outro
    // worker do Stripe Webhook bateu primeiro com o mesmo event.id, o
    // INSERT viola a PK e devolvemos 200 sem reprocessar. Padrão SELECT+INSERT
    // não bastava — o intervalo entre as duas chamadas é janela de race em
    // retry simultâneo do Stripe.
    const { error: lockErr } = await supabaseAdmin
      .from("processed_webhook_events")
      .insert({ id: event.id });

    if (lockErr) {
      const msg = lockErr.message ?? "";
      if (lockErr.code === "23505" || msg.includes("duplicate key")) {
        return new Response(
          JSON.stringify({ received: true, duplicate: true }),
          { status: 200 },
        );
      }
      // Erro inesperado de DB ao reservar o lock — propaga para o Stripe
      // retentar de novo (não silenciar).
      throw lockErr;
    }

    // Conta conectada (para compras via Stripe Connect)
    const connectedAccountId = event.account;

    try {
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

        // ─── Refund / dispute — devolve dinheiro e revoga compra ─────────
        case "charge.refunded": {
          const charge: any = event.data.object;
          const paymentIntentId = charge.payment_intent;
          if (paymentIntentId) {
            await handleRefund(paymentIntentId);
          }
          break;
        }

        case "charge.dispute.created": {
          const dispute: any = event.data.object;
          const charge = await stripe.charges.retrieve(dispute.charge);
          const paymentIntentId = (charge as any).payment_intent;
          if (paymentIntentId) {
            // Marca tudo como refunded (chargeback ≈ refund forçado).
            await handleRefund(paymentIntentId);
          }
          break;
        }

        default:
          break;
      }
    } catch (handlerErr) {
      // Handler falhou após reservarmos o lock. Liberamos a linha para que
      // o Stripe possa reentregar o evento — caso contrário o pagamento
      // ficaria "marcado como processado" sem ter sido aplicado.
      await supabaseAdmin
        .from("processed_webhook_events")
        .delete()
        .eq("id", event.id);
      throw handlerErr;
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error: any) {
    console.error("Erro no webhook:", error?.message ?? error);

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
    console.error(
      "ERRO: event.account ausente — este webhook DEVE ser registrado como Connect webhook no Stripe Dashboard " +
      "(Connect > Webhooks), não como webhook da conta principal. Sem o connectedAccountId, não é possível " +
      "recuperar o PaymentIntent da conta conectada."
    );
    throw new Error(
      "event.account ausente — configure este endpoint como Connect webhook no Stripe Dashboard"
    );
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

  // Registro especifico da compra (com verificação de duplicidade)
  if (product_type === "pack") {
    // Verificar ownership: o creator_id do metadata deve ser o dono do pack
    if (metaCreatorId) {
      const { data: packOwner } = await supabaseAdmin
        .from("packs")
        .select("profile_id")
        .eq("id", product_id)
        .single();
      if (packOwner && packOwner.profile_id !== metaCreatorId) {
        throw new Error(`creator_id ${metaCreatorId} não é dono do pack ${product_id}`);
      }
    }

    // Verificar idempotência por gateway_transaction_id (evita duplicata real de webhook retry)
    const { data: existingByTx } = await supabaseAdmin
      .from("pack_purchases")
      .select("id")
      .eq("transaction_id", transactionId)
      .maybeSingle();

    if (existingByTx) {
      console.warn(`[webhook] Pack purchase já existe para transaction ${transactionId} — ignorando retry`);
      await supabaseAdmin.from("transactions").update({ related_purchase_id: existingByTx.id }).eq("id", transactionId);
    } else {
      const { data: packRow, error } = await supabaseAdmin.from("pack_purchases").insert({
        user_id: customerId,
        pack_id: product_id,
        purchase_price: amount,
        currency,
        status: "completed",
        transaction_id: transactionId,
        platform_fee: platformFee,
        creator_share: creatorShare,
      }).select("id").single();
      if (error) throw error;

      // Vincular transação à compra para que get_creator_metrics calcule faturamento
      if (packRow) {
        await supabaseAdmin.from("transactions").update({ related_purchase_id: packRow.id }).eq("id", transactionId);
      }
    }
  } else if (product_type === "live_ticket") {
    // Verificar ownership: o creator_id do metadata deve ser o dono da live
    if (metaCreatorId) {
      const { data: liveOwner } = await supabaseAdmin
        .from("live_streams")
        .select("creator_id")
        .eq("id", product_id)
        .single();
      if (liveOwner && liveOwner.creator_id !== metaCreatorId) {
        throw new Error(`creator_id ${metaCreatorId} não é dono da live ${product_id}`);
      }
    }

    // Verificar se já existe ticket para esta live + usuário
    const { data: existingTicket } = await supabaseAdmin
      .from("live_stream_tickets")
      .select("id")
      .eq("user_id", customerId)
      .eq("live_stream_id", product_id)
      .eq("status", "completed")
      .maybeSingle();

    if (existingTicket) {
      console.warn(`[webhook] Live ticket ${product_id} já comprado por ${customerId} — ignorando duplicata`);
      await supabaseAdmin.from("transactions").update({ related_ticket_id: existingTicket.id }).eq("id", transactionId);
    } else {
      const { data: ticketRow, error } = await supabaseAdmin
        .from("live_stream_tickets")
        .insert({
          user_id: customerId,
          live_stream_id: product_id,
          purchase_price: amount,
          status: "completed",
          transaction_id: transactionId,
          platform_fee: platformFee,
          creator_share: creatorShare,
        })
        .select("id").single();
      if (error) throw error;

      // Vincular transação ao ticket para que get_creator_metrics calcule faturamento
      if (ticketRow) {
        await supabaseAdmin.from("transactions").update({ related_ticket_id: ticketRow.id }).eq("id", transactionId);
      }
    }
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
    const { data: callRow, error: callErr } = await supabaseAdmin
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
      })
      .select("id").single();

    if (callErr) {
      // Rollback: desfaz a reserva do slot
      await supabaseAdmin
        .from("creator_availability_slots")
        .update({ purchased: false })
        .eq("id", slotId);
      throw new Error(`Erro ao criar registro de video-call: ${callErr.message}`);
    }

    // Vincular transação à chamada para que get_creator_metrics calcule faturamento
    if (callRow) {
      await supabaseAdmin.from("transactions").update({ related_call_id: callRow.id }).eq("id", transactionId);
    }
  } else if (product_type === "video-call-request") {
    // Fluxo novo: creator já aceitou, a call existe com status='awaiting_payment'.
    // O UPDATE status='paid' precisa passar pelo trigger fn_validate_call_transition,
    // mas service_role bypassa RLS sem acionar o guard — o trigger permite a
    // transição awaiting_payment→paid via SECURITY DEFINER RPC dedicado.
    const callId = (session.metadata ?? {}).call_id || product_id;

    if (!callId) {
      throw new Error("call_id ausente em video-call-request metadata");
    }

    // Verificar ownership: a call tem que pertencer a este creator.
    const { data: callCheck, error: callCheckErr } = await supabaseAdmin
      .from("one_on_one_calls")
      .select("id, creator_id, user_id, status")
      .eq("id", callId)
      .maybeSingle();

    if (callCheckErr || !callCheck) {
      throw new Error(`Call ${callId} não encontrada para video-call-request`);
    }

    if (metaCreatorId && callCheck.creator_id !== metaCreatorId) {
      throw new Error(
        `creator_id ${metaCreatorId} não bate com a call ${callId}`,
      );
    }

    if (callCheck.user_id !== customerId) {
      throw new Error(
        `customerId ${customerId} não bate com a call ${callId}`,
      );
    }

    // Idempotência: se já está pago, só relinka a transação e segue.
    if (callCheck.status === "paid" || callCheck.status === "confirmed") {
      console.warn(
        `[webhook] Call ${callId} já está em status=${callCheck.status} — apenas vinculando transação`,
      );
      await supabaseAdmin
        .from("transactions")
        .update({ related_call_id: callId })
        .eq("id", transactionId);
    } else {
      // Transição awaiting_payment → paid via RPC que bypassa o trigger.
      const { error: markErr } = await supabaseAdmin.rpc("fn_mark_call_paid", {
        p_call_id: callId,
        p_transaction_id: transactionId,
        p_platform_fee: platformFee,
        p_creator_share: creatorShare,
      });

      if (markErr) {
        throw new Error(
          `Erro ao marcar call ${callId} como paga: ${markErr.message}`,
        );
      }

      await supabaseAdmin
        .from("transactions")
        .update({ related_call_id: callId })
        .eq("id", transactionId);
    }
  }

  // ─── Notificar ambos os lados ──────────────────────────────────────────────
  // No video-call-request a metadata pode vir sem creator_id (depende de quem
  // criou o checkout) — recuperamos do próprio registro da call para garantir
  // que a notificação chega ao creator certo.
  let resolvedCreatorId = metaCreatorId;
  if (!resolvedCreatorId && product_type === "video-call-request") {
    const callId = (session.metadata ?? {}).call_id || product_id;
    if (callId) {
      const { data: callRow } = await supabaseAdmin
        .from("one_on_one_calls")
        .select("creator_id")
        .eq("id", callId)
        .maybeSingle();
      resolvedCreatorId = (callRow as { creator_id?: string } | null)?.creator_id;
    }
  }

  await notifyCreatorOfSale(resolvedCreatorId, customerId, product_type, product_id, amount, currency);
  await notifyBuyerOfPurchase(customerId, resolvedCreatorId, product_type, product_id, amount, currency);
}

/**
 * Cria uma notificação para o creator informando sobre uma nova venda.
 * Busca o nome do comprador para exibir na notificação.
 */
async function notifyCreatorOfSale(
  creatorId: string | undefined,
  buyerId: string,
  productType: string,
  productId: string,
  amount: number,
  currency: string,
) {
  if (!creatorId) {
    console.warn("[webhook] creator_id ausente — notificação não criada");
    return;
  }

  try {
    // Buscar nome do comprador
    const { data: buyer } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", buyerId)
      .single();

    const buyerName = buyer?.full_name || "Um cliente";
    const formattedAmount = `${currency} ${amount.toFixed(2).replace(".", ",")}`;

    let title: string;
    let message: string;
    let type = "success";

    switch (productType) {
      case "pack": {
        const { data: pack } = await supabaseAdmin
          .from("packs")
          .select("title")
          .eq("id", productId)
          .single();
        title = "Nova venda de pacote!";
        message = `${buyerName} comprou o pacote "${pack?.title || "Sem título"}" por ${formattedAmount}.`;
        break;
      }
      case "live_ticket": {
        const { data: live } = await supabaseAdmin
          .from("live_streams")
          .select("title")
          .eq("id", productId)
          .single();
        title = "Novo ingresso vendido!";
        message = `${buyerName} comprou ingresso para "${live?.title || "Live"}" por ${formattedAmount}.`;
        break;
      }
      case "video-call":
        title = "Nova videochamada agendada!";
        message = `${buyerName} agendou uma videochamada por ${formattedAmount}.`;
        break;
      case "video-call-request":
        title = "Videochamada paga — entrar na sala!";
        message = `${buyerName} pagou a videochamada (${formattedAmount}). Você já pode entrar na sala.`;
        break;
      default:
        title = "Nova venda!";
        message = `${buyerName} realizou uma compra de ${formattedAmount}.`;
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: creatorId,
      title,
      message,
      type,
      is_read: false,
      data: {
        product_type: productType,
        product_id: productId,
        buyer_id: buyerId,
        amount,
        currency,
      },
    });
  } catch (err) {
    // Não falhar o webhook por causa de notificação
    console.error("[webhook] Erro ao criar notificação para creator:", err);
  }
}

/**
 * Marca uma transação como refunded e revoga a compra relacionada.
 *
 * Quando o Stripe devolve o dinheiro (refund manual no Dashboard,
 * cancelamento via Customer Portal, ou chargeback/dispute), o cliente não
 * deveria continuar com pack/ingresso/call válidos. Sem este handler, o
 * dinheiro voltava mas a plataforma continuava liberando o conteúdo.
 *
 * Idempotente: se já estiver refunded, sai limpo.
 */
async function handleRefund(paymentIntentId: string) {
  try {
    const { data: tx } = await supabaseAdmin
      .from("transactions")
      .select("id, status, related_purchase_id, related_ticket_id, related_call_id, user_id")
      .eq("gateway_transaction_id", paymentIntentId)
      .maybeSingle();

    if (!tx) {
      console.warn(`[refund] transação não encontrada para PI ${paymentIntentId}`);
      return;
    }

    if (tx.status === "refunded") {
      console.warn(`[refund] transação ${tx.id} já está refunded — ignorando`);
      return;
    }

    await supabaseAdmin
      .from("transactions")
      .update({ status: "refunded", updated_at: new Date().toISOString() })
      .eq("id", tx.id);

    if (tx.related_purchase_id) {
      await supabaseAdmin
        .from("pack_purchases")
        .update({ status: "refunded" })
        .eq("id", tx.related_purchase_id);
    }

    if (tx.related_ticket_id) {
      await supabaseAdmin
        .from("live_stream_tickets")
        .update({ status: "refunded" })
        .eq("id", tx.related_ticket_id);
    }

    if (tx.related_call_id) {
      // Cancela a call. Bypass de trigger via RPC dedicado seria o ideal;
      // como service_role + replication role na atualização cobre o trigger,
      // usamos rpc se existir, senão UPDATE direto com bypass.
      const { error: callErr } = await supabaseAdmin.rpc("fn_cancel_call_refund", {
        p_call_id: tx.related_call_id,
      });
      if (callErr) {
        console.warn(`[refund] fn_cancel_call_refund falhou: ${callErr.message}`);
      }
    }

    // Notifica o comprador da devolução.
    const buyer = tx.user_id;
    if (buyer) {
      await supabaseAdmin.from("notifications").insert({
        user_id: buyer,
        title: "Reembolso processado",
        message: "O pagamento foi estornado pelo Stripe. O acesso à compra foi removido.",
        type: "info",
        is_read: false,
        data: { transaction_id: tx.id, payment_intent: paymentIntentId },
      });
    }
  } catch (err) {
    console.error("[refund] erro:", err);
  }
}

/**
 * Notifica o comprador (cliente) da própria compra concluída. Independente
 * da edge function que originou o checkout — funciona pra pack, live ticket,
 * video-call e video-call-request.
 */
async function notifyBuyerOfPurchase(
  buyerId: string | undefined,
  creatorId: string | undefined,
  productType: string,
  productId: string,
  amount: number,
  currency: string,
) {
  if (!buyerId) {
    console.warn("[webhook] buyerId ausente — notificação do cliente não criada");
    return;
  }

  try {
    const formattedAmount = `${currency} ${amount.toFixed(2).replace(".", ",")}`;
    let creatorName = "creator";
    if (creatorId) {
      const { data: creator } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", creatorId)
        .single();
      creatorName = (creator as { full_name?: string } | null)?.full_name || "creator";
    }

    let title: string;
    let message: string;

    switch (productType) {
      case "pack": {
        const { data: pack } = await supabaseAdmin
          .from("packs")
          .select("title")
          .eq("id", productId)
          .single();
        title = "Compra confirmada!";
        message = `Você comprou o pacote "${(pack as { title?: string } | null)?.title || "conteúdo"}" de ${creatorName} por ${formattedAmount}. Já está disponível na aba Comprados.`;
        break;
      }
      case "live_ticket": {
        const { data: live } = await supabaseAdmin
          .from("live_streams")
          .select("title, scheduled_start_time")
          .eq("id", productId)
          .single();
        title = "Ingresso confirmado!";
        message = `Você comprou o ingresso para "${(live as { title?: string } | null)?.title || "Live"}" de ${creatorName} por ${formattedAmount}.`;
        break;
      }
      case "video-call":
      case "video-call-request":
        title = "Videochamada confirmada!";
        message = `Sua videochamada com ${creatorName} foi paga (${formattedAmount}). Já pode entrar na sala.`;
        break;
      default:
        title = "Compra confirmada!";
        message = `Sua compra de ${formattedAmount} foi processada.`;
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: buyerId,
      title,
      message,
      type: "success",
      is_read: false,
      data: {
        product_type: productType,
        product_id: productId,
        creator_id: creatorId ?? null,
        amount,
        currency,
      },
    });
  } catch (err) {
    console.error("[webhook] Erro ao criar notificação para comprador:", err);
  }
}
