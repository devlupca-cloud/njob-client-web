import { useRef, useState, useCallback, useEffect, type KeyboardEvent, type ClipboardEvent } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const OTP_LENGTH = 6

export default function VerifyOTPPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const { verifyOtp, sendPasswordResetOtp } = useAuth()

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasError, setHasError] = useState(false)

  // Resend cooldown timer (60 seconds)
  const [cooldown, setCooldown] = useState(60)
  const [canResend, setCanResend] = useState(false)

  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(OTP_LENGTH).fill(null))

  // Start countdown on mount
  useEffect(() => {
    if (cooldown <= 0) {
      setCanResend(true)
      return
    }
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          setCanResend(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatCooldown = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const focusAt = useCallback((index: number) => {
    inputRefs.current[index]?.focus()
  }, [])

  const handleChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(-1)
    const newDigits = [...digits]
    newDigits[index] = cleaned
    setDigits(newDigits)
    setHasError(false)
    setServerError(null)

    if (cleaned && index < OTP_LENGTH - 1) {
      focusAt(index + 1)
    }
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const newDigits = [...digits]
        newDigits[index] = ''
        setDigits(newDigits)
      } else if (index > 0) {
        const newDigits = [...digits]
        newDigits[index - 1] = ''
        setDigits(newDigits)
        focusAt(index - 1)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      focusAt(index - 1)
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      focusAt(index + 1)
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    const newDigits = [...digits]
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i]
    }
    setDigits(newDigits)
    const nextIndex = Math.min(pasted.length, OTP_LENGTH - 1)
    focusAt(nextIndex)
  }

  const isComplete = digits.every((d) => d !== '')
  const otp = digits.join('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isComplete || isSubmitting) return

    setIsSubmitting(true)
    setServerError(null)
    setHasError(false)

    try {
      await verifyOtp(email, otp)
      navigate('/new-password', { replace: true })
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Código inválido. Tente novamente.'
      setHasError(true)
      setServerError(
        message.toLowerCase().includes('token') ||
          message.toLowerCase().includes('otp') ||
          message.toLowerCase().includes('expired') ||
          message.toLowerCase().includes('invalid')
          ? 'Código inválido ou expirado. Solicite um novo código.'
          : message,
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (!canResend || !email) return
    try {
      await sendPasswordResetOtp(email)
      setCanResend(false)
      setCooldown(60)
      setDigits(Array(OTP_LENGTH).fill(''))
      setServerError(null)
      setHasError(false)
      focusAt(0)

      // Restart countdown
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            setCanResend(true)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch {
      // silently ignore resend errors
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm sm:max-w-md flex flex-col gap-8">

        {/* Back button */}
        <Link
          to="/forgot-password"
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
          Voltar
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
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.06 6.06l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] tracking-tight">
              Verificação de código
            </h1>
            <p className="text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
              Insira o código de 6 dígitos enviado para{' '}
              {email ? (
                <span className="font-semibold text-[hsl(var(--foreground))]">{email}</span>
              ) : (
                'seu e-mail'
              )}
              .
            </p>
          </div>
        </div>

        {/* OTP Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-8" noValidate>

          {/* PIN inputs */}
          <div className="flex gap-2 justify-between">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el }}
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                onFocus={(e) => e.target.select()}
                autoFocus={index === 0}
                className={[
                  'w-12 h-14 rounded-[var(--radius)] text-center text-xl font-bold outline-none transition-all duration-200',
                  'bg-[hsl(var(--input))] text-[hsl(var(--foreground))]',
                  'border-2 focus:ring-2',
                  hasError
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/25'
                    : digit
                      ? 'border-[hsl(var(--primary))] focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary)/0.25)]'
                      : 'border-[hsl(var(--border))] focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary)/0.25)]',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
            ))}
          </div>

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
            disabled={!isComplete || isSubmitting}
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
                Verificando...
              </>
            ) : (
              'Confirmar'
            )}
          </button>
        </form>

        {/* Resend section */}
        <div className="flex flex-col items-center gap-2">
          {canResend ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Não recebeu nenhum código?{' '}
              <button
                type="button"
                onClick={handleResend}
                className="font-bold text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] transition-colors"
              >
                Enviar novamente
              </button>
            </p>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Solicite novo código em{' '}
              <span className="font-semibold text-[hsl(var(--foreground))] tabular-nums underline">
                {formatCooldown(cooldown)}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
