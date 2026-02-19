import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Radio } from 'lucide-react'

export default function LivePage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] px-4 pt-4 pb-3">
        <div className="relative flex items-center justify-center h-7">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-7 h-7 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
            aria-label="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-red-500" />
            <span className="text-base font-semibold text-[hsl(var(--foreground))]">Live</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-8">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <Radio size={28} className="text-red-500" />
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Conectando à live...
          </p>
        </div>
      </main>
    </div>
  )
}
