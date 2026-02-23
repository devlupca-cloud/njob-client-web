import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import { jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1) Autenticacao
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Token ausente");

    const token = authHeader.replace("Bearer ", "");
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("JWT_SECRET nao configurado");

    const key = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });

    const userId = payload?.sub as string | undefined;
    if (!userId) throw new Error("ID do usuario nao encontrado no token");

    // 2) Body
    const body = await req.json().catch(() => ({}));
    const year = body.year || new Date().getFullYear();
    const month = body.month || new Date().getMonth() + 1;

    // Calcular intervalo do mes
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    // 3) Buscar receitas em paralelo
    const [packRes, ticketRes, callRes, payoutRes] = await Promise.all([
      // Receita de packs
      supabaseAdmin
        .from("pack_purchases")
        .select("purchase_price, creator_share, platform_fee, purchased_at")
        .eq("status", "completed")
        .gte("purchased_at", startDate)
        .lte("purchased_at", endDate)
        .in("pack_id", (
          await supabaseAdmin
            .from("packs")
            .select("id")
            .eq("profile_id", userId)
        ).data?.map((p: any) => p.id) ?? []),

      // Receita de lives
      supabaseAdmin
        .from("live_stream_tickets")
        .select("purchase_price, creator_share, platform_fee, purchased_at")
        .eq("status", "completed")
        .gte("purchased_at", startDate)
        .lte("purchased_at", endDate)
        .in("live_stream_id", (
          await supabaseAdmin
            .from("live_streams")
            .select("id")
            .eq("creator_id", userId)
        ).data?.map((l: any) => l.id) ?? []),

      // Receita de videochamadas
      supabaseAdmin
        .from("one_on_one_calls")
        .select("call_price, creator_share, platform_fee, created_at")
        .eq("creator_id", userId)
        .eq("status", "completed")
        .gte("created_at", startDate)
        .lte("created_at", endDate),

      // Payouts
      supabaseAdmin
        .from("payouts")
        .select("amount, status, requested_at, processed_at")
        .eq("creator_id", userId)
        .gte("requested_at", startDate)
        .lte("requested_at", endDate),
    ]);

    // 4) Calcular totais
    const packPurchases = packRes.data ?? [];
    const ticketPurchases = ticketRes.data ?? [];
    const callPurchases = callRes.data ?? [];
    const payouts = payoutRes.data ?? [];

    const contentRevenue = packPurchases.reduce((sum: number, p: any) => sum + Number(p.creator_share ?? 0), 0);
    const liveRevenue = ticketPurchases.reduce((sum: number, t: any) => sum + Number(t.creator_share ?? 0), 0);
    const callRevenue = callPurchases.reduce((sum: number, c: any) => sum + Number(c.creator_share ?? 0), 0);

    const completedPayouts = payouts
      .filter((p: any) => p.status === "completed")
      .reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);

    const pendingPayouts = payouts
      .filter((p: any) => p.status === "pending" || p.status === "processing")
      .reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);

    const totalRevenue = contentRevenue + liveRevenue + callRevenue;
    const availableForPayout = totalRevenue - completedPayouts - pendingPayouts;

    return new Response(
      JSON.stringify({
        year,
        month,
        revenue_breakdown: {
          content_revenue: contentRevenue,
          live_revenue: liveRevenue,
          call_revenue: callRevenue,
          subscription_revenue: 0,
        },
        total_revenue: totalRevenue,
        available_for_payout: Math.max(0, availableForPayout),
        future_payouts: pendingPayouts,
        completed_payouts: completedPayouts,
        transactions: {
          packs: packPurchases.length,
          lives: ticketPurchases.length,
          calls: callPurchases.length,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message ?? "unknown" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
