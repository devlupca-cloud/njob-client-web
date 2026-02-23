import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Generates a ZegoCloud Token04 using AES-CBC encryption.
 * Matches the exact format from ZegoCloud's official SDK (generateKitTokenForTest).
 */
async function generateToken04(
  appId: number,
  serverSecret: string,
  userId: string,
  effectiveTimeInSeconds = 7200
) {
  const now = Math.floor(Date.now() / 1000);
  const expire = now + effectiveTimeInSeconds;

  // Payload must use exact field names the ZegoCloud server expects
  const payloadObject = {
    app_id: appId,
    user_id: userId,
    nonce: (2147483647 * Math.random()) | 0,
    ctime: now,
    expire: expire,
  };

  const payload = JSON.stringify(payloadObject);

  // Generate a 16-char random digit string as IV (matches SDK behaviour)
  let ivStr = Math.random().toString().substring(2, 18);
  if (ivStr.length < 16) ivStr += ivStr.substring(0, 16 - ivStr.length);
  const ivBytes = new TextEncoder().encode(ivStr); // 16 ASCII bytes

  // Import server secret as AES-CBC key
  const keyBytes = new TextEncoder().encode(serverSecret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );

  // AES-CBC encrypt (Web Crypto adds PKCS7 padding automatically)
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: ivBytes },
    key,
    new TextEncoder().encode(payload)
  );
  const encryptedBytes = new Uint8Array(encrypted);

  // Pack binary token — exact same layout as the official SDK:
  // [0,0,0,0](4) + expire_be32(4) + iv_len(2) + iv(16) + enc_len(2) + enc(N)
  const tokenInfo = new Uint8Array(28 + encryptedBytes.length);

  // Bytes 0-3: zero padding
  tokenInfo.set([0, 0, 0, 0], 0);

  // Bytes 4-7: expire as 32-bit big-endian
  const expBuf = new Uint8Array(new Int32Array([expire]).buffer).reverse();
  tokenInfo.set(expBuf, 4);

  // Bytes 8-9: IV length as 16-bit big-endian
  tokenInfo[8] = ivBytes.length >> 8;
  tokenInfo[9] = ivBytes.length & 0xff;

  // Bytes 10-25: IV (16 bytes)
  tokenInfo.set(ivBytes, 10);

  // Bytes 26-27: encrypted length as 16-bit big-endian
  tokenInfo[26] = encryptedBytes.length >> 8;
  tokenInfo[27] = encryptedBytes.length & 0xff;

  // Bytes 28+: encrypted data
  tokenInfo.set(encryptedBytes, 28);

  const base64Token = btoa(String.fromCharCode(...Array.from(tokenInfo)));
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
  const payload = {
    appID: appId,
    userID: userID,
    userName: encodeURIComponent(userName),
    roomID: roomID,
  };
  return token04 + "#" + btoa(JSON.stringify(payload));
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
