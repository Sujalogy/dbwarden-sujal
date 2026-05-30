import { Tabs, Box, Group, Text, Badge, ActionIcon, Tooltip, Stack } from '@mantine/core'
import { IconUsers, IconShieldLock, IconHierarchy, IconList, IconPlugOff, IconMathFunction } from '@tabler/icons-react'
import { useAppStore } from '../store/app'
import UsersTab from '../components/users/UsersTab'
import PermissionsTab from '../components/permissions/PermissionsTab'
import FunctionsTab from '../components/permissions/FunctionsTab'
import RolesTab from '../components/roles/RolesTab'
import AuditTab from '../components/audit/AuditTab'
import { api } from '../api'
import { useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'

export default function DashboardPage() {
  const { activeConnectionId, connections, activeTab, setActiveTab, setActiveConnectionId } = useAppStore()
  const connection = connections.find(c => c.id === activeConnectionId)
  const qc = useQueryClient()

  if (!connection) return null

  async function handleDisconnect() {
    await api.connections.disconnect(activeConnectionId!)
    qc.removeQueries({ queryKey: ['db', activeConnectionId] })
    setActiveConnectionId(null)
    notifications.show({ message: `Disconnected from ${connection!.name}`, color: 'gray' })
  }

  const ENGINE_COLORS: Record<string, string> = {
    postgres: 'blue', mysql: 'orange', mongodb: 'green', redis: 'red', sqlite: 'gray'
  }

  return (
    <Stack gap={0} h="100vh">
      {/* Header */}
      <Box
        px="lg" py="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', background: 'var(--mantine-color-dark-7)' }}
      >
        <Group justify="space-between">
          <Group gap="xs">
            <Badge color={ENGINE_COLORS[connection.engine] ?? 'gray'} variant="light" size="sm">
              {connection.engine}
            </Badge>
            <Text fw={600} size="sm">{connection.name}</Text>
            <Text c="dimmed" size="xs">{connection.host}:{connection.port}/{connection.database}</Text>
            {connection.isProduction && (
              <Badge color="red" variant="filled" size="xs">PRODUCTION</Badge>
            )}
          </Group>
          <Tooltip label="Disconnect">
            <ActionIcon variant="subtle" color="red" size="sm" onClick={handleDisconnect}>
              <IconPlugOff size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(v) => setActiveTab(v ?? 'users')}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <Tabs.List px="md" style={{ background: 'var(--mantine-color-dark-7)', borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
          <Tabs.Tab value="users" leftSection={<IconUsers size={14} />}>Users & Roles</Tabs.Tab>
          <Tabs.Tab value="permissions" leftSection={<IconShieldLock size={14} />}>Tables</Tabs.Tab>
          <Tabs.Tab value="functions" leftSection={<IconMathFunction size={14} />}>Functions</Tabs.Tab>
          <Tabs.Tab value="roles" leftSection={<IconHierarchy size={14} />}>Role Designer</Tabs.Tab>
          <Tabs.Tab value="audit" leftSection={<IconList size={14} />}>Audit Log</Tabs.Tab>
        </Tabs.List>

        <Box style={{ flex: 1, overflow: 'auto' }}>
          <Tabs.Panel value="users" style={{ height: '100%' }}>
            <UsersTab connectionId={activeConnectionId!} />
          </Tabs.Panel>
          <Tabs.Panel value="permissions" style={{ height: '100%' }}>
            <PermissionsTab connectionId={activeConnectionId!} />
          </Tabs.Panel>
          <Tabs.Panel value="functions" style={{ height: '100%' }}>
            <FunctionsTab connectionId={activeConnectionId!} />
          </Tabs.Panel>
          <Tabs.Panel value="roles" style={{ height: '100%' }}>
            <RolesTab connectionId={activeConnectionId!} />
          </Tabs.Panel>
          <Tabs.Panel value="audit" style={{ height: '100%' }}>
            <AuditTab connectionId={activeConnectionId!} />
          </Tabs.Panel>
        </Box>
      </Tabs>
    </Stack>
  )
}
