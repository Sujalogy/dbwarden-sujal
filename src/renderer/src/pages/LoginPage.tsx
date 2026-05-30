import {
  Center, Stack, Title, Text, PasswordInput, Button,
  Alert, Paper, Group, Divider, Progress, Modal
} from '@mantine/core'
import {
  IconAlertCircle, IconShield, IconDownload, IconUpload
} from '@tabler/icons-react'
import { useDisclosure } from '@mantine/hooks'
import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { useAuthStore } from '../store/auth'
import type { LoginResult } from '../../../shared/types'

type Mode = 'setup' | 'login' | 'locked'

interface Props { mode: Mode }

// ── Password strength ──────────────────────────────────────────────────────────

function pwStrength(pw: string): { score: number; label: string; color: string } {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 14) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['red', 'orange', 'yellow', 'teal', 'green']
  return { score: s, label: labels[s] ?? 'Strong', color: colors[s] ?? 'green' }
}

// ── Vault export/import modal ─────────────────────────────────────────────────

function VaultBackupModal({ opened, onClose, mode }: { opened: boolean; onClose: () => void; mode: 'export' | 'import' }) {
  const [step, setStep] = useState<'password' | 'done'>('password')
  const [exportPassword, setExportPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)

  async function handleExportStep1() {
    if (!exportPassword.trim()) { setError('Enter an export password.'); return }
    setLoading(true)
    try {
      const res = await api.auth.exportVault() as { success: boolean; needsPassword?: boolean; filePath?: string; canceled?: boolean }
      if (res.canceled) { onClose(); return }
      if (res.needsPassword && res.filePath) {
        setFilePath(res.filePath)
        setStep('done')
        // Now actually encrypt with password
        const finalRes = await api.auth.exportVaultWithPassword(exportPassword, res.filePath) as { success: boolean; error?: string }
        if (!finalRes.success) setError(finalRes.error ?? 'Export failed.')
        else setResult(`Backup saved to:\n${res.filePath}`)
      }
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    if (!exportPassword.trim()) { setError('Enter the backup password.'); return }
    if (mode === 'import' && confirm !== exportPassword) { setError('Passwords do not match.'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await api.auth.importVault(exportPassword) as { success: boolean; canceled?: boolean; error?: string }
      if (res.canceled) { onClose(); return }
      if (!res.success) { setError(res.error ?? 'Import failed.'); return }
      setResult('Vault restored successfully. Your connections are back.')
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setStep('password')
    setExportPassword('')
    setConfirm('')
    setError(null)
    setResult(null)
    onClose()
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          {mode === 'export' ? <IconDownload size={16} /> : <IconUpload size={16} />}
          <Text fw={600}>{mode === 'export' ? 'Export Vault Backup' : 'Import Vault Backup'}</Text>
        </Group>
      }
      size="sm"
    >
      <Stack gap="sm">
        {result ? (
          <>
            <Alert color="green" icon={<IconShield size={14} />}>{result}</Alert>
            <Button onClick={handleClose}>Close</Button>
          </>
        ) : (
          <>
            <Text size="sm" c="dimmed">
              {mode === 'export'
                ? 'Set a password to encrypt your backup file. This is separate from your master password.'
                : 'Enter the password you used when creating the backup.'}
            </Text>
            <PasswordInput
              label={mode === 'export' ? 'Backup Password' : 'Backup Password'}
              value={exportPassword}
              onChange={(e) => setExportPassword(e.currentTarget.value)}
            />
            {mode === 'export' && (
              <PasswordInput
                label="Confirm Password"
                value={confirm}
                onChange={(e) => setConfirm(e.currentTarget.value)}
                error={confirm && confirm !== exportPassword ? 'Passwords do not match' : undefined}
              />
            )}
            {error && <Alert color="red" icon={<IconAlertCircle size={14} />}>{error}</Alert>}
            <Group justify="flex-end">
              <Button variant="subtle" onClick={handleClose}>Cancel</Button>
              <Button
                loading={loading}
                onClick={mode === 'export' ? handleExportStep1 : handleImport}
                disabled={!exportPassword || (mode === 'export' && exportPassword !== confirm)}
              >
                {mode === 'export' ? 'Export' : 'Import & Restore'}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  )
}

// ── Main LoginPage ─────────────────────────────────────────────────────────────

export default function LoginPage({ mode }: Props) {
  const setAuthMode = useAuthStore(s => s.setMode)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null)
  const [lockoutMs, setLockoutMs] = useState(0)
  const [exportOpened, { open: openExport, close: closeExport }] = useDisclosure(false)
  const [importOpened, { open: openImport, close: closeImport }] = useDisclosure(false)

  // Lockout countdown
  useEffect(() => {
    if (lockoutMs <= 0) return
    const t = setInterval(() => {
      setLockoutMs(prev => {
        const next = prev - 1000
        if (next <= 0) { clearInterval(t); setError(null); return 0 }
        return next
      })
    }, 1000)
    return () => clearInterval(t)
  }, [lockoutMs > 0])

  const strength = pwStrength(password)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    if (mode === 'setup' && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (mode === 'setup') {
        await api.auth.setup(password)
        setAuthMode('authenticated')
      } else {
        const result = await api.auth.login(password) as LoginResult
        if (result.success) {
          setAuthMode('authenticated')
        } else {
          if (result.lockedOut && result.lockoutRemainingMs) {
            setLockoutMs(result.lockoutRemainingMs)
            setError(`Too many failed attempts. Locked for ${Math.ceil(result.lockoutRemainingMs / 1000)}s.`)
          } else {
            setError(result.error ?? 'Incorrect password.')
            if (result.remainingAttempts !== undefined) {
              setRemainingAttempts(result.remainingAttempts)
            }
          }
        }
      }
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const isLocked = lockoutMs > 0

  const titles: Record<Mode, string> = {
    setup: 'Create Master Password',
    login: 'Welcome Back',
    locked: 'Session Locked',
  }

  const subtitles: Record<Mode, string> = {
    setup: 'This password protects all your saved database connections. There is no recovery — keep it safe.',
    login: 'Enter your master password to access DB Warden.',
    locked: 'Your session was locked after 30 minutes of inactivity.',
  }

  return (
    <Center
      h="100vh"
      style={{ background: 'var(--mantine-color-dark-8)' }}
    >
      <Stack align="center" gap="xl" w={420} px="md">
        {/* Logo */}
        <Stack align="center" gap="xs">
          <img
            src="/logo.svg"
            alt="DB Warden"
            width={80}
            height={80}
            style={{ filter: mode === 'locked' ? 'grayscale(40%) brightness(0.8)' : 'none' }}
          />
          <Title order={2} ta="center">{titles[mode]}</Title>
          <Text size="sm" c="dimmed" ta="center" maw={360}>{subtitles[mode]}</Text>
        </Stack>

        {/* Form card */}
        <Paper w="100%" p="xl" radius="md" withBorder>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <Stack gap={4}>
                <PasswordInput
                  label="Master Password"
                  placeholder={mode === 'setup' ? 'Create a strong password...' : 'Enter your password...'}
                  value={password}
                  onChange={(e) => { setPassword(e.currentTarget.value); setError(null) }}
                  disabled={isLocked}
                  autoFocus
                  size="md"
                />
                {mode === 'setup' && password && (
                  <Group gap="xs">
                    <Progress value={(strength.score / 5) * 100} color={strength.color} size="xs" style={{ flex: 1 }} />
                    <Text size="xs" c={strength.color} w={70} ta="right">{strength.label}</Text>
                  </Group>
                )}
              </Stack>

              {mode === 'setup' && (
                <PasswordInput
                  label="Confirm Password"
                  placeholder="Re-enter your password..."
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.currentTarget.value); setError(null) }}
                  error={confirmPassword && confirmPassword !== password ? 'Passwords do not match' : undefined}
                  size="md"
                />
              )}

              {error && (
                <Alert color="red" icon={<IconAlertCircle size={14} />} py="xs">
                  <Text size="sm">{error}</Text>
                  {remainingAttempts !== null && remainingAttempts > 0 && !isLocked && (
                    <Text size="xs" c="dimmed" mt={2}>
                      {remainingAttempts} attempt{remainingAttempts !== 1 ? 's' : ''} remaining before lockout.
                    </Text>
                  )}
                  {isLocked && (
                    <Text size="xs" c="dimmed" mt={2}>
                      Try again in {Math.ceil(lockoutMs / 1000)}s
                    </Text>
                  )}
                </Alert>
              )}

              <Button
                type="submit"
                size="md"
                fullWidth
                loading={loading}
                disabled={isLocked || !password || (mode === 'setup' && (!confirmPassword || password !== confirmPassword))}
              >
                {mode === 'setup' ? 'Create Password & Enter' : mode === 'locked' ? 'Unlock' : 'Login'}
              </Button>
            </Stack>
          </form>
        </Paper>

        {/* Vault backup / restore links */}
        {(mode === 'login' || mode === 'locked') && (
          <>
            <Divider label="Recovery" labelPosition="center" w="100%" />
            <Stack gap="xs" align="center">
              <Text size="xs" c="dimmed" ta="center">
                Forgot your password? Delete <code>auth.json</code> in your app data folder to reset,<br />
                then restore your connections from a backup.
              </Text>
              <Group gap="sm">
                <Button
                  size="xs"
                  variant="subtle"
                  leftSection={<IconDownload size={12} />}
                  onClick={openExport}
                  disabled={mode === 'locked'}
                >
                  Export Backup
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  leftSection={<IconUpload size={12} />}
                  onClick={openImport}
                >
                  Import Backup
                </Button>
              </Group>
            </Stack>
          </>
        )}

        {/* Security notice */}
        <Group gap="xs">
          <IconShield size={12} color="var(--mantine-color-dimmed)" />
          <Text size="xs" c="dimmed">
            Credentials are encrypted with OS-level security. Nothing leaves your machine.
          </Text>
        </Group>
      </Stack>

      <VaultBackupModal opened={exportOpened} onClose={closeExport} mode="export" />
      <VaultBackupModal opened={importOpened} onClose={closeImport} mode="import" />
    </Center>
  )
}
