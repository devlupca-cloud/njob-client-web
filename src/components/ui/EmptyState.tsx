interface EmptyStateAction {
  label: string
  onClick: () => void
}

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  action?: EmptyStateAction
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      {/* Icon container */}
      <div
        className="flex items-center justify-center w-16 h-16 rounded-full
          bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
      >
        <span className="[&>svg]:w-8 [&>svg]:h-8">{icon}</span>
      </div>

      {/* Text */}
      <div className="flex flex-col gap-1.5 max-w-xs">
        <p className="text-[15px] font-semibold text-[hsl(var(--foreground))]">{title}</p>
        {description && (
          <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {/* Optional action */}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 px-5 py-2.5 rounded-[var(--radius)] text-sm font-semibold
            bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
            hover:opacity-90 active:scale-95 transition-all duration-150"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
