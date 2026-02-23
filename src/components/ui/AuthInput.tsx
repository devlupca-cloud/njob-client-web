import { forwardRef, useState } from 'react'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  ({ label, error, hint, type, className, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === 'password'
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type

    return (
      <div className="flex flex-col gap-1.5 w-full">
        <label className="text-sm font-semibold text-[hsl(var(--foreground))]">
          {label}
        </label>

        <div className="relative flex items-center">
          <input
            ref={ref}
            type={inputType}
            {...props}
            className={[
              'w-full h-12 px-4 rounded-[var(--radius)] text-sm outline-none transition-all duration-200',
              'bg-[hsl(var(--input))] text-[hsl(var(--foreground))]',
              'border border-[hsl(var(--border))]',
              'placeholder:text-[hsl(var(--muted-foreground))]',
              'focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/0.25)]',
              error
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500/25'
                : '',
              isPassword ? 'pr-12' : '',
              className ?? '',
            ]
              .filter(Boolean)
              .join(' ')}
          />

          {isPassword && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors p-1"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>

        {hint && !error && (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>
        )}

        {error && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <AlertCircle size={12} />
            {error}
          </p>
        )}
      </div>
    )
  },
)

AuthInput.displayName = 'AuthInput'
