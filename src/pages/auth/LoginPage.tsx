import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AuthInput } from '@/components/ui/AuthInput'
import Logo from '@/components/ui/Logo'
import { useToast } from '@/components/ui/Toast'

const schema = z.object({
  email: z
    .string()
    .min(1, 'E-mail é obrigatório')
    .email('E-mail inválido'),
  password: z
    .string()
    .min(1, 'Senha é obrigatória'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillEmail = searchParams.get('email') ?? ''
  const { signIn } = useAuth()
  const { toast } = useToast()
  const [rememberMe, setRememberMe] = useState(false)

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
        err instanceof Error ? err.message : 'Erro ao fazer login. Tente novamente.'

      if (
        message.toLowerCase().includes('invalid') ||
        message.toLowerCase().includes('credentials') ||
        message.toLowerCase().includes('email') ||
        message.toLowerCase().includes('user')
      ) {
        toast({ title: 'E-mail ou senha incorretos.', type: 'error' })
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
            Bem-vindo de volta
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>

          <AuthInput
            label="Login"
            type="email"
            placeholder="Digite seu e-mail"
            autoComplete="email"
            autoCapitalize="none"
            {...register('email')}
            error={errors.email?.message}
          />

          <AuthInput
            label="Senha"
            type="password"
            placeholder="Digite sua senha"
            autoComplete="current-password"
            {...register('password')}
            error={errors.password?.message}
          />

          {/* Remember me + Forgot password */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                role="checkbox"
                aria-checked={rememberMe}
                onClick={() => setRememberMe((v) => !v)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  rememberMe
                    ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))]'
                    : 'border-[hsl(var(--border))] bg-transparent'
                }`}
              >
                {rememberMe && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              <span className="text-sm text-[hsl(var(--muted-foreground))]">Lembrar-me</span>
            </label>

            <button
              type="button"
              onClick={() => {
                const email = getValues('email')
                navigate(`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`)
              }}
              className="text-sm font-semibold text-[hsl(var(--primary))] hover:text-[hsl(var(--primary)/0.8)] transition-colors"
            >
              Esqueci a senha
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
                Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        {/* Register link */}
        <div className="text-center">
          <Link
            to="/register"
            className="text-sm font-semibold text-[hsl(var(--primary))] hover:text-[hsl(var(--primary)/0.8)] transition-colors"
          >
            Cadastro
          </Link>
        </div>
      </div>
    </div>
  )
}
