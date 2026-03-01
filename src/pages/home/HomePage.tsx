import { useState, useMemo, useDeferredValue } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Search, Users, RefreshCw } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Creator } from '@/types'
import CardCreator, { CardCreatorSkeleton } from '@/components/cards/CardCreator'
import { useTranslation } from 'react-i18next'

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

// ─── Fetch ────────────────────────────────────────────────────────────────────

/** Timeout wrapper — rejects if the promise takes longer than `ms` */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), ms),
    ),
  ])
}

async function fetchCreators(userId?: string): Promise<Creator[]> {
  // Executar queries — cada uma com timeout e fallback independente
  const rpcPromise = withTimeout(
    Promise.resolve(supabase.rpc('get_creators_status')),
    15000,
  )
  const profilesPromise = withTimeout(
    Promise.resolve(supabase.from('profiles').select('id, is_active').eq('role', 'creator')),
    10000,
  ).catch((err) => {
    console.warn('[HomePage] profiles query failed:', err)
    return { data: null as null, error: err }
  })
  const likesPromise = userId
    ? withTimeout(
        Promise.resolve(supabase.from('content_likes').select('creator_id').eq('client_id', userId)),
        10000,
      ).catch((err) => {
        console.warn('[HomePage] likes query failed:', err)
        return { data: null as null, error: err }
      })
    : Promise.resolve({ data: [] as { creator_id: string }[], error: null })

  const [rpcRes, profilesRes, likesRes] = await Promise.all([
    rpcPromise,
    profilesPromise,
    likesPromise,
  ])

  if (rpcRes.error) {
    console.error('[HomePage] RPC get_creators_status error:', rpcRes.error)
    throw rpcRes.error
  }
  const rows = (rpcRes.data ?? []) as CreatorFromRPC[]

  if (profilesRes.error) {
    console.warn('[HomePage] profiles query error (using fallback):', profilesRes.error)
  }
  const activeMap = new Map<string, boolean>()
  for (const p of (profilesRes.data ?? []) as { id: string; is_active: boolean | null }[]) {
    activeMap.set(p.id, p.is_active ?? false)
  }

  if (likesRes.error) {
    console.warn('[HomePage] likes query error (using fallback):', likesRes.error)
  }
  const likedIds = new Set(
    ((likesRes.data ?? []) as { creator_id: string }[]).map((l) => l.creator_id),
  )

  return rows.map((row: CreatorFromRPC): Creator => {
    // Se a RPC diz "em live", manter; senão usar is_active do profiles
    const isActive = activeMap.get(row.id) ?? false
    const status = row.status === 'em live'
      ? 'em live'
      : isActive
        ? 'online'
        : 'offline'

    return {
      id: row.id,
      nome: row.nome,
      status,
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
      curtiu: likedIds.has(row.id),
      notificacoes: null,
      favorito: false,
      whatsapp: null,
    }
  })
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
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center">
        <Users size={28} className="text-[hsl(var(--muted-foreground))]" />
      </div>
      <div>
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">
          {query ? t('home.noResults', { query }) : t('home.noCreators')}
        </p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
          {query ? t('home.tryOtherSearch') : t('home.comeBackLater')}
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
        shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150
        ${
          active
            ? 'bg-[hsl(var(--primary))] text-white shadow-[0_0_12px_hsl(var(--primary)/0.3)]'
            : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.3)]'
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
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.profile)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('todos')

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'todos', label: t('home.filterAll') },
    { key: 'online', label: t('home.filterOnline') },
    { key: 'lives', label: t('home.filterLives') },
    { key: 'conteudo', label: t('home.filterContent') },
    { key: 'presencial', label: t('home.filterInPerson') },
    { key: 'mulheres', label: t('home.filterWomen') },
    { key: 'homens', label: t('home.filterMen') },
  ]

  const queryClient = useQueryClient()

  const { data: creators, isLoading, isError } = useQuery({
    queryKey: ['creators', currentUser?.id ?? 'anon'],
    queryFn: () => fetchCreators(currentUser?.id),
    placeholderData: keepPreviousData,
  })

  const sections = useMemo(() => {
    if (!creators) return { popular: [], novos: [], online: [], emLive: [] }

    return {
      popular: [...creators].sort((a, b) => b.quantidade_likes - a.quantidade_likes).slice(0, 12),
      novos: [...creators].sort((a, b) => b.data_criacao.localeCompare(a.data_criacao)).slice(0, 12),
      online: creators.filter((c) => c.status === 'online'),
      emLive: creators.filter((c) => c.status === 'em live'),
    }
  }, [creators])

  const filtered = useMemo(() => {
    if (!creators) return []

    let list = creators

    const q = deferredSearch.trim().toLowerCase()
    if (q) {
      list = list.filter((c) => c.nome.toLowerCase().includes(q))
    }

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

  return (
    <div className="flex flex-col min-h-full bg-[hsl(var(--background))]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-3 flex flex-col gap-3">

        {/* Logo */}
        <div className="flex items-center justify-between">
          <Logo size="sm" variant="image" className="rounded-xl" />
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] pointer-events-none"
          />
          <input
            type="search"
            placeholder={t('home.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="
              w-full h-10 pl-9 pr-4 rounded-full text-sm
              bg-[hsl(var(--card))] text-[hsl(var(--foreground))]
              placeholder:text-[hsl(var(--muted-foreground))]
              border border-[hsl(var(--border))]
              focus:outline-none focus:border-[hsl(var(--primary)/0.5)]
              focus:shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]
              transition-all duration-150
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
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-8 text-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {t('home.loadError')}
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['creators'] })}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium bg-[hsl(var(--primary))] text-white hover:opacity-90 transition-opacity"
            >
              <RefreshCw size={14} />
              {t('home.retry', 'Tentar novamente')}
            </button>
          </div>
        )}

        {/* Results */}
        {!isLoading && !isError && (
          <>
            {hasActiveFilterOrSearch ? (
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
              <div className="flex flex-col gap-6 py-4">
                {sections.emLive.length > 0 && (
                  <Section title={t('home.sectionLive')}>
                    {sections.emLive.map((c) => (
                      <CardCreator key={c.id} creator={c} />
                    ))}
                  </Section>
                )}

                {sections.online.length > 0 && (
                  <Section title={t('home.sectionOnline')}>
                    {sections.online.map((c) => (
                      <CardCreator key={c.id} creator={c} />
                    ))}
                  </Section>
                )}

                {sections.popular.length > 0 && (
                  <Section title={t('home.sectionPopular')}>
                    {sections.popular.map((c) => (
                      <CardCreator key={c.id} creator={c} />
                    ))}
                  </Section>
                )}

                {sections.novos.length > 0 && (
                  <Section title={t('home.sectionNew')}>
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
