import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[hsl(var(--background))] px-6 text-center gap-6">
      <div className="w-20 h-20 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center">
        <span className="text-4xl font-bold text-[hsl(var(--muted-foreground))]">404</span>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">
          {t('notFound.title')}
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-xs">
          {t('notFound.description')}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[hsl(var(--border))] text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
        >
          <ArrowLeft size={16} />
          {t('common.back')}
        </button>
        <button
          onClick={() => navigate('/home')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-semibold"
        >
          <Home size={16} />
          {t('notFound.goHome')}
        </button>
      </div>
    </div>
  )
}
