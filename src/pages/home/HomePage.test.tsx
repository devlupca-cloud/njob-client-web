import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useAuthStore } from '@/store/authStore'

const mocks = vi.hoisted(() => ({
  rpcFn: vi.fn(),
  fromFn: vi.fn(),
  useQuery: vi.fn(),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'pt-BR' } }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/components/ui/AgeVerificationModal', () => ({
  default: () => null,
  useAgeVerification: () => ({ verified: true, confirm: vi.fn() }),
}))

vi.mock('@/components/cards/CardCreator', () => ({
  default: ({ creator }: { creator: { nome: string } }) => (
    <div data-testid="creator-card">{creator.nome}</div>
  ),
  CardCreatorSkeleton: () => <div data-testid="skeleton-card" />,
}))

vi.mock('@/components/ui/Logo', () => ({
  default: () => <div data-testid="logo" />,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpcFn(...args),
    from: mocks.fromFn,
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mocks.useQuery(...args),
  useQueryClient: () => mocks.useQueryClient(),
  keepPreviousData: true,
}))

vi.mock('@/components/ui/GuestModal', () => ({
  useGuestGuard: () => ({ requireAuth: vi.fn() }),
}))

import HomePage from './HomePage'

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.getState().clear()
    useAuthStore.getState().setLoading(false)
  })

  it('renders loading skeletons when query is loading', () => {
    mocks.useQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })

    render(<HomePage />)
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0)
  })

  it('renders creators when data is loaded', () => {
    const creators = [
      { id: '1', nome: 'Creator A', foto_perfil: '', is_online: true, quantidade_likes: 10, data_criacao: '2025-01-01', status: 'online' },
      { id: '2', nome: 'Creator B', foto_perfil: '', is_online: false, quantidade_likes: 5, data_criacao: '2025-02-01', status: 'offline' },
    ]

    mocks.useQuery.mockReturnValue({
      data: creators,
      isLoading: false,
      isError: false,
    })

    render(<HomePage />)
    expect(screen.getAllByText('Creator A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Creator B').length).toBeGreaterThan(0)
  })

  it('renders error state', () => {
    mocks.useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })

    render(<HomePage />)
    expect(screen.getByText('home.loadError')).toBeDefined()
  })
})
