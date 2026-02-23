import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * TODO: Implementar fluxo de checkout completo.
 * Esta pagina e um placeholder que redireciona o usuario
 * enquanto o pagamento e processado via Stripe Checkout (redirect externo).
 */
export default function CheckoutPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const status = searchParams.get('status')
  const { t } = useTranslation()

  useEffect(() => {
    // Se retornou do Stripe com sucesso, redireciona para compras
    if (status === 'success') {
      const timer = setTimeout(() => navigate('/purchases', { replace: true }), 2000)
      return () => clearTimeout(timer)
    }
    // Se cancelou, volta para a pagina anterior
    if (status === 'cancel') {
      navigate(-1)
    }
  }, [status, navigate])

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">
      <main className="flex-1 flex flex-col items-center justify-center px-8 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--primary))]" />
        <p className="text-sm text-[hsl(var(--muted-foreground))] text-center">
          {status === 'success'
            ? t('checkout.success', 'Pagamento confirmado! Redirecionando...')
            : t('checkout.processing', 'Processando pagamento...')}
        </p>
      </main>
    </div>
  )
}
