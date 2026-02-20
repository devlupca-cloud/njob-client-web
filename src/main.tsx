import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { router } from './router'
import { ToastProvider } from '@/components/ui/Toast'
import AuthProvider from '@/components/layout/AuthProvider'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Profile } from '@/types'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

// Initialize auth BEFORE React renders (avoids StrictMode double-mount issues)
async function initAuth() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const store = useAuthStore.getState()
    store.setSession(session)
    if (session?.user) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      useAuthStore.getState().setProfile(data as Profile | null)
    }
  } catch (err) {
    console.error('Auth init error:', err)
  }
}

initAuth().finally(() => {
  useAuthStore.getState().setLoading(false)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
})
