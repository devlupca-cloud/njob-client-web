import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, CreditCard, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SavedCard {
  id: string
  user_id: string
  last4: string
  brand: string
  exp_month: number
  exp_year: number
  holder_name: string
  is_default: boolean
  created_at: string
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchSavedCards(userId: string): Promise<SavedCard[]> {
  const { data, error } = await supabase
    .from('saved_cards')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as SavedCard[]
}

async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from('saved_cards').delete().eq('id', id)
  if (error) throw error
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


function formatExpiry(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`
}

// ─── Card Item ────────────────────────────────────────────────────────────────

function CardItem({
  card,
  onDelete,
  onClick,
}: {
  card: SavedCard
  onDelete: (id: string) => void
  onClick: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirmDelete) {
      onDelete(card.id)
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 bg-[hsl(var(--card))] border rounded-xl px-4 py-3 cursor-pointer active:scale-[0.98] transition-all ${
        card.is_default
          ? 'border-[hsl(var(--primary)/0.5)]'
          : 'border-[hsl(var(--border))]'
      }`}
    >
      {/* Ícone */}
      <div className="w-10 h-10 rounded-lg bg-[hsl(var(--secondary))] flex items-center justify-center shrink-0">
        <CreditCard size={20} className="text-[hsl(var(--primary))]" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))] capitalize">
            {card.brand}
          </span>
          {card.is_default && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]">
              PADRÃO
            </span>
          )}
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
          •••• •••• •••• {card.last4} &nbsp;·&nbsp; {formatExpiry(card.exp_month, card.exp_year)}
        </p>
      </div>

      {/* Botão remover */}
      <button
        onClick={handleDelete}
        className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
          confirmDelete
            ? 'bg-red-500/20 text-red-400'
            : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-red-400'
        }`}
        aria-label="Remover cartão"
        title={confirmDelete ? 'Clique novamente para confirmar' : 'Remover cartão'}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center">
        <CreditCard size={28} className="text-[hsl(var(--muted-foreground))]" />
      </div>
      <div>
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">Nenhum cartão cadastrado</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
          Adicione um cartão para facilitar seus pagamentos.
        </p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 bg-[hsl(var(--primary))] text-white rounded-xl text-sm font-semibold"
      >
        <Plus size={16} />
        Adicionar cartão
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SavedCardsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const { data: cards, isLoading, isError } = useQuery({
    queryKey: ['saved-cards', user?.id],
    queryFn: () => fetchSavedCards(user!.id),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-cards', user?.id] })
    },
  })

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="relative flex items-center justify-center h-7 max-w-2xl mx-auto px-4 pt-4 pb-3">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-7 h-7 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
            aria-label="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">
            Cartões de Pagamento
          </span>
          <button
            onClick={() => navigate('/payments/cards/new')}
            className="absolute right-0 w-7 h-7 flex items-center justify-center rounded-full bg-[hsl(var(--primary))] text-white"
            aria-label="Adicionar cartão"
          >
            <Plus size={16} />
          </button>
        </div>
      </header>

      {/* Loading */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex-1 flex items-center justify-center px-8">
          <p className="text-sm text-[hsl(var(--muted-foreground))] text-center">
            Erro ao carregar cartões. Tente novamente.
          </p>
        </div>
      )}

      {/* Content */}
      {!isLoading && !isError && (
        <main className="flex-1 px-4 py-4 max-w-2xl mx-auto w-full">
          {!cards || cards.length === 0 ? (
            <EmptyState onAdd={() => navigate('/payments/cards/new')} />
          ) : (
            <div className="flex flex-col gap-3">
              {deleteMutation.isError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                  <p className="text-xs text-red-400">Erro ao remover cartão. Tente novamente.</p>
                </div>
              )}

              {cards.map((card) => (
                <CardItem
                  key={card.id}
                  card={card}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  onClick={() => navigate(`/payments/cards/${card.id}`)}
                />
              ))}

              <button
                onClick={() => navigate('/payments/cards/new')}
                className="flex items-center justify-center gap-2 w-full py-3 border border-dashed border-[hsl(var(--border))] rounded-xl text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary)/0.5)] transition-colors mt-2"
              >
                <Plus size={16} />
                Adicionar novo cartão
              </button>
            </div>
          )}
        </main>
      )}
    </div>
  )
}
