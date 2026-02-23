import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Profile } from '@/types'

async function fetchProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data as Profile | null
}

/**
 * Resolves auth on mount using onAuthStateChange (INITIAL_SESSION event).
 * This avoids the getSession() + Web Locks anti-pattern that can cause
 * Supabase client hangs on subsequent API calls.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        const store = useAuthStore.getState()

        if (event === 'INITIAL_SESSION') {
          // First session resolution — set auth state and stop loading
          store.setSession(session)

          if (session?.user) {
            fetchProfile(session.user.id)
              .then((profile) => {
                if (mounted) useAuthStore.getState().setProfile(profile)
              })
              .catch(() => {})
          }

          store.setLoading(false)
          return
        }

        if (event === 'SIGNED_OUT') {
          store.clear()
          return
        }

        // TOKEN_REFRESHED, SIGNED_IN, etc.
        store.setSession(session)

        if (session?.user) {
          try {
            const profile = await fetchProfile(session.user.id)
            if (mounted) useAuthStore.getState().setProfile(profile)
          } catch {}
        }
      }
    )

    // Safety timeout: if INITIAL_SESSION never fires (edge case), stop loading
    const timeout = setTimeout(() => {
      const store = useAuthStore.getState()
      if (store.isLoading) {
        console.warn('[AuthProvider] INITIAL_SESSION timeout — forcing loading=false')
        store.setLoading(false)
      }
    }, 3000)

    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  return <>{children}</>
}
