import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AuthInput } from '@/components/ui/AuthInput'
import { useTranslation } from 'react-i18next'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillEmail = searchParams.get('email') ?? ''
  const { sendPasswordResetOtp } = useAuth()
  const { t } = useTranslation()
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const schema = z.object({
    email: z
      .string()
      .min(1, t('auth.register.emailRequired'))
      .email(t('auth.register.emailInvalid')),
  })

  type FormData = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: prefillEmail },
  })

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    setSuccessMessage(null)
    try {
      await sendPasswordResetOtp(data.email)
      setSuccessMessage(t('auth.forgotPassword.codeSent'))
      setTimeout(() => {
        navigate(`/verify-otp?email=${encodeURIComponent(data.email)}`)
      }, 1500)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t('auth.forgotPassword.genericError')

      if (
        message.toLowerCase().includes('not found') ||
        message.toLowerCase().includes('user') ||
        message.toLowerCase().includes('email')
      ) {
        setServerError(t('auth.forgotPassword.emailNotFound'))
      } else {
        setServerError(message)
      }
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm sm:max-w-md flex flex-col gap-8">

        {/* Back button */}
        <Link
          to="/login"
          className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors self-start"
        >
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
          >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          {t('auth.forgotPassword.backToLogin')}
        </Link>

        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[hsl(var(--primary)/0.15)] border border-[hsl(var(--primary)/0.3)] flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] tracking-tight">
              {t('auth.forgotPassword.title')}
            </h1>
            <p className="text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
              {t('auth.forgotPassword.subtitle')}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>

          <AuthInput
            label={t('common.email')}
            type="email"
            placeholder={t('auth.forgotPassword.emailPlaceholder')}
            autoComplete="email"
            autoCapitalize="none"
            {...register('email')}
            error={errors.email?.message}
          />

          {/* Success message */}
          {successMessage && (
            <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/30 rounded-[var(--radius)] px-4 py-3">
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
                className="text-green-400 mt-0.5 shrink-0"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <p className="text-sm text-green-400">{successMessage}</p>
            </div>
          )}

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
            disabled={isSubmitting || !!successMessage}
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
                {t('auth.forgotPassword.submitting')}
              </>
            ) : (
              t('auth.forgotPassword.submit')
            )}
          </button>
        </form>

        {/* Manual navigate to OTP */}
        <div className="text-center">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {t('auth.forgotPassword.haveCode')}{' '}
            <button
              type="button"
              onClick={() => {
                const email = getValues('email')
                navigate(`/verify-otp${email ? `?email=${encodeURIComponent(email)}` : ''}`)
              }}
              className="font-semibold text-[hsl(var(--primary))] hover:text-[hsl(var(--primary)/0.8)] transition-colors"
            >
              {t('auth.forgotPassword.enterCode')}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
