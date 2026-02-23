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

  const signUp = async (email: string, password: string, fullName: string, dateBirth?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) throw error
    setGuest(false)

    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        full_name: fullName,
        role: 'consumer',
        is_active: true,
        ...(dateBirth ? { date_birth: dateBirth } : {}),
      })
      if (profileError) console.warn('Profile insert failed (trigger may handle it):', profileError)
    }
  }

  const signOut = () => {
    // Clear local state immediately (don't wait for Supabase)
    clear()
    // Fire-and-forget: tell Supabase to invalidate the session
    supabase.auth.signOut().catch(() => {})
  }

  const sendPasswordResetOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    if (error) throw error
  }

  const verifyOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
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
    sendPasswordResetOtp,
    verifyOtp,
    updatePassword,
  }
}
