import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, UserPlus, LogIn, X } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/hooks/useAuth'
import { AuthInput } from '@/components/ui/AuthInput'
import { useToast } from '@/components/ui/Toast'
import Logo from '@/components/ui/Logo'
import { useTranslation } from 'react-i18next'

// ─── Types ───────────────────────────────────────────────────────────────────

type ModalView = 'choice' | 'login' | 'register'

interface GuestModalContextValue {
  guardGuestAction: () => boolean
}

const GuestModalContext = createContext<GuestModalContextValue | null>(null)

// ─── Login Form ──────────────────────────────────────────────────────────────

function LoginForm({
  onBack,
  onSwitchToRegister,
  onSuccess,
  onForgotPassword,
}: {
  onBack: () => void
  onSwitchToRegister: () => void
  onSuccess: () => void
  onForgotPassword: () => void
}) {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const { toast } = useToast()

  const schema = z.object({
    email: z
      .string()
      .min(1, t('auth.register.emailRequired'))
      .email(t('auth.register.emailInvalid')),
    password: z.string().min(1, t('auth.register.passwordRequired')),
  })

  type FormData = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    try {
      await signIn(data.email, data.password)
      onSuccess()
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
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center
            text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-lg font-bold text-[hsl(var(--foreground))] leading-tight">
            {t('guest.loginTitle')}
          </h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            {t('guest.loginSubtitle')}
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <AuthInput
          label={t('common.email')}
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

        <div className="flex justify-end -mt-1">
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-xs font-semibold text-[hsl(var(--primary))]
              hover:text-[hsl(var(--primary)/0.8)] transition-colors"
          >
            {t('auth.login.forgotPassword')}
          </button>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-11 rounded-xl font-semibold text-sm transition-all duration-200
            bg-[hsl(var(--primary))] text-white hover:opacity-90 active:scale-[0.98]
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2
            shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
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

      <div className="flex items-center gap-2 justify-center mt-6">
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {t('guest.noAccount')}
        </span>
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="text-xs font-bold text-[hsl(var(--primary))]
            hover:text-[hsl(var(--primary)/0.8)] transition-colors"
        >
          {t('guest.register')}
        </button>
      </div>
    </div>
  )
}

// ─── Register Form ───────────────────────────────────────────────────────────

