// ─── Types ────────────────────────────────────────────────────────────────────

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface AvatarProps {
  src?: string | null
  name?: string | null
  size?: AvatarSize
  showOnline?: boolean
  isOnline?: boolean
  className?: string
}

// ─── Size map ─────────────────────────────────────────────────────────────────

const sizeMap: Record<AvatarSize, { px: number; text: string; dot: string }> = {
  xs: { px: 24,  text: 'text-[10px]', dot: 'w-2 h-2 border' },
  sm: { px: 32,  text: 'text-xs',     dot: 'w-2.5 h-2.5 border' },
  md: { px: 40,  text: 'text-sm',     dot: 'w-3 h-3 border-2' },
  lg: { px: 56,  text: 'text-base',   dot: 'w-3.5 h-3.5 border-2' },
  xl: { px: 80,  text: 'text-xl',     dot: 'w-4 h-4 border-2' },
}

// ─── Gradient from name ───────────────────────────────────────────────────────

const GRADIENTS = [
  'from-violet-600 to-purple-800',
  'from-rose-500 to-pink-700',
  'from-amber-500 to-orange-700',
  'from-emerald-500 to-teal-700',
  'from-sky-500 to-blue-700',
  'from-fuchsia-500 to-purple-700',
]

function gradientFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Avatar({
  src,
  name,
  size = 'md',
  showOnline = false,
  isOnline = false,
  className = '',
}: AvatarProps) {
  const { px, text, dot } = sizeMap[size]
  const initials = name ? getInitials(name) : '?'
  const gradient = name ? gradientFromName(name) : 'from-gray-500 to-gray-700'

  return (
    <div
      className={`relative inline-flex shrink-0 ${className}`}
      style={{ width: px, height: px }}
    >
      {src ? (
        <img
          src={src}
          alt={name ?? 'Avatar'}
          draggable={false}
          className="w-full h-full rounded-full object-cover select-none"
        />
      ) : (
        <div
          className={`w-full h-full rounded-full bg-gradient-to-br ${gradient}
            flex items-center justify-center select-none`}
        >
          <span className={`font-bold text-white leading-none ${text}`}>
            {initials}
          </span>
        </div>
      )}

      {/* Online indicator */}
      {showOnline && (
        <span
          className={`absolute bottom-0 right-0 rounded-full
            border-[hsl(var(--background))]
            ${dot}
            ${isOnline ? 'bg-emerald-500' : 'bg-[hsl(var(--muted-foreground))]'}`}
        />
      )}
    </div>
  )
}
