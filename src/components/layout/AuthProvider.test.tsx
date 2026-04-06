import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'

type AuthCallback = (event: string, session: unknown) => Promise<void>
let authCallback: AuthCallback | null = null

const mocks = vi.hoisted(() => ({
  profileSelect: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthCallback) => {
        authCallback = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mocks.profileSelect,
        }),
      }),
    }),
  },
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import AuthProvider from './AuthProvider'

function makeSession(userId = 'user-1') {
  return { user: { id: userId }, access_token: 'tok' }
}

function makeProfile(id = 'user-1') {
  return { id, full_name: 'Test', role: 'consumer' }
}

function renderProvider() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <div>child</div>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authCallback = null
    useAuthStore.getState().clear()
    mocks.profileSelect.mockResolvedValue({ data: makeProfile(), error: null })
  })

  it('captures onAuthStateChange callback on mount', () => {
    renderProvider()
    expect(authCallback).toBeTypeOf('function')
  })

  it('INITIAL_SESSION with session loads profile and sets isLoading=false', async () => {
    renderProvider()
    await act(async () => {
      await authCallback!('INITIAL_SESSION', makeSession())
    })
    const s = useAuthStore.getState()
    expect(s.profile?.id).toBe('user-1')
    expect(s.isLoading).toBe(false)
  })

  it('INITIAL_SESSION without session sets isLoading=false', async () => {
    renderProvider()
    await act(async () => {
      await authCallback!('INITIAL_SESSION', null)
    })
    expect(useAuthStore.getState().profile).toBeNull()
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('SIGNED_OUT clears store', async () => {
    renderProvider()
    useAuthStore.getState().setProfile(makeProfile() as never)
    useAuthStore.getState().setLoading(false)
    await act(async () => {
      await authCallback!('SIGNED_OUT', null)
    })
    expect(useAuthStore.getState().session).toBeNull()
    expect(useAuthStore.getState().profile).toBeNull()
  })

  it('SIGNED_IN loads profile', async () => {
    renderProvider()
    useAuthStore.getState().setLoading(false)
    await act(async () => {
      await authCallback!('SIGNED_IN', makeSession())
    })
    expect(useAuthStore.getState().isLoading).toBe(false)
    expect(useAuthStore.getState().profile?.id).toBe('user-1')
  })

  it('TOKEN_REFRESHED updates session', async () => {
    renderProvider()
    await act(async () => {
      await authCallback!('TOKEN_REFRESHED', makeSession('user-2'))
    })
    expect(useAuthStore.getState().session).toBeTruthy()
  })
})
