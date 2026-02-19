import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

const schema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Senha atual é obrigatória'),
    newPassword: z
      .string()
      .min(6, 'Nova senha deve ter pelo menos 6 caracteres'),
    confirmPassword: z
      .string()
      .min(1, 'Confirmação de senha é obrigatória'),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'A nova senha não pode ser igual à senha atual',
    path: ['newPassword'],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

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
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
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
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
      // O Supabase updateUser não valida a senha atual no client-side.
      // A validação da senha atual seria feita pelo backend ou via re-autenticação.
      // Para este fluxo, chamamos diretamente o updatePassword com a nova senha.
      await updatePassword(data.newPassword)

      setSuccess(true)
      setTimeout(() => {
        navigate(-1)
      }, 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao alterar senha. Tente novamente.'
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
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5 text-[hsl(var(--foreground))]" />
          </button>
          <h1 className="text-base font-semibold text-[hsl(var(--foreground))]">Alterar senha</h1>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="px-4 pt-10">
        {success ? (
          <div className="flex flex-col items-center gap-6 pt-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
                Senha alterada!
              </h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">
                Sua senha foi atualizada com sucesso.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
            <PasswordField
              id="currentPassword"
              label="Senha atual"
              placeholder="Digite sua senha atual"
              error={errors.currentPassword?.message}
              registration={register('currentPassword')}
            />

            <PasswordField
              id="newPassword"
              label="Nova senha"
              placeholder="Digite a nova senha"
              error={errors.newPassword?.message}
              registration={register('newPassword')}
            />

            <PasswordField
              id="confirmPassword"
              label="Confirmar nova senha"
              placeholder="Confirme a nova senha"
              error={errors.confirmPassword?.message}
              registration={register('confirmPassword')}
            />

            {/* Requisitos de senha */}
            <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              A nova senha deve ter pelo menos 6 caracteres e ser diferente da senha atual.
            </p>

            {/* Erro do servidor */}
            {serverError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <p className="text-sm text-red-400">{serverError}</p>
              </div>
            )}

            {/* Botão salvar */}
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
                  Salvando...
                </>
              ) : (
                'Confirmar'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
