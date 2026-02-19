import { Link, useLocation } from 'react-router-dom'
import { Home, MessageCircle, Bell, User, ShoppingBag } from 'lucide-react'

const navItems = [
  { icon: Home,          label: 'Home',     path: '/home' },
  { icon: MessageCircle, label: 'Chat',     path: '/chat' },
  { icon: ShoppingBag,   label: 'Compras',  path: '/purchases' },
  { icon: Bell,          label: 'Alertas',  path: '/notifications' },
  { icon: User,          label: 'Perfil',   path: '/profile' },
]

export default function NavBar() {
  const { pathname } = useLocation()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 pb-safe"
      style={{ background: '#141018', borderTop: '1px solid #262D34' }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
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
  )
}
