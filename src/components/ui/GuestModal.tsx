import { createContext, useCallback, useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from 'react-i18next'

// ─── Context ──────────────────────────────────────────────────────────────────

interface GuestModalContextValue {
  guardGuestAction: () => boolean
}

const GuestModalContext = createContext<GuestModalContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function GuestModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { t } = useTranslation()

  const guardGuestAction = useCallback(() => {
    const isGuest = useAuthStore.getState().isGuest
    if (isGuest) {
      setOpen(true)
      return true
    }
    return false
  }, [])

  const handleRegister = () => {
    useAuthStore.getState().setGuest(false)
    setOpen(false)
    navigate('/register')
  }

  const handleLogin = () => {
    useAuthStore.getState().setGuest(false)
    setOpen(false)
    navigate('/login')
  }

  return (
    <GuestModalContext.Provider value={{ guardGuestAction }}>
      {children}

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-6 shadow-xl">
            <Dialog.Title className="text-lg font-bold text-[hsl(var(--foreground))] text-center">
              {t('guest.title')}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-[hsl(var(--muted-foreground))] text-center leading-relaxed">
              {t('guest.description')}
            </Dialog.Description>

            <div className="flex flex-col gap-3 mt-6">
              <button
                onClick={handleRegister}
                className="w-full py-3 rounded-xl font-semibold text-sm bg-[hsl(var(--primary))] text-white hover:opacity-90 active:scale-[0.98] transition-all duration-150"
              >
                {t('guest.register')}
              </button>
              <button
                onClick={handleLogin}
                className="w-full py-3 rounded-xl font-semibold text-sm border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] active:scale-[0.98] transition-all duration-150"
              >
                {t('guest.login', 'Entrar')}
              </button>
              <Dialog.Close asChild>
                <button className="w-full py-3 rounded-xl font-semibold text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] transition-colors">
                  {t('guest.cancel')}
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </GuestModalContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGuestGuard() {
  const ctx = useContext(GuestModalContext)
  if (!ctx) throw new Error('useGuestGuard must be used inside <GuestModalProvider>')
  return { guardGuestAction: ctx.guardGuestAction }
}
