import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Generates a ZegoCloud Token04 using HMAC-SHA256.
 * This is the server-side equivalent of the token generation
 * that was previously exposed on the client via generateKitTokenForTest.
 */
async function generateToken04(
  appId: number,
  serverSecret: string,
  userId: string,
  effectiveTimeInSeconds = 7200
) {
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

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(serverSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  const signatureBytes = new Uint8Array(signature);

  const tokenInfo = new Uint8Array(
    12 + 2 + signatureBytes.length + 2 + payload.length
  );
  const dv = new DataView(tokenInfo.buffer);
  dv.setBigInt64(0, BigInt(expireTime), false);
  dv.setInt16(8, signatureBytes.length, false);
  tokenInfo.set(signatureBytes, 12);
  dv.setInt16(12 + signatureBytes.length, payload.length, false);
  tokenInfo.set(
    new TextEncoder().encode(payload),
    12 + signatureBytes.length + 2
  );

  const base64Token = btoa(String.fromCharCode(...tokenInfo));
  return `04${base64Token}`;
}

/**
 * Wraps a Token04 into a Kit Token that ZegoUIKitPrebuilt.create() accepts.
 */
function buildKitToken(
  token04: string,
  appId: number,
  roomID: string,
  userID: string,
  userName: string
): string {
  const kitToken = {
    ver: 1,
    token: token04,
    app_id: appId,
    user_id: userID,
    user_name: userName,
    room_id: roomID,
  };
  return btoa(JSON.stringify(kitToken));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Token ausente");

    const token = authHeader.replace("Bearer ", "");
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("JWT_SECRET não configurado");

    const key = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });

    const authenticatedUserId = payload?.sub;
    if (!authenticatedUserId)
      throw new Error("ID do usuário não encontrado no token");

    // 2. Parse request body
    const { roomID, userID, userName } = await req.json();
    if (!roomID || !userID) throw new Error("roomID e userID são obrigatórios");

    // 3. Verify the authenticated user matches the requested userID
    if (authenticatedUserId !== userID) {
      throw new Error("Não autorizado: userID não corresponde ao token");
    }

    // 4. Get ZegoCloud credentials from server env (NEVER exposed to client)
    const appId = Number(Deno.env.get("ZEGOCLOUD_APP_ID"));
    const serverSecret = Deno.env.get("ZEGOCLOUD_SERVER_SECRET");
    if (!appId || !serverSecret) {
      throw new Error("Credenciais do ZegoCloud não configuradas no servidor");
    }

    // 5. Generate Token04 and wrap into Kit Token
    const token04 = await generateToken04(appId, serverSecret, userID);
    const kitToken = buildKitToken(
      token04,
      appId,
      roomID,
      userID,
      userName || "User"
    );

    // 6. Return the Kit Token
    return new Response(JSON.stringify({ success: true, token: kitToken }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
