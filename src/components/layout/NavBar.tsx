import { Link, useLocation } from 'react-router-dom'
import { Home, User, ShoppingBag } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import { useGuestGuard } from '@/components/ui/GuestModal'
import { useTranslation } from 'react-i18next'

export default function NavBar() {
  const { pathname } = useLocation()
  const { guardGuestAction } = useGuestGuard()
  const { t } = useTranslation()

  const navItems = [
    { icon: Home,          label: t('nav.home'),      path: '/home',       guestAllowed: true },
    { icon: ShoppingBag,   label: t('nav.purchases'), path: '/purchases',  guestAllowed: false },
    { icon: User,          label: t('nav.profile'),   path: '/profile',    guestAllowed: false },
  ]

  return (
    <>
      {/* ── Mobile: bottom nav ─────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 pb-safe flex md:hidden bg-[hsl(var(--background))] border-t border-[hsl(var(--border))]"
      >
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2 w-full">
          {navItems.map(({ icon: Icon, label, path, guestAllowed }) => {
            const isActive = pathname.startsWith(path)
            return (
              <Link
                key={path}
                to={path}
                onClick={(e) => { if (!guestAllowed && guardGuestAction()) e.preventDefault() }}
                className="flex flex-col items-center gap-1 min-w-[56px] py-1 rounded-xl transition-colors"
              >
                <Icon
                  size={22}
                  className={isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <span
                  className={`text-[10px] font-medium leading-none ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}
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
        className="hidden md:flex fixed top-0 left-0 h-screen w-20 z-50 flex-col items-center py-6 gap-8 bg-[hsl(var(--background))] border-r border-[hsl(var(--border))]"
      >
        {/* Logo */}
        <Logo size="sm" variant="image" className="rounded-xl mb-2" />

        {/* Nav items */}
        <div className="flex flex-col items-center gap-1 flex-1">
          {navItems.map(({ icon: Icon, label, path, guestAllowed }) => {
            const isActive = pathname.startsWith(path)
            return (
              <Link
                key={path}
                to={path}
                title={label}
                onClick={(e) => { if (!guestAllowed && guardGuestAction()) e.preventDefault() }}
                className="group relative flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-colors hover:bg-[hsl(var(--secondary))]"
              >
                <Icon
                  size={22}
                  className={isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <span
                  className={`text-[10px] font-medium leading-none mt-1 ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}
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
