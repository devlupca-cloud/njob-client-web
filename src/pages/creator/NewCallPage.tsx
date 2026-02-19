import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Video } from 'lucide-react'

export default function NewCallPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const creatorId = searchParams.get('creatorId')

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
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">Nova chamada</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-8">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <Video size={28} className="text-emerald-500" />
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Iniciando chamada de video...
          </p>
        </div>
      </main>
    </div>
  )
}
