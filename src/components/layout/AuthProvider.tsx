import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Profile } from '@/types'

/**
 * Listens for auth state changes (login, logout, token refresh).
 * Initial session is loaded in main.tsx before React renders.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const store = useAuthStore.getState()
        store.setSession(session)
        if (session?.user) {
          try {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()
            useAuthStore.getState().setProfile(data as Profile | null)
          } catch {}
        } else {
          store.clear()
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return <>{children}</>
}
