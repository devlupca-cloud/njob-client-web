import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { AuthInput } from '@/components/ui/AuthInput'
import { useTranslation } from 'react-i18next'

function PasswordStrengthBar({ password }: { password: string }) {
  const { t } = useTranslation()

  const getStrength = (pw: string): { level: number; label: string; color: string } => {
    if (!pw) return { level: 0, label: '', color: '' }
    let score = 0
    if (pw.length >= 6) score++
    if (pw.length >= 10) score++
    if (/[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++

    if (score <= 1) return { level: 1, label: t('auth.newPassword.strengthWeak'), color: 'bg-red-500' }
    if (score <= 2) return { level: 2, label: t('auth.newPassword.strengthFair'), color: 'bg-orange-500' }
    if (score <= 3) return { level: 3, label: t('auth.newPassword.strengthGood'), color: 'bg-yellow-500' }
    return { level: 4, label: t('auth.newPassword.strengthStrong'), color: 'bg-green-500' }
  }

  const { level, label, color } = getStrength(password)
  if (!password) return null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={[
              'h-1 flex-1 rounded-full transition-all duration-300',
              i <= level ? color : 'bg-[hsl(var(--border))]',
            ].join(' ')}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${color.replace('bg-', 'text-')}`}>{label}</p>
    </div>
  )
}

export default function NewPasswordPage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { t } = useTranslation()
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const schema = z
    .object({
      newPassword: z
        .string()
        .min(1, t('auth.newPassword.passwordRequired'))
        .min(6, t('auth.newPassword.passwordMinLength'))
        .regex(/[A-Za-z]/, t('auth.newPassword.passwordNeedLetter'))
        .regex(/[0-9]/, t('auth.newPassword.passwordNeedNumber')),
      confirmPassword: z
        .string()
        .min(1, t('auth.register.confirmPasswordRequired')),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('auth.newPassword.passwordsMismatch'),
      path: ['confirmPassword'],
    })

  type FormData = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const newPasswordValue = watch('newPassword', '')

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    setSuccessMessage(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: data.newPassword })
      if (error) throw error
      setSuccessMessage(t('auth.newPassword.success'))
      setTimeout(async () => {
        await signOut()
        navigate('/login', { replace: true })
      }, 1500)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t('auth.newPassword.genericError')
      setServerError(message)
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm sm:max-w-md flex flex-col gap-8">

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
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] tracking-tight">
              {t('auth.newPassword.title')}
            </h1>
            <p className="text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
              {t('auth.newPassword.subtitle')}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>

          <div className="flex flex-col gap-2">
            <AuthInput
              label={t('auth.newPassword.newPasswordLabel')}
              type="password"
              placeholder={t('auth.newPassword.newPasswordPlaceholder')}
              autoComplete="new-password"
              {...register('newPassword')}
              error={errors.newPassword?.message}
            />
            <PasswordStrengthBar password={newPasswordValue} />
          </div>

          <AuthInput
            label={t('auth.newPassword.confirmLabel')}
            type="password"
            placeholder={t('auth.newPassword.confirmPlaceholder')}
            autoComplete="new-password"
            {...register('confirmPassword')}
            error={errors.confirmPassword?.message}
          />

          {/* Password requirements */}
          <div className="bg-[hsl(var(--card))] rounded-[var(--radius)] px-4 py-3 border border-[hsl(var(--border))]">
            <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] mb-2">
              {t('auth.newPassword.requirements')}
            </p>
            <ul className="flex flex-col gap-1">
              {[
                { label: t('auth.newPassword.reqMinChars'), met: newPasswordValue.length >= 6 },
                { label: t('auth.newPassword.reqLetter'), met: /[A-Za-z]/.test(newPasswordValue) },
                { label: t('auth.newPassword.reqNumber'), met: /[0-9]/.test(newPasswordValue) },
              ].map(({ label, met }) => (
                <li key={label} className="flex items-center gap-2">
                  <span
                    className={[
                      'w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors duration-200',
                      met ? 'bg-green-500' : 'bg-[hsl(var(--border))]',
                    ].join(' ')}
                  >
                    {met && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="8"
                        height="8"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span
                    className={`text-xs ${met ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}
                  >
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

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
                {t('auth.newPassword.submitting')}
              </>
            ) : (
              t('auth.newPassword.submit')
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
