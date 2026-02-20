import { useState, useMemo, useDeferredValue } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, Search, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import Logo from '@/components/ui/Logo'
import { supabase } from '@/lib/supabase'
import type { Creator } from '@/types'
import CardCreator, { CardCreatorSkeleton } from '@/components/cards/CardCreator'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreatorFromRPC {
  id: string
  nome: string
  genero: string | null
  status: string | null
  foto_perfil: string | null
  data_criacao: string
  vende_conteudo: boolean
  quantidade_likes: number
  faz_encontro_presencial: boolean
}

// ─── Filters ──────────────────────────────────────────────────────────────────

type FilterKey = 'todos' | 'online' | 'lives' | 'conteudo' | 'presencial' | 'mulheres' | 'homens'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'online', label: 'Online' },
  { key: 'lives', label: 'Lives' },
  { key: 'conteudo', label: 'Conteúdo' },
  { key: 'presencial', label: 'Presencial' },
  { key: 'mulheres', label: 'Mulheres' },
  { key: 'homens', label: 'Homens' },
]

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCreators(): Promise<Creator[]> {
  const { data, error } = await supabase.rpc('get_creators_status')
  if (error) throw error

  return (data ?? []).map((row: CreatorFromRPC): Creator => ({
    id: row.id,
    nome: row.nome,
    status: row.status,
    foto_perfil: row.foto_perfil,
    data_criacao: row.data_criacao,
    live_hoje: false,
    live_horario: null,
    vende_conteudo: row.vende_conteudo,
    quantidade_likes: row.quantidade_likes,
    faz_encontro_presencial: row.faz_encontro_presencial,
    valor_1_hora: 0,
    valor_30_min: 0,
    faz_chamada_video: false,
    genero: row.genero,
    descricao: null,
    imagens: [],
    documents: [],
    proxima_live: null,
    curtiu: false,
    notificacoes: null,
    favorito: false,
  }))
}

// ─── Skeleton grid ────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 px-4 pt-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <CardCreatorSkeleton key={i} />
      ))}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center">
        <Users size={28} className="text-[hsl(var(--muted-foreground))]" />
      </div>
      <div>
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">
          {query ? `Nenhum resultado para "${query}"` : 'Nenhum creator encontrado'}
        </p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
          {query ? 'Tente buscar por outro nome.' : 'Volte mais tarde para ver novos perfis.'}
        </p>
      </div>
    </div>
  )
}

// ─── Filter pill ─────────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors duration-150
        ${
          active
            ? 'bg-[hsl(var(--primary))] text-white'
            : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
        }
      `}
    >
      {label}
    </button>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-bold text-[hsl(var(--foreground))] px-4 mb-3">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 px-4">
        {children}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('todos')

  const { data: creators, isLoading, isError } = useQuery({
    queryKey: ['creators'],
    queryFn: fetchCreators,
    staleTime: 1000 * 60 * 2, // 2 min
  })

  // ── Seções de creators ───────────────────────────────────────────────────

  const sections = useMemo(() => {
    if (!creators) return { popular: [], novos: [], online: [], emLive: [] }

    return {
      popular: [...creators].sort((a, b) => b.quantidade_likes - a.quantidade_likes).slice(0, 12),
      novos: [...creators].sort((a, b) => b.data_criacao.localeCompare(a.data_criacao)).slice(0, 12),
      online: creators.filter((c) => c.status === 'online'),
      emLive: creators.filter((c) => c.status === 'em live'),
    }
  }, [creators])

  // ── Filter + search ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!creators) return []

    let list = creators

    // Text search (debounced via useDeferredValue)
    const q = deferredSearch.trim().toLowerCase()
    if (q) {
      list = list.filter((c) => c.nome.toLowerCase().includes(q))
    }

    // Category filter
    switch (activeFilter) {
      case 'online':
        list = list.filter((c) => c.status === 'online')
        break
      case 'lives':
        list = list.filter((c) => c.status === 'em live')
        break
      case 'conteudo':
        list = list.filter((c) => c.vende_conteudo)
        break
      case 'presencial':
        list = list.filter((c) => c.faz_encontro_presencial)
        break
      case 'mulheres':
        list = list.filter((c) => c.genero?.toLowerCase() === 'mulher')
        break
      case 'homens':
        list = list.filter((c) => c.genero?.toLowerCase() === 'homem')
        break
    }

    return list
  }, [creators, deferredSearch, activeFilter])

  const hasActiveFilterOrSearch = activeFilter !== 'todos' || deferredSearch.trim() !== ''

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-3 flex flex-col gap-3">

        {/* Logo + notification */}
        <div className="flex items-center justify-between">
          <Logo size="sm" variant="image" className="rounded-xl" />

          <Link
            to="/notifications"
            className="relative w-9 h-9 flex items-center justify-center rounded-full bg-[hsl(var(--card))]"
            aria-label="Notificações"
          >
            <Bell size={18} className="text-[hsl(var(--foreground))]" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[hsl(var(--primary))]" />
          </Link>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] pointer-events-none"
          />
          <input
            type="search"
            placeholder="Buscar creators..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="
              w-full h-10 pl-9 pr-4 rounded-full text-sm
              bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]
              placeholder:text-[hsl(var(--muted-foreground))]
              border border-[hsl(var(--border))]
              focus:outline-none focus:border-[hsl(var(--primary))]
              transition-colors duration-150
            "
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5 -mx-1 px-1">
          {FILTERS.map((f) => (
            <FilterPill
              key={f.key}
              label={f.label}
              active={activeFilter === f.key}
              onClick={() =>
                setActiveFilter((prev) => (prev === f.key ? 'todos' : f.key))
              }
            />
          ))}
        </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full">

        {/* Loading */}
        {isLoading && <SkeletonGrid />}

        {/* Error */}
        {isError && !isLoading && (
          <div className="flex items-center justify-center py-16 px-8 text-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Erro ao carregar creators. Tente novamente mais tarde.
            </p>
          </div>
        )}

        {/* Results */}
        {!isLoading && !isError && (
          <>
            {hasActiveFilterOrSearch ? (
              /* Modo filtrado — grid plano */
              filtered.length === 0 ? (
                <EmptyState query={search} />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4">
                  {filtered.map((creator) => (
                    <CardCreator key={creator.id} creator={creator} />
                  ))}
                </div>
              )
            ) : (
              /* Modo padrão — seções */
              <div className="flex flex-col gap-6 py-4">
                {/* Em Live */}
                {sections.emLive.length > 0 && (
                  <Section title="Ao vivo agora">
                    {sections.emLive.map((c) => (
                      <CardCreator key={c.id} creator={c} />
                    ))}
                  </Section>
                )}

                {/* Online */}
                {sections.online.length > 0 && (
                  <Section title="Online agora">
                    {sections.online.map((c) => (
                      <CardCreator key={c.id} creator={c} />
                    ))}
                  </Section>
                )}

                {/* Mais populares */}
                {sections.popular.length > 0 && (
                  <Section title="Mais populares">
                    {sections.popular.map((c) => (
                      <CardCreator key={c.id} creator={c} />
                    ))}
                  </Section>
                )}

                {/* Novos */}
                {sections.novos.length > 0 && (
                  <Section title="Novos na plataforma">
                    {sections.novos.map((c) => (
                      <CardCreator key={c.id} creator={c} />
                    ))}
                  </Section>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
