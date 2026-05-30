import { create } from 'zustand'

type AuthMode = 'loading' | 'setup' | 'login' | 'locked' | 'authenticated'

interface AuthState {
  mode: AuthMode
  setMode: (mode: AuthMode) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  mode: 'loading',
  setMode: (mode) => set({ mode }),
}))
