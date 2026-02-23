import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTranslation } from 'react-i18next'

function PasswordField({
  id,
  label,
  placeholder,
  error,
  registration,
}: {
  id: string
  label: string
  placeholder: string
  error?: string
  registration: object
}) {
  const [visible, setVisible] = useState(false)
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-[hsl(var(--foreground))]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          autoComplete="new-password"
          {...registration}
          className="w-full h-12 px-4 pr-12 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:border-transparent transition-all"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors p-1"
          aria-label={visible ? t('profile.changePassword.hidePassword') : t('profile.changePassword.showPassword')}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { updatePassword } = useAuth()
  const { t } = useTranslation()
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const schema = z
    .object({
      currentPassword: z
        .string()
        .min(1, t('profile.changePassword.currentRequired')),
      newPassword: z
        .string()
        .min(6, t('profile.changePassword.newMinLength')),
      confirmPassword: z
        .string()
        .min(1, t('profile.changePassword.confirmRequired')),
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
      message: t('profile.changePassword.sameAsOld'),
      path: ['newPassword'],
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('profile.changePassword.mismatch'),
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
      await updatePassword(data.currentPassword, data.newPassword)

      setSuccess(true)
      setTimeout(() => {
        navigate(-1)
      }, 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('profile.changePassword.genericError')
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
          <h1 className="text-base font-semibold text-[hsl(var(--foreground))]">{t('profile.changePassword.title')}</h1>
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
                {t('profile.changePassword.successTitle')}
              </h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">
                {t('profile.changePassword.successMessage')}
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
            <PasswordField
              id="currentPassword"
              label={t('profile.changePassword.currentLabel')}
              placeholder={t('profile.changePassword.currentPlaceholder')}
              error={errors.currentPassword?.message}
              registration={register('currentPassword')}
            />

            <PasswordField
              id="newPassword"
              label={t('profile.changePassword.newLabel')}
              placeholder={t('profile.changePassword.newPlaceholder')}
              error={errors.newPassword?.message}
              registration={register('newPassword')}
            />

            <PasswordField
              id="confirmPassword"
              label={t('profile.changePassword.confirmLabel')}
              placeholder={t('profile.changePassword.confirmPlaceholder')}
              error={errors.confirmPassword?.message}
              registration={register('confirmPassword')}
            />

            <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              {t('profile.changePassword.hint')}
            </p>

            {serverError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <p className="text-sm text-red-400">{serverError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 rounded-xl font-semibold text-sm transition-all duration-200
                bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                hover:bg-[hsl(var(--primary)/0.9)] active:scale-[0.98]
                disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
                flex items-center justify-center gap-2
                shadow-[0_0_24px_hsl(var(--primary)/0.3)]
                mt-2"
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
