import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt'
import { supabase } from './supabase'

/**
 * Generates a ZegoCloud Kit Token via server-side Edge Function.
 * The serverSecret NEVER leaves the server — only the final token is returned.
 */
export async function generateToken(
  roomID: string,
  userID: string,
  userName: string
): Promise<string> {
  const { data, error } = await supabase.functions.invoke(
    'generate-zego-token',
    { body: { roomID, userID, userName } }
  )

  if (error || !data?.token) {
    throw new Error(
      `Falha ao gerar token de vídeo: ${error?.message ?? 'resposta inválida'}`
    )
  }

  return data.token
}

export { ZegoUIKitPrebuilt }
