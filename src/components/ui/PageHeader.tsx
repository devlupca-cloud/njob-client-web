import { ChevronLeft } from 'lucide-react'

interface PageHeaderProps {
  title: string
  onBack?: () => void
  rightAction?: React.ReactNode
}

export default function PageHeader({ title, onBack, rightAction }: PageHeaderProps) {
  return (
    <header
      className="sticky top-0 z-40
        bg-[hsl(var(--card)/0.85)] backdrop-blur-md
        border-b border-[hsl(var(--border))]"
    >
      <div className="h-14 flex items-center px-4 max-w-3xl mx-auto">
      {/* Left slot */}
      <div className="w-10 flex items-center justify-start shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Voltar"
            className="flex items-center justify-center w-9 h-9 rounded-full
              text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]
              hover:bg-[hsl(var(--secondary))] active:scale-95
              transition-all duration-150"
          >
            <ChevronLeft size={22} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {/* Center title */}
      <h1 className="flex-1 text-center text-[15px] font-semibold text-[hsl(var(--foreground))] truncate px-2">
        {title}
      </h1>

      {/* Right slot */}
      <div className="w-10 flex items-center justify-end shrink-0">
        {rightAction ?? null}
      </div>
      </div>
    </header>
  )
}
