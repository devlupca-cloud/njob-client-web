interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'image' | 'text'
  className?: string
}

const sizes = {
  sm: 32,
  md: 48,
  lg: 72,
  xl: 120,
}

export default function Logo({ size = 'md', variant = 'image', className = '' }: LogoProps) {
  const px = sizes[size]

  if (variant === 'text') {
    return (
      <span
        className={`font-display font-black tracking-tight ${className}`}
        style={{ fontSize: px * 0.5 }}
      >
        <span className="text-gradient-brand">NJ</span>
        <span style={{ color: '#C980FF' }}>Ob</span>
      </span>
    )
  }

  return (
    <img
      src="/logo.jpg"
      alt="NJOb"
      width={px}
      height={px}
      className={`rounded-2xl object-contain ${className}`}
      style={{ width: px, height: px }}
    />
  )
}
