import { Outlet } from 'react-router-dom'
import NavBar from './NavBar'

export default function AppShell() {
  return (
    <div className="flex flex-col min-h-screen bg-[hsl(var(--background))]">
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <NavBar />
    </div>
  )
}
