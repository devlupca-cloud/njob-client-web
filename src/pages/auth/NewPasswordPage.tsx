import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AuthInput } from '@/components/ui/AuthInput'

const schema = z
  .object({
    newPassword: z
      .string()
      .min(1, 'Nova senha é obrigatória')
      .min(6, 'A senha deve ter pelo menos 6 caracteres')
      .regex(/[A-Za-z]/, 'A senha deve conter pelo menos uma letra')
      .regex(/[0-9]/, 'A senha deve conter pelo menos um número'),
    confirmPassword: z
      .string()
      .min(1, 'Confirmação de senha é obrigatória'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

function PasswordStrengthBar({ password }: { password: string }) {
  const getStrength = (pw: string): { level: number; label: string; color: string } => {
    if (!pw) return { level: 0, label: '', color: '' }
    let score = 0
    if (pw.length >= 6) score++
    if (pw.length >= 10) score++
    if (/[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++

    if (score <= 1) return { level: 1, label: 'Fraca', color: 'bg-red-500' }
    if (score <= 2) return { level: 2, label: 'Regular', color: 'bg-orange-500' }
    if (score <= 3) return { level: 3, label: 'Boa', color: 'bg-yellow-500' }
    return { level: 4, label: 'Forte', color: 'bg-green-500' }
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
  const { updatePassword, signOut } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

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
      await updatePassword(data.newPassword)
      setSuccessMessage('Senha alterada com sucesso!')
      setTimeout(async () => {
        await signOut()
        navigate('/login', { replace: true })
      }, 1500)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Erro ao atualizar senha. Tente novamente.'
      setServerError(message)
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm flex flex-col gap-8">

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
              Nova senha
            </h1>
            <p className="text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
              Digite abaixo sua nova senha. Escolha uma senha forte com letras e números.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>

          <div className="flex flex-col gap-2">
            <AuthInput
              label="Nova senha"
              type="password"
              placeholder="Digite uma nova senha"
              autoComplete="new-password"
              {...register('newPassword')}
              error={errors.newPassword?.message}
            />
            <PasswordStrengthBar password={newPasswordValue} />
          </div>

          <AuthInput
            label="Confirmar senha"
            type="password"
            placeholder="Confirme a senha"
            autoComplete="new-password"
            {...register('confirmPassword')}
            error={errors.confirmPassword?.message}
          />

          {/* Password requirements */}
          <div className="bg-[hsl(var(--card))] rounded-[var(--radius)] px-4 py-3 border border-[hsl(var(--border))]">
            <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] mb-2">
              A senha deve conter:
            </p>
            <ul className="flex flex-col gap-1">
              {[
                { label: 'Pelo menos 6 caracteres', met: newPasswordValue.length >= 6 },
                { label: 'Pelo menos uma letra', met: /[A-Za-z]/.test(newPasswordValue) },
                { label: 'Pelo menos um número', met: /[0-9]/.test(newPasswordValue) },
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
                Salvando...
              </>
            ) : (
              'Confirmar'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
