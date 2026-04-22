import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export function useAuth() {
  const { session, user, profile, isLoading, isGuest, setGuest, clear } =
    useAuthStore()

  // Auth initialization is handled by AuthProvider.
  // This hook only exposes state + auth methods.

  const enterAsGuest = () => setGuest(true)

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    setGuest(false)
  }

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    dateBirth?: string,
    legal?: { version: string; acceptedAt: string },
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) throw error
    setGuest(false)

    // Profile is auto-created by on_auth_user_created trigger.
    // Update extra fields (date_birth, legal acceptance) that the trigger doesn't handle.
    if (data.user) {
      const updates: Record<string, unknown> = {}
      if (dateBirth) updates.date_birth = dateBirth
      if (legal) {
        updates.terms_accepted_at = legal.acceptedAt
        updates.terms_version = legal.version
        updates.privacy_accepted_at = legal.acceptedAt
        updates.privacy_version = legal.version
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('profiles').update(updates).eq('id', data.user.id)
      }
    }
  }

  const signOut = () => {
    // Clear local state immediately (don't wait for Supabase)
    clear()
    // Fire-and-forget: tell Supabase to invalidate the session
    supabase.auth.signOut().catch(() => {})
  }

  const sendPasswordResetEmail = async (email: string) => {
    const redirectTo = `${window.location.origin}/new-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })
    if (error) throw error
  }

  const updatePassword = async (currentPassword: string, newPassword: string) => {
    // Re-authenticate with current password to verify identity
    const email = user?.email
    if (!email) throw new Error('Usuário não encontrado')

    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })
    if (reAuthError) throw new Error('Senha atual incorreta')

    // Now update to the new password
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  }

  return {
    session,
    user,
    profile,
    isLoading,
    isGuest,
    isAuthenticated: !!session,
    enterAsGuest,
    signIn,
    signUp,
    signOut,
    sendPasswordResetEmail,
    updatePassword,
  }
}