function RegisterForm({
  onBack,
  onSwitchToLogin,
  onSuccess,
}: {
  onBack: () => void
  onSwitchToLogin: () => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const { signUp } = useAuth()
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
          const m = now.getMonth() - birth.getMonth()
          if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
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
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    try {
      await signUp(data.email, data.password, data.fullName, data.dateBirth)
      onSuccess()
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
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center
            text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-lg font-bold text-[hsl(var(--foreground))] leading-tight">
            {t('auth.register.title')}
          </h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            {t('auth.register.subtitle')}
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-3.5"
        noValidate
      >
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

        {serverError && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5">
            <p className="text-xs text-red-400">{serverError}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-11 rounded-xl font-semibold text-sm transition-all duration-200
            bg-[hsl(var(--primary))] text-white hover:opacity-90 active:scale-[0.98]
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2
            shadow-[0_0_20px_hsl(var(--primary)/0.3)] mt-1"
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

      <div className="flex items-center gap-2 justify-center mt-5">
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {t('guest.alreadyHaveAccount')}
        </span>
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-xs font-bold text-[hsl(var(--primary))]
            hover:text-[hsl(var(--primary)/0.8)] transition-colors"
        >
          {t('auth.login.submit')}
        </button>
      </div>
    </div>
  )
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function GuestModalProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<ModalView>('choice')
  const navigate = useNavigate()
  const { t } = useTranslation()

  const guardGuestAction = useCallback(() => {
    const isGuest = useAuthStore.getState().isGuest
    if (isGuest) {
      setView('choice')
      setOpen(true)
      return true
    }
    return false
  }, [])

  const handleSuccess = () => {
    setOpen(false)
    setTimeout(() => setView('choice'), 200)
  }

  const handleForgotPassword = () => {
    setOpen(false)
    setTimeout(() => setView('choice'), 200)
    navigate('/forgot-password')
  }

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setTimeout(() => setView('choice'), 200)
    }
  }

  return (
    <GuestModalContext.Provider
      value={useMemo(() => ({ guardGuestAction }), [guardGuestAction])}
    >
      {children}

      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          {/* Overlay */}
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md" />

          {/* Content */}
          <Dialog.Content
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
              w-[calc(100%-2rem)] max-w-[420px] max-h-[90dvh]
              rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))]
              shadow-[0_24px_80px_rgba(0,0,0,0.5)] overflow-hidden
              flex flex-col"
          >
            {/* Close button */}
            <button
              onClick={() => handleOpenChange(false)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full
                bg-[hsl(var(--secondary)/0.8)] backdrop-blur-sm
                flex items-center justify-center
                text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]
                transition-colors"
            >
              <X size={15} />
            </button>

            {/* Scrollable area */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-6">
              {/* ── Choice View ── */}
              {view === 'choice' && (
                <div className="flex flex-col items-center">
                  <Dialog.Title className="sr-only">
                    {t('guest.title')}
                  </Dialog.Title>
                  <Dialog.Description className="sr-only">
                    {t('guest.description')}
                  </Dialog.Description>

                  <Logo size="lg" variant="image" className="mb-5" />

                  <h2 className="text-xl font-bold text-[hsl(var(--foreground))] text-center">
                    {t('guest.title')}
                  </h2>
                  <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))] text-center leading-relaxed max-w-[300px]">
                    {t('guest.description')}
                  </p>

                  {/* Divider */}
                  <div className="w-full flex items-center gap-3 my-6">
                    <div className="flex-1 h-px bg-[hsl(var(--border))]" />
                    <span className="text-[11px] text-[hsl(var(--muted-foreground))] font-medium uppercase tracking-wider">
                      {t('guest.chooseOption')}
                    </span>
                    <div className="flex-1 h-px bg-[hsl(var(--border))]" />
                  </div>

                  <div className="w-full flex flex-col gap-3">
                    {/* Register option */}
                    <button
                      onClick={() => setView('register')}
                      className="w-full flex items-center gap-4 p-4 rounded-xl
                        bg-[hsl(var(--primary)/0.08)] border border-[hsl(var(--primary)/0.2)]
                        hover:border-[hsl(var(--primary)/0.4)] hover:bg-[hsl(var(--primary)/0.12)]
                        transition-all duration-200 active:scale-[0.98]"
                    >
                      <div
                        className="w-11 h-11 rounded-xl bg-[hsl(var(--primary))]
                          flex items-center justify-center shrink-0
                          shadow-[0_0_16px_hsl(var(--primary)/0.3)]"
                      >
                        <UserPlus size={20} className="text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-[hsl(var(--foreground))]">
                          {t('guest.register')}
                        </p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                          {t('guest.registerHint')}
                        </p>
                      </div>
                    </button>

                    {/* Login option */}
                    <button
                      onClick={() => setView('login')}
                      className="w-full flex items-center gap-4 p-4 rounded-xl
                        bg-[hsl(var(--secondary)/0.6)] border border-[hsl(var(--border))]
                        hover:border-[hsl(var(--primary)/0.3)] hover:bg-[hsl(var(--secondary))]
                        transition-all duration-200 active:scale-[0.98]"
                    >
                      <div
                        className="w-11 h-11 rounded-xl bg-[hsl(var(--secondary))]
                          border border-[hsl(var(--border))]
                          flex items-center justify-center shrink-0"
                      >
                        <LogIn size={20} className="text-[hsl(var(--primary))]" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-[hsl(var(--foreground))]">
                          {t('guest.login')}
                        </p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                          {t('guest.loginHint')}
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Dismiss */}
                  <Dialog.Close asChild>
                    <button className="mt-6 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
                      {t('guest.cancel')}
                    </button>
                  </Dialog.Close>
                </div>
              )}

              {/* ── Login View ── */}
              {view === 'login' && (
                <>
                  <Dialog.Title className="sr-only">
                    {t('guest.loginTitle')}
                  </Dialog.Title>
                  <Dialog.Description className="sr-only">
                    {t('guest.loginSubtitle')}
                  </Dialog.Description>
                  <LoginForm
                    onBack={() => setView('choice')}
                    onSwitchToRegister={() => setView('register')}
                    onSuccess={handleSuccess}
                    onForgotPassword={handleForgotPassword}
                  />
                </>
              )}

              {/* ── Register View ── */}
              {view === 'register' && (
                <>
                  <Dialog.Title className="sr-only">
                    {t('auth.register.title')}
                  </Dialog.Title>
                  <Dialog.Description className="sr-only">
                    {t('auth.register.subtitle')}
                  </Dialog.Description>
                  <RegisterForm
                    onBack={() => setView('choice')}
                    onSwitchToLogin={() => setView('login')}
                    onSuccess={handleSuccess}
                  />
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </GuestModalContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGuestGuard() {
  const ctx = useContext(GuestModalContext)
  if (!ctx)
    throw new Error('useGuestGuard must be used inside <GuestModalProvider>')
  return { guardGuestAction: ctx.guardGuestAction }
}
