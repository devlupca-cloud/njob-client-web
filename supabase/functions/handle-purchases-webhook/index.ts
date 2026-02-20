// ✅ Imports alinhados ao Deno 2.x (evita runMicrotasks)
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

// 🔐 Segredo deste webhook (endpoint da plataforma com “Listen to events on connected accounts”)
const webhookSecret = Deno.env.get("STRIPE_PURCHASES_WEBHOOK_SECRET");

// 🔁 (crie uma vez no banco)
// create table if not exists processed_webhook_events (
//   id text primary key,
//   created_at timestamptz default now()
// );

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();

  if (!signature || !webhookSecret) {
    return new Response("Webhook secret or signature missing.", {
      status: 400,
    });
  }

  try {
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );

    // ✅ Idempotência por event.id (evita duplicatas em reentrega/concorrência)
    const { error: idemErr } = await supabaseAdmin
      .from("processed_webhook_events")
      .insert({ id: event.id });

    if (idemErr) {
      // Já processado — confirme 200 para o Stripe parar de reenviar
      return new Response(
        JSON.stringify({ received: true, duplicate: true }),
        { status: 200 },
      );
    }

    // Conta conectada que gerou o evento (precisa estar habilitado no endpoint)
    const connectedAccountId = event.account;
    if (!connectedAccountId) {
      console.warn(
        "Webhook sem event.account — verifique se o endpoint ouve contas conectadas.",
      );
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session: any = event.data.object;

        // Somente compras one-shot pagas
        if (session.mode === "payment" && session.payment_status === "paid") {
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

          // 🔎 Em direct charge, o PI vive NA CONTA CONECTADA
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
            stripeAccount: connectedAccountId,
          });

          // Comissão da plataforma (definida no checkout) — em cents:
          const platformFeeInCents = pi.application_fee_amount ?? 0;
          const platformFee = platformFeeInCents / 100;
          const creatorShare = amount - platformFee; // não desconta taxas do Stripe

          // ✅ UPSERT por gateway_transaction_id (previne 23505)
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

          // Registro específico da compra
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
            // 📞 Criar registro em one_on_one_calls
            if (!product_id) {
              throw new Error(
                "product_id (slot_id) ausente em video-call metadata",
              );
            }

            // Buscar slot + dia + creator a partir de creator_availability_slots
            const { data: slotRow, error: slotErr } = await supabaseAdmin
              .from("creator_availability_slots")
              .select(
                `
                id,
                slot_time,
                availability:creator_availability!inner (
                  id,
                  availability_date,
                  creator_id
                )
              `,
              )
              .eq("id", product_id)
              .single();

            if (slotErr || !slotRow) {
              throw new Error(
                `Slot de disponibilidade não encontrado para id=${product_id}`,
              );
            }

            const slotId = slotRow.id;
            const slotTime: string = slotRow.slot_time; // "HH:MM:SS"
            const availabilityDate: string =
              slotRow.availability.availability_date; // "YYYY-MM-DD"
            const availabilityCreatorId: string =
              slotRow.availability.creator_id;

            // (Opcional) sanity check com metadata
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

            // Monta timestamp "YYYY-MM-DDTHH:MM:SS"
            const scheduledStartTime = `${availabilityDate}T${slotTime}`;

            const { error: callErr } = await supabaseAdmin
              .from("one_on_one_calls")
              .insert({
                user_id: customerId,
                creator_id: availabilityCreatorId,
                availability_slot_id: slotId,
                scheduled_start_time: scheduledStartTime,
                scheduled_duration_minutes: durationMinutes,
                // Opcional: deixar end_time nulo ou calcular depois
                call_price: amount,
                currency,
                status: "confirmed", // já foi pago
                transaction_id: transactionId,
                platform_fee: platformFee,
                creator_share: creatorShare,
              });

              const { error: callErr2 } = await supabaseAdmin
              .from("creator_availability_slots")
              .update({
                purchased: true,
              });

            if (callErr || callErr2) {
              throw new Error(
                `Erro ao criar registro de video-call: ${callErr.message}`,
              );
            }
          }
        }

        break;
      }

      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
    });
  } catch (error: any) {
    console.error("Erro no webhook de compras:", error?.message ?? error);

    // Fallback elegante para duplicata extrema
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
      {
        status: 400,
      },
    );
  }
});
