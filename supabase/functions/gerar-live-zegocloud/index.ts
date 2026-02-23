import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import { jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Função para gerar o token do ZegoCloud (adaptada da documentação para Deno)
async function generateZegoToken(appId: number, serverSecret: string, userId: string, effectiveTimeInSeconds: number = 3600) {
  const createTime = Math.floor(Date.now() / 1000);
  const expireTime = createTime + effectiveTimeInSeconds;
  const payloadObject = {
    app_id: appId,
    user_id: userId,
    nonce: crypto.getRandomValues(new Uint32Array(1))[0],
    create_time: createTime,
    expire_time: expireTime,
  };
  
  const payload = JSON.stringify(payloadObject);
  
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(serverSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const signatureBytes = new Uint8Array(signature);

  const tokenInfo = new Uint8Array(12 + 2 + signatureBytes.length + 2 + payload.length);
  const dv = new DataView(tokenInfo.buffer);
  dv.setBigInt64(0, BigInt(expireTime), false);
  dv.setInt16(8, signatureBytes.length, false);
  tokenInfo.set(signatureBytes, 12);
  dv.setInt16(12 + signatureBytes.length, payload.length, false);
  tokenInfo.set(new TextEncoder().encode(payload), 12 + signatureBytes.length + 2);

  const base64Token = btoa(String.fromCharCode(...tokenInfo));
  return `04${base64Token}`;
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. AUTENTICAR O CRIADOR
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Token ausente");
    
    const token = authHeader.replace("Bearer ", "");
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("JWT_SECRET não configurado");

    const key = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const creatorId = payload?.sub;
    if (!creatorId) throw new Error("ID do criador não encontrado no token");

    // 2. OBTER O ID DA LIVE E ATUALIZAR O STATUS
    const { liveID } = await req.json();
    if (!liveID) throw new Error("O ID da live é obrigatório.");

    const { error: updateError } = await supabaseAdmin
      .from('live_streams')
      .update({ 
        status: 'live',
        actual_start_time: new Date().toISOString() 
      })
      .eq('id', liveID)
      .eq('creator_id', creatorId); // Garante que apenas o dono da live a pode iniciar

    if (updateError) {
      throw new Error(`Erro ao atualizar o status da live: ${updateError.message}`);
    }
    
    // 3. OBTER AS CREDENCIAIS DO ZEGO CLOUD
    const appId = Deno.env.get("ZEGOCLOUD_APP_ID");
    const serverSecret = Deno.env.get("ZEGOCLOUD_SERVER_SECRET");
    if (!appId || !serverSecret) throw new Error("Credenciais do ZegoCloud não configuradas.");

    // 4. GERAR O TOKEN SEGURO
    const zegoToken = await generateZegoToken(parseInt(appId), serverSecret, creatorId);

    // 5. RETORNAR SUCESSO
    return new Response(JSON.stringify({ success: true, token: zegoToken }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

