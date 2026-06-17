import { CreditCard, QrCode, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface PaymentMethodSheetProps {
  open: boolean
  onClose: () => void
  /** 'card' = cartão/boleto (direct charge) · 'pix' = cobrança na plataforma + transfer */
  onSelect: (method: 'card' | 'pix') => void
  loading?: boolean
}

/**
 * Folha de escolha da forma de pagamento. Pix exige um modelo de cobrança
 * diferente (na plataforma + transfer), então não pode aparecer na mesma tela
 * do Stripe que cartão/boleto — o usuário escolhe antes do redirect.
 */
export default function PaymentMethodSheet({
  open,
  onClose,
  onSelect,
  loading = false,
}: PaymentMethodSheetProps) {
  const { t } = useTranslation()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60"
      onClick={loading ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-t-2xl p-6 pb-10 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
            {t('payment.choose')}
          </h3>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-[hsl(var(--muted-foreground))] disabled:opacity-50"
            aria-label={t('common.cancel')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => onSelect('pix')}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl flex items-center gap-3 text-left transition-opacity hover:opacity-90 disabled:opacity-50 bg-[hsl(var(--primary))] text-white"
          >
            <QrCode className="w-6 h-6 shrink-0" />
            <span className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">{t('payment.pix')}</span>
              <span className="text-xs text-white/80 leading-tight">{t('payment.pixHint')}</span>
            </span>
          </button>

          <button
            onClick={() => onSelect('card')}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl flex items-center gap-3 text-left transition-colors hover:bg-[hsl(var(--secondary))] disabled:opacity-50 border border-[hsl(var(--border))] text-[hsl(var(--foreground))]"
          >
            <CreditCard className="w-6 h-6 shrink-0 text-[hsl(var(--muted-foreground))]" />
            <span className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">{t('payment.cardBoleto')}</span>
              <span className="text-xs text-[hsl(var(--muted-foreground))] leading-tight">{t('payment.cardHint')}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
