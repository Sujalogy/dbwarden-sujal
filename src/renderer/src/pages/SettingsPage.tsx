import {
  Stack, Title, Text, Switch, Select, Button, Divider,
  Group, Paper, Badge, Box, ActionIcon, Tooltip, Alert
} from '@mantine/core'
import { useMantineColorScheme } from '@mantine/core'
import { IconSun, IconMoon, IconLock, IconDownload, IconUpload, IconShieldCheck, IconInfoCircle } from '@tabler/icons-react'
import { useDisclosure } from '@mantine/hooks'
import { useState } from 'react'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { api } from '../api'
import { useAuthStore } from '../store/auth'
import Logo from '../components/Logo'

const AUTO_LOCK_OPTIONS = [
  { value: '900000',  label: '15 minutes' },
  { value: '1800000', label: '30 minutes (default)' },
  { value: '3600000', label: '1 hour' },
  { value: '0',       label: 'Never (until app closes)' },
]

export default function SettingsPage() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const setAuthMode = useAuthStore(s => s.setMode)
  const [autoLock, setAutoLock] = useState('1800000')
  const [exportOpened, { open: openExport, close: closeExport }] = useDisclosure(false)
  const [locking, setLocking] = useState(false)

  async function handleLockNow() {
    setLocking(true)
    await api.auth.lock()
    setAuthMode('locked')
  }

  function handleExportBackup() {
    modals.openInputModal({
      title: 'Export Vault Backup',
      label: 'Backup password',
      description: 'This password encrypts the backup file. Keep it safe.',
      inputProps: { type: 'password', placeholder: 'Enter backup password...' },
      confirmProps: { children: 'Export' },
      onConfirm: async (pw: string) => {
        if (!pw) return
        try {
          const step1 = await api.auth.exportVault() as { success: boolean; needsPassword?: boolean; filePath?: string; canceled?: boolean }
          if (step1.canceled || !step1.filePath) return
          const result = await api.auth.exportVaultWithPassword(pw, step1.filePath) as { success: boolean; error?: string }
          if (result.success) {
            notifications.show({ message: 'Vault exported successfully', color: 'green' })
          } else {
            notifications.show({ message: result.error ?? 'Export failed', color: 'red' })
          }
        } catch (err: unknown) {
          notifications.show({ message: (err as Error).message, color: 'red' })
        }
      },
    })
  }

  function handleImportBackup() {
    modals.openInputModal({
      title: 'Import Vault Backup',
      label: 'Backup password',
      description: 'Enter the password you used when exporting the backup.',
      inputProps: { type: 'password', placeholder: 'Enter backup password...' },
      confirmProps: { children: 'Import & Restore', color: 'orange' },
      onConfirm: async (pw: string) => {
        if (!pw) return
        try {
          const result = await api.auth.importVault(pw) as { success: boolean; canceled?: boolean; error?: string }
          if (result.canceled) return
          if (result.success) {
            notifications.show({ message: 'Vault restored. Please reconnect your databases.', color: 'green' })
          } else {
            notifications.show({ message: result.error ?? 'Import failed. Wrong password?', color: 'red' })
          }
        } catch (err: unknown) {
          notifications.show({ message: (err as Error).message, color: 'red' })
        }
      },
    })
  }

  return (
    <Box p="xl" maw={640} mx="auto">
      <Stack gap="xl">
        {/* Header */}
        <Group gap="md">
          <Logo size={40} />
          <Stack gap={2}>
            <Title order={3}>Settings</Title>
            <Text size="xs" c="dimmed">DB Warden v2.0</Text>
          </Stack>
        </Group>

        {/* Appearance */}
        <Paper p="lg" withBorder radius="md">
          <Stack gap="md">
            <Text fw={600} size="sm">Appearance</Text>
            <Group justify="space-between">
              <Stack gap={2}>
                <Text size="sm">Theme</Text>
                <Text size="xs" c="dimmed">Switch between dark and light mode</Text>
              </Stack>
              <Group gap="xs">
                <Tooltip label="Light mode">
                  <ActionIcon
                    variant={colorScheme === 'light' ? 'filled' : 'subtle'}
                    color="yellow"
                    onClick={() => colorScheme === 'dark' && toggleColorScheme()}
                  >
                    <IconSun size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Dark mode">
                  <ActionIcon
                    variant={colorScheme === 'dark' ? 'filled' : 'subtle'}
                    color="indigo"
                    onClick={() => colorScheme === 'light' && toggleColorScheme()}
                  >
                    <IconMoon size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
          </Stack>
        </Paper>

        {/* Security */}
        <Paper p="lg" withBorder radius="md">
          <Stack gap="md">
            <Group gap="xs">
              <IconShieldCheck size={16} color="var(--mantine-color-indigo-4)" />
              <Text fw={600} size="sm">Security</Text>
            </Group>

            <Select
              label="Auto-lock after inactivity"
              description="App locks and requires master password after this period"
              data={AUTO_LOCK_OPTIONS}
              value={autoLock}
              onChange={(v) => v && setAutoLock(v)}
              size="sm"
            />

            <Divider />

            <Group justify="space-between">
              <Stack gap={2}>
                <Text size="sm">Lock App Now</Text>
                <Text size="xs" c="dimmed">Returns to the login screen immediately</Text>
              </Stack>
              <Button
                leftSection={<IconLock size={14} />}
                color="orange"
                variant="light"
                size="sm"
                loading={locking}
                onClick={handleLockNow}
              >
                Lock Now
              </Button>
            </Group>
          </Stack>
        </Paper>

        {/* Backup & Restore */}
        <Paper p="lg" withBorder radius="md">
          <Stack gap="md">
            <Stack gap={2}>
              <Text fw={600} size="sm">Backup & Restore</Text>
              <Text size="xs" c="dimmed">
                Export your vault to an AES-256-GCM encrypted backup file.
                Use this to restore connections after a password reset.
              </Text>
            </Stack>

            <Alert icon={<IconInfoCircle size={14} />} color="blue" variant="light">
              Backups are encrypted with a separate password you choose — different from your master password.
            </Alert>

            <Group>
              <Button
                leftSection={<IconDownload size={14} />}
                variant="light"
                size="sm"
                onClick={handleExportBackup}
              >
                Export Backup
              </Button>
              <Button
                leftSection={<IconUpload size={14} />}
                variant="light"
                color="orange"
                size="sm"
                onClick={handleImportBackup}
              >
                Import & Restore
              </Button>
            </Group>
          </Stack>
        </Paper>

        {/* About */}
        <Paper p="lg" withBorder radius="md">
          <Stack gap="xs">
            <Text fw={600} size="sm">About</Text>
            <Group gap="xs">
              <Text size="xs" c="dimmed">DB Warden</Text>
              <Badge size="xs" variant="light" color="indigo">v2.0.0</Badge>
              <Badge size="xs" variant="light" color="green">Open Source</Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Built with Electron, React, Mantine, and PostgreSQL drivers.
              All credentials are encrypted locally — nothing leaves your machine.
            </Text>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  )
}
