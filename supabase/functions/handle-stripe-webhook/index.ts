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

  let eventId: string | null = null;

  try {
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
    eventId = event.id;

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
          const webhookStatus = account.charges_enabled
            ? "COMPLETED"
            : account.details_submitted
              ? "VERIFYING"
              : "PENDING";
          await supabaseAdmin
            .from("creator_payout_info")
            .update({
              status: webhookStatus,
              account_details: {
                stripe_account_id: connectedAccountId,
                charges_enabled: account.charges_enabled ?? false,
                payouts_enabled: account.payouts_enabled ?? false,
                details_submitted: account.details_submitted ?? false,
                last_synced_at: new Date().toISOString(),
              },
            })
            .eq("account_details->>stripe_account_id", connectedAccountId);
        }
        break;
      }

      // Checkout na PLATAFORMA. Pix é cobrado aqui (cobrança na plataforma +
      // transfer), então é onde o crédito do Pix acontece. Pix é assíncrono:
      // a sessão completa com payment_status "unpaid" e a confirmação chega em
      // async_payment_succeeded — por isso tratamos os dois eventos.
      // Cartão/boleto (direct charge na conta conectada) seguem sendo creditados
      // pelo handle-purchases-webhook (endpoint Connect) — NÃO mexer.
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session: any = event.data.object;
        const isPlatformPix = session.metadata?.charge_model === "platform";

        if (
          isPlatformPix &&
          session.mode === "payment" &&
          session.payment_status === "paid"
        ) {
          try {
            await creditPlatformPixPurchase(session);
          } catch (e) {
            // Libera o lock de idempotência para o Stripe poder reenviar.
            if (eventId) {
              await supabaseAdmin
                .from("processed_webhook_events")
                .delete()
                .eq("id", eventId);
            }
            throw e;
          }
        } else {
          console.log(
            "handle-stripe-webhook:",
            event.type,
            session.id,
            "mode:", session.mode,
            "payment_status:", session.payment_status,
            "charge_model:", session.metadata?.charge_model,
          );
        }
        break;
      }

      // Pix expirado / falhou: nada foi creditado, nada a reverter.
      case "checkout.session.async_payment_failed": {
        const session: any = event.data.object;
        console.log("handle-stripe-webhook: async_payment_failed", session.id);
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

// ─── Crédito de compra via PIX (cobrança na plataforma) ─────────────────────
// Espelha o crédito do handle-purchases-webhook, mas o PaymentIntent vive NA
// PLATAFORMA (sem stripeAccount). Suporta pack, live_ticket e video-call-request.
async function creditPlatformPixPurchase(session: any) {
  const {
    product_id,
    product_type,
    creator_id: metaCreatorId,
  } = session.metadata ?? {};

  const customerId = session.client_reference_id;
  const amount = (session.amount_total ?? 0) / 100;
  const currency = String(session.currency || "brl").toUpperCase();

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  if (!paymentIntentId) throw new Error("payment_intent ausente na session");

  // PIX = cobrança na plataforma → PI na conta da plataforma (sem stripeAccount).
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  const platformFee = (pi.application_fee_amount ?? 0) / 100;
  const creatorShare = amount - platformFee;

  const { data: txRows, error: txErr } = await supabaseAdmin
    .from("transactions")
    .upsert(
      {
        user_id: customerId,
        amount,
        currency,
        gateway: "stripe",
        gateway_transaction_id: paymentIntentId,
        status: "completed",
      },
      { onConflict: "gateway_transaction_id", ignoreDuplicates: false },
    )
    .select("id")
    .limit(1);

  if (txErr) throw new Error(`Erro ao criar/atualizar transação: ${txErr.message}`);
  const transactionId = txRows?.[0]?.id;
  if (!transactionId) throw new Error("Falha ao obter transactionId após upsert");

  if (product_type === "pack") {
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

    const { data: existingByTx } = await supabaseAdmin
      .from("pack_purchases")
      .select("id")
      .eq("transaction_id", transactionId)
      .maybeSingle();

    if (existingByTx) {
      await supabaseAdmin
        .from("transactions")
        .update({ related_purchase_id: existingByTx.id })
        .eq("id", transactionId);
    } else {
      const { data: packRow, error } = await supabaseAdmin
        .from("pack_purchases")
        .insert({
          user_id: customerId,
          pack_id: product_id,
          purchase_price: amount,
          currency,
          status: "completed",
          transaction_id: transactionId,
          platform_fee: platformFee,
          creator_share: creatorShare,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (packRow) {
        await supabaseAdmin
          .from("transactions")
          .update({ related_purchase_id: packRow.id })
          .eq("id", transactionId);
      }
    }
  } else if (product_type === "live_ticket") {
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

    const { data: existingTicket } = await supabaseAdmin
      .from("live_stream_tickets")
      .select("id")
      .eq("user_id", customerId)
      .eq("live_stream_id", product_id)
      .eq("status", "completed")
      .maybeSingle();

    if (existingTicket) {
      await supabaseAdmin
        .from("transactions")
        .update({ related_ticket_id: existingTicket.id })
        .eq("id", transactionId);
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
        .select("id")
        .single();
      if (error) throw error;
      if (ticketRow) {
        await supabaseAdmin
          .from("transactions")
          .update({ related_ticket_id: ticketRow.id })
          .eq("id", transactionId);
      }
    }
  } else if (product_type === "video-call-request") {
    const callId = (session.metadata ?? {}).call_id || product_id;
    if (!callId) throw new Error("call_id ausente em video-call-request metadata");

    const { data: callCheck, error: callCheckErr } = await supabaseAdmin
      .from("one_on_one_calls")
      .select("id, creator_id, user_id, status")
      .eq("id", callId)
      .maybeSingle();

    if (callCheckErr || !callCheck) {
      throw new Error(`Call ${callId} não encontrada para video-call-request`);
    }
    if (metaCreatorId && callCheck.creator_id !== metaCreatorId) {
      throw new Error(`creator_id ${metaCreatorId} não bate com a call ${callId}`);
    }
    if (callCheck.user_id !== customerId) {
      throw new Error(`customerId ${customerId} não bate com a call ${callId}`);
    }

    if (callCheck.status === "paid" || callCheck.status === "confirmed") {
      await supabaseAdmin
        .from("transactions")
        .update({ related_call_id: callId })
        .eq("id", transactionId);
    } else {
      const { error: markErr } = await supabaseAdmin.rpc("fn_mark_call_paid", {
        p_call_id: callId,
        p_transaction_id: transactionId,
        p_platform_fee: platformFee,
        p_creator_share: creatorShare,
      });
      if (markErr) throw new Error(`Erro ao marcar call ${callId} como paga: ${markErr.message}`);
      await supabaseAdmin
        .from("transactions")
        .update({ related_call_id: callId })
        .eq("id", transactionId);
    }
  } else {
    console.warn("[pix] product_type não suportado via Pix:", product_type);
  }

  // Notificações (best-effort).
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

async function notifyCreatorOfSale(
  creatorId: string | undefined,
  buyerId: string,
  productType: string,
  productId: string,
  amount: number,
  currency: string,
) {
  if (!creatorId) return;
  try {
    const { data: buyer } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", buyerId)
      .single();
    const buyerName = (buyer as { full_name?: string } | null)?.full_name || "Um cliente";
    const formattedAmount = `${currency} ${amount.toFixed(2).replace(".", ",")}`;

    let title: string;
    let message: string;
    switch (productType) {
      case "pack": {
        const { data: pack } = await supabaseAdmin.from("packs").select("title").eq("id", productId).single();
        title = "Nova venda de pacote!";
        message = `${buyerName} comprou o pacote "${(pack as { title?: string } | null)?.title || "Sem título"}" por ${formattedAmount}.`;
        break;
      }
      case "live_ticket": {
        const { data: live } = await supabaseAdmin.from("live_streams").select("title").eq("id", productId).single();
        title = "Novo ingresso vendido!";
        message = `${buyerName} comprou ingresso para "${(live as { title?: string } | null)?.title || "Live"}" por ${formattedAmount}.`;
        break;
      }
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
      type: "success",
      is_read: false,
      data: { product_type: productType, product_id: productId, buyer_id: buyerId, amount, currency },
    });
  } catch (err) {
    console.error("[pix] Erro ao notificar creator:", err);
  }
}

async function notifyBuyerOfPurchase(
  buyerId: string | undefined,
  creatorId: string | undefined,
  productType: string,
  productId: string,
  amount: number,
  currency: string,
) {
  if (!buyerId) return;
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
        const { data: pack } = await supabaseAdmin.from("packs").select("title").eq("id", productId).single();
        title = "Compra confirmada!";
        message = `Você comprou o pacote "${(pack as { title?: string } | null)?.title || "conteúdo"}" de ${creatorName} por ${formattedAmount}. Já está disponível na aba Comprados.`;
        break;
      }
      case "live_ticket": {
        const { data: live } = await supabaseAdmin.from("live_streams").select("title").eq("id", productId).single();
        title = "Ingresso confirmado!";
        message = `Você comprou o ingresso para "${(live as { title?: string } | null)?.title || "Live"}" de ${creatorName} por ${formattedAmount}.`;
        break;
      }
      case "video-call-request":
        title = "Videochamada confirmada!";
        message = `Sua videochamada com ${creatorName} foi paga (${formattedAmount}). Já pode entrar na sala.`;
        break;
      default:
        title = "Compra confirmada!";
        message = `Sua compra de ${formattedAmount} foi confirmada.`;
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: buyerId,
      title,
      message,
      type: "success",
      is_read: false,
      data: { product_type: productType, product_id: productId, creator_id: creatorId, amount, currency },
    });
  } catch (err) {
    console.error("[pix] Erro ao notificar comprador:", err);
  }
}
