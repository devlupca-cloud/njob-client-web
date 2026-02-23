import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Loader2, CheckCircle2, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from 'react-i18next'

export default function ChangeEmailPage() {
  const navigate = useNavigate()
  const { user, profile, setProfile } = useAuthStore()
  const { t } = useTranslation()
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const schema = z.object({
    email: z
      .string()
      .min(1, t('profile.changeEmail.emailRequired'))
      .email(t('profile.changeEmail.emailInvalid')),
  })

  type FormData = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: user?.email ?? '',
    },
  })

  const currentValue = watch('email')
  const hasChanged = currentValue !== (user?.email ?? '')

  const onSubmit = async (data: FormData) => {
    if (!user?.id) return
    setServerError(null)

    try {
      const { error } = await supabase.auth.updateUser({ email: data.email })

      if (error) throw error

      if (profile) {
        setProfile({ ...profile, email: data.email })
      }

      setSuccess(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('profile.changeEmail.genericError')
      setServerError(message)
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="relative flex items-center justify-center h-14 px-4">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-4 flex items-center justify-center w-8 h-8 rounded-full hover:bg-[hsl(var(--card))] transition-colors"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="w-5 h-5 text-[hsl(var(--foreground))]" />
          </button>
          <h1 className="text-base font-semibold text-[hsl(var(--foreground))]">{t('profile.changeEmail.title')}</h1>
        </div>
      </div>

      <div className="px-4 pt-10">
        {success ? (
          <div className="flex flex-col items-center gap-6 pt-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
                {t('profile.changeEmail.successTitle')}
              </h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 leading-relaxed">
                {t('profile.changeEmail.successSent')}{' '}
                <span className="text-[hsl(var(--foreground))] font-medium">{currentValue}</span>.
                {' '}{t('profile.changeEmail.successInstructions')}
              </p>
            </div>
            <button
              onClick={() => navigate(-1)}
              className="w-full h-12 rounded-xl font-semibold text-sm transition-all duration-200
                bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                hover:bg-[hsl(var(--primary)/0.9)] active:scale-[0.98]
                shadow-[0_0_24px_hsl(var(--primary)/0.3)]"
            >
              {t('profile.changeEmail.backToProfile')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
            <div className="flex items-start gap-2 bg-[hsl(var(--primary)/0.08)] border border-[hsl(var(--primary)/0.2)] rounded-xl px-4 py-3">
              <Info className="w-4 h-4 text-[hsl(var(--primary))] shrink-0 mt-0.5" />
              <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                {t('profile.changeEmail.disclaimer')}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-bold text-[hsl(var(--foreground))]">
                {t('profile.changeEmail.label')}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                placeholder={t('profile.changeEmail.placeholder')}
                {...register('email')}
                className="w-full h-12 px-4 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:border-transparent transition-all"
              />
              {errors.email && (
                <p className="text-xs text-red-400">{errors.email.message}</p>
              )}
            </div>

            {serverError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <p className="text-sm text-red-400">{serverError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !hasChanged}
              className="w-full h-12 rounded-xl font-semibold text-sm transition-all duration-200
                bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                hover:bg-[hsl(var(--primary)/0.9)] active:scale-[0.98]
                disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
                flex items-center justify-center gap-2
                shadow-[0_0_24px_hsl(var(--primary)/0.3)]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                t('common.confirm')
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
