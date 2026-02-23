import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CreditCard, ShieldCheck } from 'lucide-react'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AddCardPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] px-4 pt-4 pb-3">
        <div className="relative flex items-center justify-center h-7">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-7 h-7 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
            aria-label={t('common.back')}
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">
            {t('payments.addCard.title')}
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 py-12 flex flex-col items-center justify-center gap-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center">
          <CreditCard size={28} className="text-[hsl(var(--muted-foreground))]" />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">
            {t('payments.addCard.comingSoon')}
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))] max-w-[280px] leading-relaxed">
            {t('payments.addCard.comingSoonDescription')}
          </p>
        </div>

        <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
          <ShieldCheck size={14} />
          <p className="text-xs">{t('payments.addCard.stripeInfo')}</p>
        </div>

        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2.5 rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] text-sm font-semibold"
        >
          {t('common.back')}
        </button>
      </main>
    </div>
  )
}
