import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1?target=deno";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Comissão da plataforma (15%)
const APPLICATION_FEE_PERCENTAGE = 0.15;

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-12-18.acacia",
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
    // 1) AUTENTICAÇÃO
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Token ausente");

    const token = authHeader.replace("Bearer ", "");
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("JWT_SECRET não configurado");

    const key = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });

    const customerId = payload?.sub as string | undefined;
    if (!customerId) throw new Error("ID do cliente não encontrado no token");

    // 2) BODY
    const body = await req.json();
    const {
      creator_id,
      stripe_price_id,
      product_id,
      product_type,
      duration, // opcional: 30 ou 60 (min)
      success_url: custom_success_url,
      cancel_url: custom_cancel_url,
    } = body as {
      creator_id?: string;
      stripe_price_id?: string;
      product_id?: string;
      product_type?: string;
      duration?: number;
      success_url?: string;
      cancel_url?: string;
    };

    if (!creator_id || !product_id || !product_type) {
      throw new Error(
        "creator_id, product_id e product_type são obrigatórios.",
      );
    }

    // stripe_price_id é obrigatório exceto para video-call e pack (criado on-the-fly)
    if (product_type !== "video-call" && product_type !== "pack" && !stripe_price_id) {
      throw new Error(
        "stripe_price_id é obrigatório para product_type diferente de 'video-call' e 'pack'.",
      );
    }

    // 2.1) VALIDAÇÕES DE VIDEO-CALL: slot já comprado + conflito com live
    if (product_type === "video-call") {
      if (!product_id) {
        throw new Error("product_id (slot_id) é obrigatório para video-call.");
      }

      // Buscar dados do slot
      const { data: slotRow, error: slotErr } = await supabaseAdmin
        .from("creator_availability_slots")
        .select(`
          id,
          slot_time,
          purchased,
          availability_id,
          availability:creator_availability!inner (
            id,
            availability_date,
            creator_id
          )
        `)
        .eq("id", product_id)
        .single();

      if (slotErr || !slotRow) {
        throw new Error("Slot de disponibilidade não encontrado.");
      }

      // Verificar se já foi comprado (race condition)
      if (slotRow.purchased) {
        throw new Error("Este horário já foi reservado por outro cliente.");
      }

      // Se duração é 60 min, verificar que o próximo slot de 30 min existe e está livre
      if (duration === 60) {
        const [hh, mm] = String(slotRow.slot_time).slice(0, 5).split(":").map(Number);
        const nextMin = hh * 60 + mm + 30;
        const nextH = String(Math.floor(nextMin / 60) % 24).padStart(2, "0");
        const nextM = String(nextMin % 60).padStart(2, "0");
        const nextTime = `${nextH}:${nextM}`;

        const availId = (slotRow as any).availability_id;
        const { data: nextSlot, error: nextErr } = await supabaseAdmin
          .from("creator_availability_slots")
          .select("id, purchased")
          .eq("availability_id", availId)
          .like("slot_time", `${nextTime}%`)
          .maybeSingle();

        if (nextErr || !nextSlot) {
          throw new Error(
            `Horário seguinte (${nextTime}) não disponível para chamada de 60 min.`,
          );
        }
        if (nextSlot.purchased) {
          throw new Error(
            `Horário seguinte (${nextTime}) já reservado. Não é possível agendar 60 min.`,
          );
        }
      }

      // Verificar conflito com lives existentes
      const slotDate = (slotRow as any).availability.availability_date;
      const slotTime = slotRow.slot_time;
      const callDuration = duration === 60 ? 60 : 30;

      // Build UTC timestamps from local BRT date (UTC-3) for correct queries
      const dayStartUTC = new Date(`${slotDate}T00:00:00-03:00`).toISOString();
      const dayEndUTC = new Date(`${slotDate}T23:59:59-03:00`).toISOString();

      const { data: lives } = await supabaseAdmin
        .from("live_streams")
        .select("scheduled_start_time, estimated_duration_minutes")
        .eq("creator_id", (slotRow as any).availability.creator_id)
        .in("status", ["scheduled", "live"])
        .gte("scheduled_start_time", dayStartUTC)
        .lte("scheduled_start_time", dayEndUTC);

      const slotTimePart = String(slotTime).slice(0, 8);
      const callStart = new Date(`${slotDate}T${slotTimePart}-03:00`).getTime();
      const callEnd = callStart + callDuration * 60 * 1000;

      if (lives && lives.length > 0) {
        for (const live of lives) {
          const liveStart = new Date(live.scheduled_start_time).getTime();
          const liveEnd =
            liveStart + (live.estimated_duration_minutes ?? 60) * 60 * 1000;

          if (callStart < liveEnd && callEnd > liveStart) {
            throw new Error(
              "Não é possível agendar videochamada neste horário pois existe uma live programada.",
            );
          }
        }
      }

      // Verificar conflito com outras videochamadas confirmadas do mesmo criador
      const creatorId = (slotRow as any).availability.creator_id;
      const { data: existingCalls } = await supabaseAdmin
        .from("one_on_one_calls")
        .select("scheduled_start_time, scheduled_duration_minutes")
        .eq("creator_id", creatorId)
        .eq("status", "confirmed")
        .gte("scheduled_start_time", dayStartUTC)
        .lte("scheduled_start_time", dayEndUTC);

      if (existingCalls && existingCalls.length > 0) {
        for (const call of existingCalls) {
          const existingStart = new Date(call.scheduled_start_time).getTime();
          const existingEnd =
            existingStart + (call.scheduled_duration_minutes ?? 30) * 60 * 1000;

          if (callStart < existingEnd && callEnd > existingStart) {
            throw new Error(
              "Este horário já está reservado para outra videochamada.",
            );
          }
        }
      }
    }

    // 3) STRIPE ACCOUNT DO CRIADOR (conectada)
    const { data: payoutInfo, error: payoutError } = await supabaseAdmin
      .from("creator_payout_info")
      .select("account_details")
      .eq("creator_id", creator_id)
      .single();

    if (payoutError || !payoutInfo) {
      throw new Error("Configuração de pagamento do criador não encontrada.");
    }

    const stripeAccountId = payoutInfo.account_details?.stripe_account_id;
    if (!stripeAccountId) {
      throw new Error("ID da conta Stripe do criador não encontrado.");
    }

    // 4) DEFINIR PREÇO E LINE_ITEMS
    let priceInCents: number;
    let lineItems: any[] = [];

    if (product_type === "video-call") {
      // Busca valores em profile_settings
      const { data: profileSettings, error: settingsError } = await supabaseAdmin
        .from("profile_settings")
        .select("call_per_30_min, call_per_1_hr")
        .eq("profile_id", creator_id)
        .single();

      if (settingsError || !profileSettings) {
        throw new Error(
          "Configurações de preço de video call não encontradas para o criador.",
        );
      }

      const durationMinutes = duration === 60 ? 60 : 30;

      const basePrice =
        durationMinutes === 60
          ? profileSettings.call_per_1_hr
          : profileSettings.call_per_30_min;

      if (!basePrice || Number(basePrice) <= 0) {
        throw new Error(
          "Valor de video call não configurado corretamente para o criador.",
        );
      }

      priceInCents = Math.round(Number(basePrice) * 100);

      const durationLabel =
        durationMinutes === 60 ? "Vídeo-chamada 1h" : "Vídeo-chamada 30min";

      lineItems = [
        {
          price_data: {
            currency: "brl", // moeda da cobrança
            unit_amount: priceInCents,
            product_data: {
              name: durationLabel,
            },
          },
          quantity: 1,
        },
      ];
    } else if (product_type === "pack" && !stripe_price_id) {
      // Pack sem stripe_price_id — criar produto/preço no Stripe on-the-fly
      const { data: packRow, error: packErr } = await supabaseAdmin
        .from("packs")
        .select("title, price, cover_image_url")
        .eq("id", product_id)
        .single();

      if (packErr || !packRow) {
        throw new Error("Pack não encontrado no banco de dados.");
      }

      if (!packRow.price || Number(packRow.price) <= 0) {
        throw new Error("Pack com preço inválido.");
      }

      const product = await stripe.products.create(
        {
          name: packRow.title || "Pacote de conteúdo",
          images: packRow.cover_image_url ? [packRow.cover_image_url] : [],
          metadata: { supabase_pack_id: product_id, creator_id: creator_id },
        },
        { stripeAccount: stripeAccountId },
      );

      const newPrice = await stripe.prices.create(
        {
          product: product.id,
          unit_amount: Math.round(Number(packRow.price) * 100),
          currency: "brl",
        },
        { stripeAccount: stripeAccountId },
      );

      // Atualizar pack no banco para futuras compras
      await supabaseAdmin
        .from("packs")
        .update({
          stripe_product_id: product.id,
          stripe_price_id: newPrice.id,
        })
        .eq("id", product_id);

      priceInCents = newPrice.unit_amount!;
      lineItems = [{ price: newPrice.id, quantity: 1 }];
    } else {
      // Fluxo original: usa price já criado no Stripe
      const priceObject = await stripe.prices.retrieve(stripe_price_id!, {
        stripeAccount: stripeAccountId,
      });

      priceInCents = priceObject.unit_amount!;
      if (priceInCents == null) {
        throw new Error("Preço do produto não encontrado.");
      }

      lineItems = [
        {
          price: stripe_price_id,
          quantity: 1,
        },
      ];
    }

    // 5) CALCULAR FEE EM CIMA DO PREÇO DEFINIDO
    const feeInCents = Math.round(
      priceInCents * APPLICATION_FEE_PERCENTAGE,
    );

    // 6) DEFINIR SUCCESS_URL E CANCEL_URL
    // Usa URLs customizadas do caller se fornecidas, senão fallback padrão
    let success_url: string;
    let cancel_url: string;

    if (custom_success_url) {
      success_url = custom_success_url;
    } else {
      // Fallback: URLs originais do FlutterFlow
      switch (product_type) {
        case "live":
        case "live_ticket":
          success_url = "https://njob-client-web.vercel.app/lives/" + product_id;
          break;
        case "video-call":
        case "pack":
          success_url = "https://njob-client-web.vercel.app/purchases";
          break;
        default:
          success_url = "https://njob-client-web.vercel.app/";
          break;
      }
    }

    cancel_url = custom_cancel_url || "https://njob-client-web.vercel.app/";

    // 7) CRIAR CHECKOUT COMO DIRECT CHARGE NA CONTA CONECTADA
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card", "boleto"],
        line_items: lineItems,
        success_url,
        cancel_url,
        client_reference_id: customerId,
        metadata: {
          product_id,
          product_type,
          creator_id,
          ...(product_type === "video-call"
            ? { duration: duration ?? 30 }
            : {}),
        },
        payment_intent_data: {
          application_fee_amount: feeInCents,
        },
      },
      {
        stripeAccount: stripeAccountId,
      },
    );

    // 8) RETORNO
    return new Response(
      JSON.stringify({
        success: true,
        checkoutUrl: session.url,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 200,
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message ?? "unknown",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
