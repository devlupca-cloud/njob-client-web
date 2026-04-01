import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import Logo from '@/components/ui/Logo'
import { useTranslation } from 'react-i18next'

const STORAGE_KEY = 'njob-age-verified'

export function useAgeVerification() {
  const [verified, setVerified] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true',
  )

  const confirm = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setVerified(true)
  }

  return { verified, confirm }
}

export default function AgeVerificationModal({
  open,
  onConfirm,
}: {
  open: boolean
  onConfirm: () => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-sm rounded-2xl p-6 bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-xl flex flex-col items-center gap-5"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Logo size="md" variant="image" className="rounded-xl" />

          <div className="text-center space-y-2">
            <Dialog.Title className="text-lg font-bold text-[hsl(var(--foreground))]">
              {t('ageVerification.title')}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-[hsl(var(--muted-foreground))]">
              {t('ageVerification.description')}
            </Dialog.Description>
          </div>

          <div className="flex flex-col gap-2 w-full">
            <button
              onClick={onConfirm}
              className="w-full h-11 rounded-full text-sm font-semibold bg-[hsl(var(--primary))] text-white hover:opacity-90 transition-opacity"
            >
              {t('ageVerification.confirm')}
            </button>
            <a
              href="https://www.google.com"
              className="w-full h-11 rounded-full text-sm font-medium flex items-center justify-center border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
            >
              {t('ageVerification.deny')}
            </a>
          </div>

          <p className="text-[10px] text-center text-[hsl(var(--muted-foreground))] leading-relaxed">
            {t('ageVerification.disclaimer')}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
