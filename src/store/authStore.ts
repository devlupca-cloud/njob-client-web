import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from '@/types'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  isLoading: boolean
  isGuest: boolean
  profileError: boolean
  setSession: (session: Session | null) => void
  setProfile: (profile: Profile | null) => void
  setLoading: (loading: boolean) => void
  setGuest: (isGuest: boolean) => void
  setProfileError: (error: boolean) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      user: null,
      profile: null,
      isLoading: true,
      isGuest: false,
      profileError: false,
      setSession: (session) =>
        set({ session, user: session?.user ?? null }),
      setProfile: (profile) => set({ profile, profileError: false }),
      setLoading: (isLoading) => set({ isLoading }),
      setGuest: (isGuest) => set({ isGuest }),
      setProfileError: (profileError) => set({ profileError }),
      clear: () => set({ session: null, user: null, profile: null, isLoading: true, isGuest: false, profileError: false }),
    }),
    {
      name: 'njob-auth',
      partialize: (state) => ({ profile: state.profile, isGuest: state.isGuest }),
    }
  )
)
