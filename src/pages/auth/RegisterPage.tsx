import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AuthInput } from '@/components/ui/AuthInput'
import { useTranslation } from 'react-i18next'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { signUp } = useAuth()
  const { t } = useTranslation()
  const [serverError, setServerError] = useState<string | null>(null)

  const schema = z
    .object({
      fullName: z
        .string()
        .min(1, t('auth.register.nameRequired'))
        .min(2, t('auth.register.nameMinLength'))
        .max(100, t('auth.register.nameTooLong')),
      email: z
        .string()
        .min(1, t('auth.register.emailRequired'))
        .email(t('auth.register.emailInvalid')),
      dateBirth: z
        .string()
        .min(1, t('auth.register.birthDateRequired'))
        .refine((val) => {
          const birth = new Date(val)
          const now = new Date()
          let age = now.getFullYear() - birth.getFullYear()
          const monthDiff = now.getMonth() - birth.getMonth()
          if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
            age--
          }
          return age >= 18
        }, t('auth.register.ageMinimum')),
      password: z
        .string()
        .min(1, t('auth.register.passwordRequired'))
        .min(6, t('auth.register.passwordMinLength')),
      confirmPassword: z
        .string()
        .min(1, t('auth.register.confirmPasswordRequired')),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('auth.register.passwordsMismatch'),
      path: ['confirmPassword'],
    })

  type FormData = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    try {
      await signUp(data.email, data.password, data.fullName, data.dateBirth)
      navigate('/home', { replace: true })
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t('auth.register.genericError')

      if (
        message.toLowerCase().includes('already registered') ||
        message.toLowerCase().includes('already exists') ||
        message.toLowerCase().includes('email')
      ) {
        setServerError(t('auth.register.emailAlreadyUsed'))
      } else {
        setServerError(message)
      }
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm sm:max-w-md flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] tracking-tight">
            {t('auth.register.title')}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
            {t('auth.register.subtitle')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>

          <AuthInput
            label={t('common.name')}
            type="text"
            placeholder={t('auth.register.namePlaceholder')}
            autoComplete="name"
            autoCapitalize="words"
            {...register('fullName')}
            error={errors.fullName?.message}
          />

          <AuthInput
            label={t('common.email')}
            type="email"
            placeholder={t('auth.register.emailPlaceholder')}
            autoComplete="email"
            autoCapitalize="none"
            {...register('email')}
            error={errors.email?.message}
          />

          <AuthInput
            label={t('auth.register.birthDate')}
            type="date"
            placeholder={t('auth.register.birthDatePlaceholder')}
            autoComplete="bday"
            {...register('dateBirth')}
            error={errors.dateBirth?.message}
          />

          <AuthInput
            label={t('common.password')}
            type="password"
            placeholder={t('auth.register.passwordPlaceholder')}
            autoComplete="new-password"
            hint={t('auth.register.passwordHint')}
            {...register('password')}
            error={errors.password?.message}
          />

          <AuthInput
            label={t('auth.register.confirmPassword')}
            type="password"
            placeholder={t('auth.register.confirmPasswordPlaceholder')}
            autoComplete="new-password"
            {...register('confirmPassword')}
            error={errors.confirmPassword?.message}
          />

          {/* Server error */}
          {serverError && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-[var(--radius)] px-4 py-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-red-400 mt-0.5 shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm text-red-400">{serverError}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 rounded-[var(--radius)] font-semibold text-sm transition-all duration-200
              bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
              hover:bg-[hsl(var(--primary)/0.9)] active:scale-[0.98]
              disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
              flex items-center justify-center gap-2
              shadow-[0_0_24px_hsl(var(--primary)/0.35)]"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('auth.register.submitting')}
              </>
            ) : (
              t('auth.register.submit')
            )}
          </button>
        </form>

        {/* Login link */}
        <div className="text-center">
          <Link
            to="/login"
            className="text-sm font-semibold text-[hsl(var(--primary))] hover:text-[hsl(var(--primary)/0.8)] transition-colors"
          >
            {t('auth.register.loginLink')}
          </Link>
        </div>
      </div>
    </div>
  )
}
