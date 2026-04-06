import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from './authStore'

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clear()
    // After clear, isLoading is true — reset for tests
    useAuthStore.getState().setLoading(false)
  })

  it('should start with null session and profile', () => {
    const state = useAuthStore.getState()
    expect(state.session).toBeNull()
    expect(state.user).toBeNull()
    expect(state.profile).toBeNull()
  })

  it('should set guest mode', () => {
    useAuthStore.getState().setGuest(true)
    expect(useAuthStore.getState().isGuest).toBe(true)
  })

  it('clear() should reset all state and set isLoading to true', () => {
    useAuthStore.getState().setGuest(true)
    useAuthStore.getState().setProfile({ id: '123', full_name: 'Test' } as never)
    useAuthStore.getState().setLoading(false)

    useAuthStore.getState().clear()

    const state = useAuthStore.getState()
    expect(state.session).toBeNull()
    expect(state.profile).toBeNull()
    expect(state.isGuest).toBe(false)
    expect(state.isLoading).toBe(true)
    expect(state.profileError).toBe(false)
  })

  it('setProfile should clear profileError', () => {
    useAuthStore.getState().setProfileError(true)
    expect(useAuthStore.getState().profileError).toBe(true)

    useAuthStore.getState().setProfile({ id: '123' } as never)
    expect(useAuthStore.getState().profileError).toBe(false)
  })

  it('setSession should extract user from session', () => {
    const mockSession = {
      access_token: 'token',
      refresh_token: 'refresh',
      user: { id: 'user-123', email: 'test@test.com' },
    } as never

    useAuthStore.getState().setSession(mockSession)

    const state = useAuthStore.getState()
    expect(state.session).toBe(mockSession)
    expect(state.user?.id).toBe('user-123')
  })

  it('setSession(null) should clear user', () => {
    useAuthStore.getState().setSession({
      user: { id: '123' },
    } as never)

    useAuthStore.getState().setSession(null)

    expect(useAuthStore.getState().user).toBeNull()
  })

  it('only persists profile and isGuest', () => {
    // The partialize config should only save profile and isGuest
    const store = useAuthStore
    const partialize = (store as unknown as { persist: { getOptions: () => { partialize: (s: unknown) => unknown } } }).persist.getOptions().partialize

    const fullState = {
      session: { access_token: 'secret' },
      user: { id: '123' },
      profile: { id: '123', full_name: 'Test' },
      isLoading: false,
      isGuest: true,
      profileError: false,
    }

    const persisted = partialize(fullState) as Record<string, unknown>
    expect(persisted).toHaveProperty('profile')
    expect(persisted).toHaveProperty('isGuest')
    expect(persisted).not.toHaveProperty('session')
    expect(persisted).not.toHaveProperty('user')
    expect(persisted).not.toHaveProperty('isLoading')
  })
})
