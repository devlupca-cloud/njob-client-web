import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/Toast'
import type { Profile } from '@/types'

/**
 * Busca o perfil com retry automático (até 3 tentativas).
 * Cobre falhas de rede transitórias e cold-start do Supabase.
 */
async function fetchProfileWithRetry(userId: string, retries = 3): Promise<Profile | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error
      return data as Profile | null
    } catch (err) {
      console.warn(`[AuthProvider] fetchProfile attempt ${attempt}/${retries} failed:`, err)
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt)) // 1s, 2s, 3s
      }
    }
  }
  return null
}

/**
 * Resolves auth on mount using onAuthStateChange (INITIAL_SESSION event).
 * Guarantees that both session AND profile are fully loaded before
 * setting isLoading=false (which unblocks AuthGuard → page rendering).
 *
 * Also handles TOKEN_REFRESHED to keep queries fresh and invalidates
 * cache on SIGNED_IN to prevent stale data from previous sessions.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  useEffect(() => {
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        const store = useAuthStore.getState()

        // ─── INITIAL_SESSION ───────────────────────────────────────
        // First auth resolution after page load.
        // MUST await profile before setLoading(false).
        if (event === 'INITIAL_SESSION') {
          store.setSession(session)

          if (session?.user) {
            const profile = await fetchProfileWithRetry(session.user.id)
            if (mounted) {
              useAuthStore.getState().setProfile(profile)
              if (!profile) {
                useAuthStore.getState().setProfileError(true)
                toast({ title: 'Não foi possível carregar seu perfil. Tente recarregar a página.', type: 'error' })
              }
            }
          }

          if (mounted) store.setLoading(false)
          return
        }

        // ─── SIGNED_OUT ────────────────────────────────────────────
        if (event === 'SIGNED_OUT') {
          store.clear()
          store.setLoading(false)
          // Invalidar + remover cache antigo para refetch como guest
          queryClient.removeQueries()
          queryClient.invalidateQueries()
          return
        }

        // ─── SIGNED_IN ─────────────────────────────────────────────
        // Supabase fires SIGNED_IN both on real login AND on token refresh
        // when the tab regains focus. Only block the UI for a real user change.
        if (event === 'SIGNED_IN') {
          const isSameUser = store.user?.id === session?.user?.id
          store.setSession(session)

          if (session?.user && !isSameUser) {
            // Real login (different user) — block UI until profile is ready
            store.setLoading(true)
            const profile = await fetchProfileWithRetry(session.user.id)
            if (mounted) {
              useAuthStore.getState().setProfile(profile)
              if (!profile) {
                useAuthStore.getState().setProfileError(true)
                toast({ title: 'Não foi possível carregar seu perfil. Tente recarregar a página.', type: 'error' })
              }
              store.setLoading(false)
            }
          }

          // Invalidate ALL queries so pages refetch with new userId
          queryClient.invalidateQueries()
          return
        }

        // ─── TOKEN_REFRESHED ───────────────────────────────────────
        // Session token was refreshed — update session in store so
        // Supabase client uses the new token for subsequent requests.
        // Also invalidate queries to prevent stale auth errors.
        if (event === 'TOKEN_REFRESHED') {
          store.setSession(session)
          // Only refetch active queries in background — don't clear cache
          queryClient.invalidateQueries({ refetchType: 'active' })
          return
        }

        // ─── PASSWORD_RECOVERY ──────────────────────────────────────
        if (event === 'PASSWORD_RECOVERY') {
          store.setSession(session)
          if (session?.user) {
            const profile = await fetchProfileWithRetry(session.user.id, 1)
            if (mounted) useAuthStore.getState().setProfile(profile)
          }
          if (mounted) {
            store.setLoading(false)
            window.location.replace('/new-password')
          }
          return
        }

        // ─── Any other event (USER_UPDATED, etc.) ──────────────────
        store.setSession(session)

        if (session?.user) {
          try {
            const profile = await fetchProfileWithRetry(session.user.id, 1)
            if (mounted) useAuthStore.getState().setProfile(profile)
          } catch {
            // non-critical
          }
        }
      }
    )

    // Safety timeout: if INITIAL_SESSION never fires, unblock the UI.
    // This covers edge cases like Supabase SDK failing to initialize.
    const timeout = setTimeout(() => {
      const store = useAuthStore.getState()
      if (store.isLoading) {
        console.warn('[AuthProvider] INITIAL_SESSION timeout — forcing loading=false')
        store.setLoading(false)
      }
    }, 10000)

    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [queryClient, toast])

  return <>{children}</>
}
