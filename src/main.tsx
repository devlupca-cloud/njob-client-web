import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import './lib/i18n'
import './index.css'
import { router } from './router'
import { ToastProvider } from '@/components/ui/Toast'
import AuthProvider from '@/components/layout/AuthProvider'
import { GlobalErrorBoundary } from '@/components/layout/ErrorBoundary'

// Sentry error tracking — replace DSN with your project's DSN from sentry.io
if (import.meta.env.PROD) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN || '',
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE,
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,                     // always refetch — ensures fresh data on every navigation
      gcTime: 1000 * 60 * 5,           // 5min — keep cache for instant display while refetching
      refetchOnMount: 'always',          // always refetch when component mounts
      refetchOnWindowFocus: true,       // refetch when user returns to tab
      refetchOnReconnect: true,         // refetch after network reconnect
      retry: 3,                         // 3 retries — covers transient network failures
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000), // 1s, 2s, 4s
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
