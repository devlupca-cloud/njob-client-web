import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import Stripe from "https://esm.sh/stripe@10.17.0";
import { jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*'
};
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient()
});
const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Token ausente");
    const token = authHeader.replace("Bearer ", "");
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("JWT_SECRET não configurado");
    const key = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, key, {
      algorithms: [
        "HS256"
      ]
    });
    const userId = payload?.sub;
    const userEmail = payload?.email;
    if (!userId || !userEmail) throw new Error("Dados do usuário inválidos no token");
    const { price_id, success_url: custom_success_url, cancel_url: custom_cancel_url } = await req.json();
    if (!price_id) throw new Error("price_id é obrigatório");
    const defaultUrl = 'https://njobs-app-yrhyht.flutterflow.app/splah';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: [
        'card'
      ],
      mode: 'subscription',
      customer_email: userEmail,
      line_items: [
        {
          price: price_id,
          quantity: 1
        }
      ],
      client_reference_id: userId,
      success_url: custom_success_url || defaultUrl,
      cancel_url: custom_cancel_url || defaultUrl
    });
    // --- ALTERAÇÃO AQUI ---
    // Agora retornamos a URL completa do checkout em vez do ID da sessão.
    return new Response(JSON.stringify({
      checkout_url: session.url
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
