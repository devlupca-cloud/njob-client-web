import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
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
        await new Promise((r) => setTimeout(r, 500 * attempt)) // 500ms, 1s, 1.5s
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
            if (mounted) useAuthStore.getState().setProfile(profile)
          }

          if (mounted) store.setLoading(false)
          return
        }

        // ─── SIGNED_OUT ────────────────────────────────────────────
        if (event === 'SIGNED_OUT') {
          store.clear()
          queryClient.clear()
          return
        }

        // ─── SIGNED_IN ─────────────────────────────────────────────
        // User just logged in — invalidate all stale guest/previous cache
        if (event === 'SIGNED_IN') {
          store.setSession(session)

          if (session?.user) {
            const profile = await fetchProfileWithRetry(session.user.id)
            if (mounted) useAuthStore.getState().setProfile(profile)
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
          queryClient.invalidateQueries()
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
    }, 5000)

    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [queryClient])

  return <>{children}</>
}
