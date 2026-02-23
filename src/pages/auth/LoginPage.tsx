import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AuthInput } from '@/components/ui/AuthInput'
import Logo from '@/components/ui/Logo'
import { useToast } from '@/components/ui/Toast'
import { useTranslation } from 'react-i18next'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillEmail = searchParams.get('email') ?? ''
  const { signIn, enterAsGuest } = useAuth()
  const { toast } = useToast()
  const { t } = useTranslation()


  const schema = z.object({
    email: z
      .string()
      .min(1, t('auth.register.emailRequired'))
      .email(t('auth.register.emailInvalid')),
    password: z
      .string()
      .min(1, t('auth.register.passwordRequired')),
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
    try {
      await signIn(data.email, data.password)
      navigate('/home', { replace: true })
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t('auth.login.genericError')

      if (
        message.toLowerCase().includes('invalid') ||
        message.toLowerCase().includes('credentials') ||
        message.toLowerCase().includes('email') ||
        message.toLowerCase().includes('user')
      ) {
        toast({ title: t('auth.login.invalidCredentials'), type: 'error' })
      } else {
        toast({ title: message, type: 'error' })
      }
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm sm:max-w-md flex flex-col gap-10">

        {/* Logo / Header */}
        <div className="flex flex-col items-center gap-4">
          <Logo size="xl" variant="image" />
          <p className="text-[hsl(var(--muted-foreground))] text-sm">
            {t('auth.login.welcomeBack')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>

          <AuthInput
            label={t('auth.login.label')}
            type="email"
            placeholder={t('auth.login.emailPlaceholder')}
            autoComplete="email"
            autoCapitalize="none"
            {...register('email')}
            error={errors.email?.message}
          />

          <AuthInput
            label={t('auth.login.passwordLabel')}
            type="password"
            placeholder={t('auth.login.passwordPlaceholder')}
            autoComplete="current-password"
            {...register('password')}
            error={errors.password?.message}
          />

          {/* Forgot password */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                const email = getValues('email')
                navigate(`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`)
              }}
              className="text-sm font-semibold text-[hsl(var(--primary))] hover:text-[hsl(var(--primary)/0.8)] transition-colors"
            >
              {t('auth.login.forgotPassword')}
            </button>
          </div>

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
                {t('auth.login.submitting')}
              </>
            ) : (
              t('auth.login.submit')
            )}
          </button>
        </form>

        {/* Guest entry */}
        <button
          type="button"
          onClick={() => {
            enterAsGuest()
            navigate('/home', { replace: true })
          }}
          className="w-full text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          {t('auth.login.guestEntry')}
        </button>

        {/* Register link */}
        <div className="text-center">
          <Link
            to="/register"
            className="text-sm font-semibold text-[hsl(var(--primary))] hover:text-[hsl(var(--primary)/0.8)] transition-colors"
          >
            {t('auth.login.register')}
          </Link>
        </div>
      </div>
    </div>
  )
}
