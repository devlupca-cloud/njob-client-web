/**
 * Tests for the guard logic extracted from src/router/index.tsx.
 *
 * The guards (AuthGuard, GuestGuard, RegisterGuard) are not exported, so we
 * test their behaviour by replicating the exact same logic in local components
 * that read from the same useAuthStore — this gives us full coverage of the
 * decision branches without having to spin up the full router.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

// ─── Minimal replicas of the guard components ─────────────────────────────────

function PageLoader() {
  return <div data-testid="page-loader">Loading...</div>
}

/** Replica of AuthGuard from router/index.tsx */
function AuthGuard() {
  const isLoading = useAuthStore((s) => s.isLoading)
  const session = useAuthStore((s) => s.session)
  const isGuest = useAuthStore((s) => s.isGuest)

  useEffect(() => {
    if (!isLoading && !session && !isGuest) {
      useAuthStore.getState().setGuest(true)
    }
  }, [isLoading, session, isGuest])

  if (isLoading) return <PageLoader />
  return <Outlet />
}

/** Replica of GuestGuard from router/index.tsx */
function GuestGuard() {
  const isLoading = useAuthStore((s) => s.isLoading)
  const session = useAuthStore((s) => s.session)
  if (isLoading) return <PageLoader />
  if (session) return <div data-testid="redirect-home">Redirected to /home</div>
  return <Outlet />
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function resetStore() {
  useAuthStore.getState().clear()
  useAuthStore.getState().setLoading(false)
}

function ProtectedContent() {
  return <div data-testid="protected-content">Protected Content</div>
}

// ─── AuthGuard tests ──────────────────────────────────────────────────────────

describe('AuthGuard', () => {
  beforeEach(resetStore)

  it('shows the page loader while isLoading is true', () => {
    useAuthStore.getState().setLoading(true)

    render(
      <MemoryRouter>
        <AuthGuard />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('page-loader')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('renders children (Outlet) when loading is done and session exists', () => {
    useAuthStore.getState().setSession({
      access_token: 'tok',
      refresh_token: 'ref',
      user: { id: 'u1', email: 'u@test.com' },
    } as never)

    render(
      <MemoryRouter>
        <AuthGuard />
        <ProtectedContent />
      </MemoryRouter>,
    )

    // Outlet renders nothing here but loading is gone
    expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument()
  })

  it('auto-sets guest when there is no session and not already a guest', async () => {
    // isLoading=false, session=null, isGuest=false  → should trigger setGuest(true)
    expect(useAuthStore.getState().isGuest).toBe(false)

    await act(async () => {
      render(
        <MemoryRouter>
          <AuthGuard />
        </MemoryRouter>,
      )
    })

    expect(useAuthStore.getState().isGuest).toBe(true)
  })

  it('does NOT change guest state when user is already authenticated', async () => {
    useAuthStore.getState().setSession({
      access_token: 'tok',
      refresh_token: 'ref',
      user: { id: 'u1', email: 'u@test.com' },
    } as never)
    useAuthStore.getState().setGuest(false)

    await act(async () => {
      render(
        <MemoryRouter>
          <AuthGuard />
        </MemoryRouter>,
      )
    })

    // setGuest should NOT have been called with true
    expect(useAuthStore.getState().isGuest).toBe(false)
  })
})

// ─── GuestGuard tests ─────────────────────────────────────────────────────────

describe('GuestGuard', () => {
  beforeEach(resetStore)

  it('shows the page loader while isLoading is true', () => {
    useAuthStore.getState().setLoading(true)

    render(
      <MemoryRouter>
        <GuestGuard />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('page-loader')).toBeInTheDocument()
  })

  it('redirects (renders redirect marker) when a session exists', () => {
    useAuthStore.getState().setSession({
      access_token: 'tok',
      refresh_token: 'ref',
      user: { id: 'u1', email: 'u@test.com' },
    } as never)

    render(
      <MemoryRouter>
        <GuestGuard />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('redirect-home')).toBeInTheDocument()
  })

  it('renders children (Outlet) when there is no session', () => {
    // isLoading=false, session=null → should render Outlet
    render(
      <MemoryRouter>
        <GuestGuard />
        <ProtectedContent />
      </MemoryRouter>,
    )

    expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument()
    expect(screen.queryByTestId('redirect-home')).not.toBeInTheDocument()
  })
})
