import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface DeleteAccountModalProps {
  open: boolean
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}

/**
 * Confirmação de exclusão de conta com carência de 30 dias.
 * O texto deixa claro que dá tempo de voltar atrás: basta logar de novo.
 */
export default function DeleteAccountModal({
  open,
  loading,
  onConfirm,
  onClose,
}: DeleteAccountModalProps) {
  const { t } = useTranslation()

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o && !loading) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl focus:outline-none"
          onInteractOutside={(e) => { if (loading) e.preventDefault() }}
          onEscapeKeyDown={(e) => { if (loading) e.preventDefault() }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <Dialog.Title className="text-lg font-bold text-[hsl(var(--foreground))]">
              {t('profile.deleteAccount.title')}
            </Dialog.Title>
          </div>

          <Dialog.Description className="mt-4 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            {t('profile.deleteAccount.body')}
          </Dialog.Description>

          <div className="mt-4 rounded-xl bg-[hsl(var(--primary)/0.08)] px-4 py-3 text-sm text-[hsl(var(--foreground))]">
            {t('profile.deleteAccount.graceNote')}
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('profile.deleteAccount.confirm')}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-lg border border-[hsl(var(--border))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--primary)/0.05)] disabled:opacity-60"
            >
              {t('profile.deleteAccount.cancel')}
            </button>
          </div>

          <Dialog.Close asChild>
            <button
              type="button"
              aria-label={t('profile.deleteAccount.cancel')}
              disabled={loading}
              className="absolute right-4 top-4 text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))] disabled:opacity-60"
            >
              <X className="h-5 w-5" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
