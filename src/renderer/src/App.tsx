import { AppShell, Box, Stack, ActionIcon, Tooltip, Center, Loader } from '@mantine/core'
import { IconMenu2 } from '@tabler/icons-react'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { useAppStore } from './store/app'
import { useAuthStore } from './store/auth'
import ConnectionSidebar from './components/connections/ConnectionSidebar'
import DashboardPage from './pages/DashboardPage'
import WelcomePage from './pages/WelcomePage'
import LoginPage from './pages/LoginPage'
import type { AuthStatus } from '../../shared/types'

export default function App() {
  const { activeConnectionId, setConnections } = useAppStore()
  const { mode, setMode } = useAuthStore()

  // ── Bootstrap: check auth status on mount ──────────────────────────────────
  useEffect(() => {
    api.auth.check().then((status) => {
      const s = status as AuthStatus
      if (!s.isSetup) setMode('setup')
      else if (s.isAuthenticated) setMode('authenticated')
      else setMode('login')
    })
  }, [setMode])

  // ── Listen for auto-lock from main process ─────────────────────────────────
  useEffect(() => {
    const unlisten = api.auth.onLocked(() => {
      setMode('locked')
      setConnections([])
    })
    return unlisten
  }, [setMode, setConnections])

  // ── Load connections (only when authenticated) ─────────────────────────────
  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.connections.list(),
    enabled: mode === 'authenticated',
  })

  useEffect(() => {
    if (connections) setConnections(connections)
  }, [connections, setConnections])

  // ── Resizable sidebar ──────────────────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const isResizing = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const handleMouseUp = useCallback(() => {
    isResizing.current = false
    document.body.style.cursor = 'default'
    document.body.style.userSelect = 'auto'
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return
    const w = Math.max(64, Math.min(600, e.clientX))
    setSidebarWidth(w)
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (mode === 'loading') {
    return (
      <Center h="100vh" style={{ background: 'var(--mantine-color-dark-8)' }}>
        <Loader color="indigo" size="md" />
      </Center>
    )
  }

  if (mode === 'setup') return <LoginPage mode="setup" />
  if (mode === 'login') return <LoginPage mode="login" />
  if (mode === 'locked') return <LoginPage mode="locked" />

  // ── Authenticated app shell ─────────────────────────────────────────────────
  return (
    <AppShell navbar={{ width: sidebarWidth, breakpoint: 'sm' }} padding={0}>
      <AppShell.Navbar>
        <Box style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
          {sidebarWidth <= 64 ? (
            <Stack
              align="center"
              pt="md"
              gap="lg"
              h="100%"
              style={{ borderRight: '1px solid var(--mantine-color-dark-4)' }}
            >
              <Tooltip label="Expand Sidebar" position="right">
                <ActionIcon
                  onClick={() => setSidebarWidth(260)}
                  variant="subtle"
                  size="lg"
                  color="gray"
                >
                  <IconMenu2 size={24} />
                </ActionIcon>
              </Tooltip>
            </Stack>
          ) : (
            <ConnectionSidebar />
          )}

          {/* Drag handle */}
          <Box
            onMouseDown={handleMouseDown}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 6,
              height: '100%',
              cursor: 'col-resize',
              zIndex: 100,
              backgroundColor: 'transparent',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--mantine-color-indigo-6)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          />
        </Box>
      </AppShell.Navbar>

      <AppShell.Main>
        {activeConnectionId ? <DashboardPage key={activeConnectionId} /> : <WelcomePage />}
      </AppShell.Main>
    </AppShell>
  )
}
