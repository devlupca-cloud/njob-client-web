import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CreditCard, Trash2, Calendar, User, Shield } from 'lucide-react'
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

// ─── Fetch / Mutate ───────────────────────────────────────────────────────────

async function fetchCard(id: string): Promise<SavedCard> {
  const { data, error } = await supabase
    .from('saved_cards')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as SavedCard
}

async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from('saved_cards').delete().eq('id', id)
  if (error) throw error
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatExpiry(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${year}`
}

function brandColor(brand: string): string {
  const b = brand.toLowerCase()
  if (b === 'visa') return 'hsl(220 90% 40%)'
  if (b === 'mastercard') return 'hsl(16 90% 40%)'
  if (b === 'amex') return 'hsl(195 80% 35%)'
  if (b === 'elo') return 'hsl(45 90% 40%)'
  return 'hsl(263 70% 35%)'
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[hsl(var(--border))] last:border-0">
      <div className="w-8 h-8 rounded-lg bg-[hsl(var(--secondary))] flex items-center justify-center text-[hsl(var(--primary))] shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
        <p className="text-sm font-medium text-[hsl(var(--foreground))] mt-0.5">{value}</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CardDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: card, isLoading, isError } = useQuery({
    queryKey: ['card', id],
    queryFn: () => fetchCard(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCard(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-cards', user?.id] })
      navigate('/payments/cards', { replace: true })
    },
  })

  function handleDeleteClick() {
    if (confirmDelete) {
      deleteMutation.mutate()
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 4000)
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] px-4 pt-4 pb-3">
        <div className="relative flex items-center justify-center h-7">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-7 h-7 flex items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
            aria-label="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">
            Detalhe do Cartão
          </span>
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
            Cartão não encontrado.
          </p>
        </div>
      )}

      {/* Content */}
      {card && !isLoading && (
        <main className="flex-1 px-4 py-6 flex flex-col gap-6">

          {/* Visual do cartão */}
          <div
            className="relative w-full h-44 rounded-2xl overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${brandColor(card.brand)}, hsl(263 70% 15%))`,
            }}
          >
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 50%)',
              }}
            />

            <div className="relative z-10 flex flex-col justify-between h-full p-5">
              {/* Topo */}
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <CreditCard size={20} className="text-white" />
                </div>
                <div className="flex items-center gap-2">
                  {card.is_default && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">
                      PADRÃO
                    </span>
                  )}
                  <span className="text-white/70 text-sm font-bold uppercase tracking-widest">
                    {card.brand}
                  </span>
                </div>
              </div>

              {/* Número mascarado */}
              <div>
                <p className="font-mono text-white text-lg tracking-[0.2em]">
                  •••• •••• •••• {card.last4}
                </p>
              </div>

              {/* Nome e validade */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] text-white/50 uppercase tracking-wider">Titular</p>
                  <p className="text-white text-sm font-semibold mt-0.5 uppercase">
                    {card.holder_name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/50 uppercase tracking-wider">Validade</p>
                  <p className="text-white text-sm font-semibold mt-0.5">
                    {formatExpiry(card.exp_month, card.exp_year)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Informações */}
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl px-4">
            <InfoRow
              icon={<Shield size={16} />}
              label="Bandeira"
              value={card.brand.charAt(0).toUpperCase() + card.brand.slice(1)}
            />
            <InfoRow
              icon={<CreditCard size={16} />}
              label="Número"
              value={`•••• •••• •••• ${card.last4}`}
            />
            <InfoRow
              icon={<User size={16} />}
              label="Titular"
              value={card.holder_name}
            />
            <InfoRow
              icon={<Calendar size={16} />}
              label="Validade"
              value={formatExpiry(card.exp_month, card.exp_year)}
            />
          </div>

          {/* Erro da exclusão */}
          {deleteMutation.isError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <p className="text-xs text-red-400">
                Erro ao remover cartão. Tente novamente.
              </p>
            </div>
          )}

          {/* Botão remover */}
          <button
            onClick={handleDeleteClick}
            disabled={deleteMutation.isPending}
            className={`w-full h-12 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors mt-auto ${
              confirmDelete
                ? 'bg-red-500 text-white'
                : 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
            } disabled:opacity-50`}
          >
            {deleteMutation.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Removendo...
              </>
            ) : (
              <>
                <Trash2 size={16} />
                {confirmDelete ? 'Confirmar remoção' : 'Remover cartão'}
              </>
            )}
          </button>

          {confirmDelete && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] text-center -mt-4">
              Clique novamente para confirmar a remoção.
            </p>
          )}
        </main>
      )}
    </div>
  )
}
