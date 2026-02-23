// supabase/functions/creator-withdraw/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1?target=deno";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ⚙️ Configuração do cooldown (minutos). Default: 30
const COOLDOWN_MINUTES = Number(Deno.env.get("WITHDRAW_COOLDOWN_MINUTES") ?? "30");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // 1) Auth (criador)
    const auth = req.headers.get("Authorization");
    if (!auth) throw new Error("Token ausente");
    const token = auth.replace("Bearer ", "");
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(Deno.env.get("JWT_SECRET")!),
      { algorithms: ["HS256"] },
    );
    const creatorId = payload?.sub as string | undefined;
    if (!creatorId) throw new Error("creatorId inválido no token");

    // 2) Body (idempotency_key OBRIGATÓRIO)
    const { amount, withdraw_all = false, currency = "BRL", idempotency_key } = await req.json();
    if (!idempotency_key || typeof idempotency_key !== "string" || idempotency_key.length < 8) {
      return new Response(JSON.stringify({ ok: false, error: "idempotency_key é obrigatório" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 3) stripe_account_id do criador
    const { data: info, error: infoErr } = await supabase
      .from("creator_payout_info")
      .select("account_details")
      .eq("creator_id", creatorId)
      .single();
    if (infoErr || !info) throw new Error("creator_payout_info não encontrado");
    const stripeAccountId = info.account_details?.stripe_account_id as string | undefined;
    if (!stripeAccountId) throw new Error("stripe_account_id ausente");

    // 4) ⚠️ Cooldown: bloqueia se já houver payout recente pending/in_transit
    const now = Date.now();
    const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;
    const sinceIso = new Date(now - cooldownMs).toISOString();

    const { data: recentPayouts, error: rpErr } = await supabase
      .from("payouts")
      .select("id, status, created_at, transaction_reference, amount, currency")
      .eq("creator_id", creatorId)
      .in("status", ["pending", "in_transit"])
      .gt("created_at", sinceIso)
      .limit(1);

    if (rpErr) throw new Error(`Erro ao checar cooldown: ${rpErr.message}`);

    if (recentPayouts && recentPayouts.length > 0) {
      const last = recentPayouts[0];
      const createdAt = new Date(last.created_at).getTime();
      const remainingMs = Math.max(0, createdAt + cooldownMs - now);
      const remainingMin = Math.ceil(remainingMs / 60000);

      return new Response(JSON.stringify({
        ok: false,
        error: "Existe um saque recente em processamento.",
        cooldown_minutes_remaining: remainingMin,
        last_payout: {
          id: last.id,
          status: last.status,
          transaction_reference: last.transaction_reference,
          amount: last.amount,
          currency: last.currency,
          created_at: last.created_at,
        },
      }), { status: 409, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // 5) Checa payouts + saldo
    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (!account.payouts_enabled) throw new Error("Payouts desabilitado para esta conta");

    const bal = await stripe.balance.retrieve({ stripeAccount: stripeAccountId });
    const wantedCurrency = String(currency).toLowerCase(); // "brl"
    const available = (bal.available || []).find(b => b.currency === wantedCurrency)?.amount ?? 0;

    if (withdraw_all) {
      if (available <= 0) throw new Error("Saldo indisponível para saque");
    } else {
      if (typeof amount !== "number" || amount <= 0) throw new Error("amount inválido");
      if (Math.round(amount * 100) > available) throw new Error("Valor solicitado excede o saldo disponível");
    }
    const payoutAmountCents = withdraw_all ? available : Math.round(amount * 100);

    // 6) Idempotência no BANCO: reserva a operação antes de chamar o Stripe
    const reservePayload = {
      creator_id: creatorId,
      amount: payoutAmountCents / 100,
      currency: String(currency).toUpperCase(),
      status: "pending",
      idempotency_key,
      notes: null as string | null,
    };

    let payoutRow: any = null;

    const { data: insertedRows, error: reserveErr } = await supabase
      .from("payouts")
      .insert(reservePayload)
      .select("id, transaction_reference, status, amount, currency, created_at")
      .limit(1);

    if (reserveErr) {
      if (String(reserveErr.message).includes("duplicate key value") || String(reserveErr.message).includes("23505")) {
        const { data: existing, error: fetchErr } = await supabase
          .from("payouts")
          .select("id, transaction_reference, status, amount, currency, created_at")
          .eq("idempotency_key", idempotency_key)
          .limit(1);
        if (fetchErr) throw new Error(`Erro ao buscar reserva existente: ${fetchErr.message}`);

        const row = existing?.[0];
        if (row?.transaction_reference) {
          return new Response(JSON.stringify({
            ok: true,
            payout_id: row.transaction_reference,
            status: row.status,
            amount: row.amount,
            currency: row.currency,
            created_at: row.created_at,
            deduped: true,
          }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({
          ok: true,
          status: row?.status ?? "pending",
          processing: true,
          deduped: true,
        }), { status: 202, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      throw new Error(`Erro ao reservar saque: ${reserveErr.message}`);
    }

    payoutRow = insertedRows?.[0];

    // 7) Cria payout no Stripe com a MESMA idempotency_key
    let payout;
    try {
      payout = await stripe.payouts.create(
        { amount: payoutAmountCents, currency: wantedCurrency, method: "standard" },
        { stripeAccount: stripeAccountId, idempotencyKey: idempotency_key },
      );
    } catch (stripeErr: any) {
      await supabase
        .from("payouts")
        .update({
          status: "failed",
          notes: `stripe_error=${stripeErr?.message ?? String(stripeErr)}`,
        })
        .eq("id", payoutRow.id);
      throw stripeErr;
    }

    // 8) Atualiza a linha com o resultado do Stripe
    const processedAt = payout.arrival_date
      ? new Date(payout.arrival_date * 1000).toISOString()
      : null;

    const { error: updErr } = await supabase
      .from("payouts")
      .update({
        transaction_reference: payout.id,  // po_...
        status: payout.status ?? "pending",
        processed_at: processedAt,
      })
      .eq("id", payoutRow.id);

    if (updErr) throw new Error(`Erro ao atualizar payout: ${updErr.message}`);

    return new Response(JSON.stringify({
      ok: true,
      payout_id: payout.id,
      status: payout.status,
      arrival_date: payout.arrival_date ?? null,
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? "unknown" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
