import { cn } from '@/lib/utils'

// ─── Base Skeleton ────────────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string
}

function SkeletonBase({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-[hsl(var(--secondary))] rounded',
        className,
      )}
    />
  )
}

// ─── Avatar skeleton ──────────────────────────────────────────────────────────

function Avatar({ size = 40 }: { size?: number }) {
  return (
    <div
      className="animate-pulse bg-[hsl(var(--secondary))] rounded-full shrink-0"
      style={{ width: size, height: size }}
    />
  )
}

// ─── Card skeleton ────────────────────────────────────────────────────────────

function Card() {
  return (
    <div className="rounded-[var(--radius)] bg-[hsl(var(--card))] p-4 flex flex-col gap-3 animate-pulse">
      <div className="h-4 w-2/3 bg-[hsl(var(--secondary))] rounded" />
      <div className="h-3 w-full bg-[hsl(var(--secondary))] rounded" />
      <div className="h-3 w-4/5 bg-[hsl(var(--secondary))] rounded" />
    </div>
  )
}

// ─── ListItem skeleton ────────────────────────────────────────────────────────

function ListItem() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-[hsl(var(--secondary))] shrink-0" />
      {/* Lines */}
      <div className="flex flex-col gap-2 flex-1">
        <div className="h-3.5 w-1/2 bg-[hsl(var(--secondary))] rounded" />
        <div className="h-3 w-3/4 bg-[hsl(var(--secondary))] rounded" />
      </div>
      {/* Right label */}
      <div className="h-3 w-8 bg-[hsl(var(--secondary))] rounded shrink-0" />
    </div>
  )
}

// ─── Compose ─────────────────────────────────────────────────────────────────

const Skeleton = Object.assign(SkeletonBase, { Avatar, Card, ListItem })

export { Skeleton }
export default Skeleton
