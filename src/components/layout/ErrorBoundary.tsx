import { Component } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { RefreshCw, AlertTriangle } from 'lucide-react'

/**
 * Route-level error element used by React Router's errorElement.
 * Catches render errors, loader errors, and unhandled exceptions
 * inside any route — prevents the blank-screen-of-death.
 */
export function RouteErrorFallback() {
  const error = useRouteError()

  const is404 = isRouteErrorResponse(error) && error.status === 404

  if (is404) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-5xl font-black text-[hsl(var(--primary))]">404</p>
          <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
            Página não encontrada.
          </p>
          <a
            href="/home"
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center px-6">
      <div className="flex flex-col items-center text-center max-w-sm gap-4">
        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle size={24} className="text-red-400" />
        </div>
        <div>
          <p className="text-base font-bold text-[hsl(var(--foreground))]">
            Algo deu errado
          </p>
          <p className="mt-1.5 text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
            Ocorreu um erro inesperado. Tente recarregar a página.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <RefreshCw size={15} />
          Recarregar
        </button>
      </div>
    </div>
  )
}

/**
 * Class-based error boundary for wrapping top-level providers
 * outside of React Router (catches errors in AuthProvider, etc).
 */
interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
}

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[GlobalErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0a',
            padding: '1.5rem',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 320 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#fafafa' }}>
              Algo deu errado
            </p>
            <p style={{ marginTop: 8, fontSize: 13, color: '#888', lineHeight: 1.5 }}>
              Ocorreu um erro inesperado. Tente recarregar.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 20,
                padding: '10px 24px',
                borderRadius: 12,
                border: 'none',
                background: '#c084fc',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Recarregar
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
