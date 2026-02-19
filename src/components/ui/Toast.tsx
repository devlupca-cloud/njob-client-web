import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  title: string
  description?: string
  type: ToastType
}

interface ToastOptions {
  title: string
  description?: string
  type?: ToastType
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

// ─── Config ───────────────────────────────────────────────────────────────────

const TOAST_DURATION = 3000

const toastStyles: Record<ToastType, { icon: React.ReactNode; bar: string; iconColor: string }> = {
  success: {
    icon: <CheckCircle2 size={18} strokeWidth={2} />,
    bar: 'bg-emerald-500',
    iconColor: 'text-emerald-400',
  },
  error: {
    icon: <XCircle size={18} strokeWidth={2} />,
    bar: 'bg-red-500',
    iconColor: 'text-red-400',
  },
  warning: {
    icon: <AlertTriangle size={18} strokeWidth={2} />,
    bar: 'bg-yellow-500',
    iconColor: 'text-yellow-400',
  },
  info: {
    icon: <Info size={18} strokeWidth={2} />,
    bar: 'bg-[hsl(var(--primary))]',
    iconColor: 'text-[hsl(var(--primary))]',
  },
}

// ─── Single Toast Item ────────────────────────────────────────────────────────

function ToastCard({
  item,
  onRemove,
}: {
  item: ToastItem
  onRemove: (id: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    setVisible(false)
    // Wait for slide-out animation then remove
    setTimeout(() => onRemove(item.id), 300)
  }, [item.id, onRemove])

  useEffect(() => {
    // Trigger slide-in on mount
    const raf = requestAnimationFrame(() => setVisible(true))
    timerRef.current = setTimeout(dismiss, TOAST_DURATION)

    return () => {
      cancelAnimationFrame(raf)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [dismiss])

  const { icon, bar, iconColor } = toastStyles[item.type]

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        transition: 'transform 300ms cubic-bezier(0.34,1.56,0.64,1), opacity 300ms ease',
        transform: visible ? 'translateY(0)' : 'translateY(-110%)',
        opacity: visible ? 1 : 0,
      }}
      className="relative w-full max-w-sm overflow-hidden rounded-[var(--radius)]
        bg-[hsl(var(--card))] border border-[hsl(var(--border))]
        shadow-xl shadow-black/40"
    >
      {/* Accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${bar}`} />

      <div className="flex items-start gap-3 px-4 py-3 pl-5">
        {/* Icon */}
        <span className={`mt-0.5 shrink-0 ${iconColor}`}>{icon}</span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[hsl(var(--foreground))] leading-snug">
            {item.title}
          </p>
          {item.description && (
            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              {item.description}
            </p>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          aria-label="Fechar notificação"
          className="shrink-0 mt-0.5 text-[hsl(var(--muted-foreground))]
            hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback((options: ToastOptions) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [
      { id, title: options.title, description: options.description, type: options.type ?? 'info' },
      ...prev,
    ])
  }, [])

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast viewport - fixed top, centered */}
      <div
        aria-label="Notificações"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999]
          flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
      >
        {toasts.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <ToastCard item={item} onRemove={remove} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return { toast: ctx.toast }
}
