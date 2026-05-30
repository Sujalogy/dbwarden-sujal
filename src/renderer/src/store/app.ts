import { create } from 'zustand'
import type { StoredConnection } from '../../../shared/types'

interface AppState {
  connections: StoredConnection[]
  activeConnectionId: string | null
  activeTab: string
  setConnections: (conns: StoredConnection[]) => void
  setActiveConnectionId: (id: string | null) => void
  setActiveTab: (tab: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  connections: [],
  activeConnectionId: null,
  activeTab: 'users',
  setConnections: (connections) => set({ connections }),
  setActiveConnectionId: (id) => set({ activeConnectionId: id, activeTab: 'users' }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}))
