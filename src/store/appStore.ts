import { create } from 'zustand'
import type { Creator, NavPage } from '@/types'

interface AppState {
  currentPage: NavPage
  creator: Creator | null
  setCurrentPage: (page: NavPage) => void
  setCreator: (creator: Creator | null) => void
}

export const useAppStore = create<AppState>()((set) => ({
  currentPage: 'home',
  creator: null,
  setCurrentPage: (currentPage) => set({ currentPage }),
  setCreator: (creator) => set({ creator }),
}))
