import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuthStore } from '@/store/authStore'

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn().mockResolvedValue({}),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
      signOut: mocks.signOut,
      signInWithOtp: mocks.signInWithOtp,
      verifyOtp: mocks.verifyOtp,
      updateUser: mocks.updateUser,
    },
    from: mocks.from,
  },
}))

import { useAuth } from './useAuth'

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.getState().clear()
    useAuthStore.getState().setLoading(false)
  })

  it('signIn calls supabase and sets guest to false', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null })
    useAuthStore.getState().setGuest(true)

    const { result } = renderHook(() => useAuth())

    await act(async () => {
      await result.current.signIn('test@test.com', 'pass123')
    })

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@test.com',
      password: 'pass123',
    })
    expect(useAuthStore.getState().isGuest).toBe(false)
  })

  it('signIn throws on error', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: new Error('Invalid') })

    const { result } = renderHook(() => useAuth())

    await expect(
      act(async () => {
        await result.current.signIn('test@test.com', 'wrong')
      }),
    ).rejects.toThrow('Invalid')
  })

  it('signOut clears the store', () => {
    useAuthStore.getState().setGuest(true)
    useAuthStore.getState().setProfile({ id: '1', full_name: 'Test' } as never)

    const { result } = renderHook(() => useAuth())
    act(() => result.current.signOut())

    expect(useAuthStore.getState().profile).toBeNull()
    expect(useAuthStore.getState().session).toBeNull()
  })

  it('enterAsGuest sets isGuest', () => {
    const { result } = renderHook(() => useAuth())
    act(() => result.current.enterAsGuest())
    expect(useAuthStore.getState().isGuest).toBe(true)
  })

  it('signUp calls supabase auth signUp', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mocks.from.mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) }),
    })

    const { result } = renderHook(() => useAuth())

    await act(async () => {
      await result.current.signUp('a@b.com', 'pass', 'Name', '2000-01-01')
    })

    expect(mocks.signUp).toHaveBeenCalled()
    expect(useAuthStore.getState().isGuest).toBe(false)
  })
})
