import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function CheckoutPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const type = searchParams.get('type')

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
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">Checkout</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-8">
        <p className="text-sm text-[hsl(var(--muted-foreground))] text-center">
          Processando pagamento{type ? ` (${type})` : ''}...
        </p>
      </main>
    </div>
  )
}
