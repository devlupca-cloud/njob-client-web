import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './lib/i18n'
import './index.css'
import { router } from './router'
import { ToastProvider } from '@/components/ui/Toast'
import AuthProvider from '@/components/layout/AuthProvider'
import { GlobalErrorBoundary } from '@/components/layout/ErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,            // 30s — data is fresh briefly, then refetches in background
      gcTime: 1000 * 60 * 5,           // 5min — keep cache for instant display while refetching
      refetchOnMount: true,             // refetch when component mounts (if stale)
      refetchOnWindowFocus: true,       // refetch when user returns to tab
      refetchOnReconnect: true,         // refetch after network reconnect
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    },
  },
})

// Render React immediately — auth is resolved inside AuthProvider
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  </StrictMode>,
)
