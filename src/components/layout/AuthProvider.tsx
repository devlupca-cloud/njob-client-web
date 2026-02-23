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
 * Resolves auth on mount. Uses getSession() with a race timeout to avoid hangs.
 * Listens for subsequent auth changes via onAuthStateChange.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        // Race getSession against a 3s timeout to avoid Web Locks hang
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ])

        if (!mounted) return

        const session = result?.data?.session ?? null
        useAuthStore.getState().setSession(session)

        // Fetch profile in background — don't block loading state
        if (session?.user) {
          fetchProfile(session.user.id)
            .then((profile) => {
              if (mounted) useAuthStore.getState().setProfile(profile)
            })
            .catch(() => {})
        }
      } catch (err) {
        console.error('Auth init error:', err)
      } finally {
        useAuthStore.getState().setLoading(false)
      }
    }

    init()

    // Listen for subsequent auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'INITIAL_SESSION') return

        const store = useAuthStore.getState()
        store.setSession(session)

        if (session?.user) {
          try {
            const profile = await fetchProfile(session.user.id)
            if (mounted) useAuthStore.getState().setProfile(profile)
          } catch {}
        } else if (event === 'SIGNED_OUT') {
          store.clear()
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return <>{children}</>
}
