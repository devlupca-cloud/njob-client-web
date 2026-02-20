import { Link, useLocation } from 'react-router-dom'
import { Home, User, ShoppingBag } from 'lucide-react'
import Logo from '@/components/ui/Logo'

const navItems = [
  { icon: Home,          label: 'Home',     path: '/home' },
  // { icon: MessageCircle, label: 'Chat',     path: '/chat' },
  { icon: ShoppingBag,   label: 'Compras',  path: '/purchases' },
  // { icon: Bell,          label: 'Alertas',  path: '/notifications' },
  { icon: User,          label: 'Perfil',   path: '/profile' },
]

export default function NavBar() {
  const { pathname } = useLocation()

  return (
    <>
      {/* ── Mobile: bottom nav ─────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 pb-safe flex md:hidden"
        style={{ background: '#141018', borderTop: '1px solid #262D34' }}
      >
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2 w-full">
          {navItems.map(({ icon: Icon, label, path }) => {
            const isActive = pathname.startsWith(path)
            return (
              <Link
                key={path}
                to={path}
                className="flex flex-col items-center gap-1 min-w-[56px] py-1 rounded-xl transition-colors"
              >
                <Icon
                  size={22}
                  style={{ color: isActive ? '#C980FF' : '#A7A7A7' }}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <span
                  className="text-[10px] font-medium leading-none"
                  style={{ color: isActive ? '#C980FF' : '#A7A7A7' }}
                >
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* ── Desktop: sidebar ───────────────────────────────────────────── */}
      <nav
        className="hidden md:flex fixed top-0 left-0 h-screen w-20 z-50 flex-col items-center py-6 gap-8"
        style={{ background: '#141018', borderRight: '1px solid #262D34' }}
      >
        {/* Logo */}
        <Logo size="sm" variant="image" className="rounded-xl mb-2" />

        {/* Nav items */}
        <div className="flex flex-col items-center gap-1 flex-1">
          {navItems.map(({ icon: Icon, label, path }) => {
            const isActive = pathname.startsWith(path)
            return (
              <Link
                key={path}
                to={path}
                title={label}
                className="group relative flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-colors hover:bg-white/5"
              >
                <Icon
                  size={22}
                  style={{ color: isActive ? '#C980FF' : '#A7A7A7' }}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <span
                  className="text-[10px] font-medium leading-none mt-1"
                  style={{ color: isActive ? '#C980FF' : '#A7A7A7' }}
                >
                  {label}
                </span>

                {/* Tooltip */}
                <span className="absolute left-full ml-2 px-2 py-1 rounded-md text-xs font-medium text-white bg-[hsl(var(--popover))] border border-[hsl(var(--border))] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
