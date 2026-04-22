import { Link } from 'react-router-dom'
import { LegalDocument } from '@/components/legal/LegalDocument'
import { TERMS_OF_USE_MD } from '@/lib/legal/documents'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[hsl(var(--background))]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link
          to="/"
          className="text-sm text-[hsl(var(--primary))] hover:underline"
        >
          ← Voltar
        </Link>
        <div className="mt-6">
          <LegalDocument markdown={TERMS_OF_USE_MD} />
        </div>
      </div>
    </main>
  )
}
