import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Comissão da plataforma (15%)
const APPLICATION_FEE_PERCENTAGE = 0.15;

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

    // Para tipos que NÃO são video-call, stripe_price_id continua obrigatório
    if (product_type !== "video-call" && !stripe_price_id) {
      throw new Error(
        "stripe_price_id é obrigatório para product_type diferente de 'video-call'.",
      );
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
          success_url =
            "https://live-canvas-vue.lovable.app/live?room=" +
            product_id +
            "&mode=viewer&userName=" +
            (payload as any).user_metadata?.display_name +
            "&userID=" +
            payload.sub;
          break;
        case "video-call":
        case "pack":
          success_url = "https://njob-client-teaxua.flutterflow.app/compras";
          break;
        default:
          success_url = "https://njob-client-teaxua.flutterflow.app/";
          break;
      }
    }

    cancel_url = custom_cancel_url || "https://njob-client-teaxua.flutterflow.app/";

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
