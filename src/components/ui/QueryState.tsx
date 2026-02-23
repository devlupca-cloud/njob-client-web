import { Loader2, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface QueryStateProps {
  isLoading: boolean
  isError: boolean
  error?: Error | null
  /** Optional custom error message */
  errorMessage?: string
  children: React.ReactNode
}

/**
 * Handles loading/error states for React Query results.
 * Renders children only when data is available.
 */
export default function QueryState({
  isLoading,
  isError,
  error,
  errorMessage,
  children,
}: QueryStateProps) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-[hsl(var(--primary))]" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {errorMessage ?? (error as Error)?.message ?? t('common.error')}
        </p>
      </div>
    )
  }

  return <>{children}</>
}
