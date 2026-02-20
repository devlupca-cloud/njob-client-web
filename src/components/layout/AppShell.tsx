import { Outlet } from 'react-router-dom'
import NavBar from './NavBar'

export default function AppShell() {
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[hsl(var(--background))]">
      <NavBar />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0 md:ml-20">
        <div className="max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
