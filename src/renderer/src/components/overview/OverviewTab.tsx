import {
  Box, Stack, Group, Text, Badge, Paper, SimpleGrid,
  ThemeIcon, Button, Divider, Code, ScrollArea, Skeleton,
  ActionIcon, Tooltip, Alert
} from '@mantine/core'
import {
  IconDatabase, IconUsers, IconHierarchy, IconShieldLock,
  IconHistory, IconBolt, IconCheck, IconAlertCircle,
  IconCopy, IconRefresh, IconTable, IconClock
} from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { notifications } from '@mantine/notifications'
import { api } from '../../api'
import { useAppStore } from '../../store/app'
import type { StoredConnection } from '../../../../shared/types'

interface Props {
  connectionId: string
  connection: StoredConnection
}

const ENGINE_COLOR: Record<string, string> = {
  postgres: 'blue', mysql: 'orange', mongodb: 'green', redis: 'red', sqlite: 'gray',
}

const ENGINE_LABEL: Record<string, string> = {
  postgres: 'PostgreSQL', mysql: 'MySQL', mongodb: 'MongoDB', redis: 'Redis', sqlite: 'SQLite',
}

function StatCard({ icon: Icon, color, value, label }: { icon: React.ElementType; color: string; value: string | number; label: string }) {
  return (
    <Paper p="md" withBorder radius="md">
      <Group gap="sm">
        <ThemeIcon size={40} radius="md" variant="light" color={color}>
          <Icon size={20} />
        </ThemeIcon>
        <Stack gap={0}>
          <Text size="xl" fw={700}>{value}</Text>
          <Text size="xs" c="dimmed">{label}</Text>
        </Stack>
      </Group>
    </Paper>
  )
}

export default function OverviewTab({ connectionId, connection }: Props) {
  const qc = useQueryClient()
  const [pingMs, setPingMs] = useState<number | null>(null)
  const [pinging, setPinging] = useState(false)

  const { data: principals = [], isLoading: loadingPrincipals } = useQuery({
    queryKey: ['db', connectionId, 'principals'],
    queryFn: () => api.db.listPrincipals(connectionId),
    staleTime: 120_000,
  })

  const { data: roles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ['db', connectionId, 'roles'],
    queryFn: () => api.db.listRoles(connectionId),
    staleTime: 120_000,
  })

  const { data: auditEntries = [], isLoading: loadingAudit } = useQuery({
    queryKey: ['audit', connectionId],
    queryFn: () => api.audit.list(connectionId),
    staleTime: 0,
  })

  const users = principals.filter(p => p.type === 'user')
  const rolesList = principals.filter(p => p.type === 'role')
  const recentAudit = auditEntries.slice(0, 5)

  async function handlePing() {
    setPinging(true)
    const start = Date.now()
    try {
      await api.db.listPrincipals(connectionId)
      setPingMs(Date.now() - start)
    } catch {
      setPingMs(-1)
    } finally {
      setPinging(false)
    }
  }

  function copyConnectionString() {
    const str = `${connection.engine === 'postgres' ? 'postgresql' : connection.engine}://${connection.username}@${connection.host}:${connection.port}/${connection.database}`
    navigator.clipboard.writeText(str)
    notifications.show({ message: 'Connection string copied (without password)', color: 'green', icon: <IconCheck size={14} /> })
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHrs = Math.floor(diffMins / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    return `${Math.floor(diffHrs / 24)}d ago`
  }

  return (
    <ScrollArea h="100%">
      <Box p="xl">
        <Stack gap="xl" maw={800} mx="auto">

          {/* Connection info card */}
          <Paper p="lg" withBorder radius="md">
            <Stack gap="md">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm">
                  <ThemeIcon size={44} radius="md" variant="light" color={ENGINE_COLOR[connection.engine] ?? 'gray'}>
                    <IconDatabase size={22} />
                  </ThemeIcon>
                  <Stack gap={2}>
                    <Group gap={6}>
                      <Text fw={700} size="lg">{connection.name}</Text>
                      <Badge color={ENGINE_COLOR[connection.engine]} variant="light" size="sm">
                        {ENGINE_LABEL[connection.engine] ?? connection.engine}
                      </Badge>
                      {connection.isProduction && <Badge color="red" variant="filled" size="xs">PRODUCTION</Badge>}
                    </Group>
                    <Text size="sm" c="dimmed">
                      {connection.host}:{connection.port}/{connection.database}
                    </Text>
                  </Stack>
                </Group>
                <Group gap="xs">
                  <Tooltip label="Copy connection string (no password)">
                    <ActionIcon variant="subtle" onClick={copyConnectionString}>
                      <IconCopy size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Refresh all data">
                    <ActionIcon variant="subtle" onClick={() => qc.invalidateQueries({ queryKey: ['db', connectionId] })}>
                      <IconRefresh size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              {/* Connection details */}
              <SimpleGrid cols={3} spacing="sm">
                <Stack gap={2}>
                  <Text size="xs" c="dimmed" fw={600}>SSL</Text>
                  <Badge
                    size="sm"
                    variant="dot"
                    color={connection.ssl.enabled ? 'green' : 'gray'}
                  >
                    {connection.ssl.enabled ? connection.ssl.mode : 'disabled'}
                  </Badge>
                </Stack>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed" fw={600}>SSH TUNNEL</Text>
                  <Badge size="sm" variant="dot" color={connection.ssh.enabled ? 'teal' : 'gray'}>
                    {connection.ssh.enabled ? connection.ssh.host : 'none'}
                  </Badge>
                </Stack>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed" fw={600}>LATENCY</Text>
                  <Group gap="xs">
                    {pingMs === null ? (
                      <Button
                        size="xs"
                        variant="subtle"
                        leftSection={<IconBolt size={12} />}
                        loading={pinging}
                        onClick={handlePing}
                        p={0}
                        h="auto"
                        style={{ fontSize: 12 }}
                      >
                        Ping
                      </Button>
                    ) : pingMs === -1 ? (
                      <Badge size="sm" color="red" variant="dot">unreachable</Badge>
                    ) : (
                      <Group gap={4}>
                        <Badge size="sm" color={pingMs < 50 ? 'green' : pingMs < 200 ? 'yellow' : 'red'} variant="dot">
                          {pingMs}ms
                        </Badge>
                        <ActionIcon size="xs" variant="subtle" onClick={handlePing} loading={pinging}>
                          <IconRefresh size={10} />
                        </ActionIcon>
                      </Group>
                    )}
                  </Group>
                </Stack>
              </SimpleGrid>
            </Stack>
          </Paper>

          {/* Stats */}
          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
            {loadingPrincipals ? (
              <>
                <Skeleton height={72} radius="md" />
                <Skeleton height={72} radius="md" />
                <Skeleton height={72} radius="md" />
              </>
            ) : (
              <>
                <StatCard icon={IconUsers} color="blue" value={users.length} label="Users (can login)" />
                <StatCard icon={IconHierarchy} color="violet" value={rolesList.length} label="Roles defined" />
                <StatCard icon={IconHistory} color="teal" value={auditEntries.length} label="Audit entries" />
              </>
            )}
          </SimpleGrid>

          {/* Production warning */}
          {connection.isProduction && (
            <Alert color="red" icon={<IconAlertCircle size={14} />} variant="light">
              <Text size="sm">
                <strong>Production database.</strong> All actions show confirmation dialogs before executing.
                Review the exact SQL in the preview drawer before applying any changes.
              </Text>
            </Alert>
          )}

          {/* Recent audit */}
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={600} size="sm">Recent Activity</Text>
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={() => qc.invalidateQueries({ queryKey: ['audit', connectionId] })}
              >
                <IconRefresh size={14} />
              </ActionIcon>
            </Group>

            {loadingAudit ? (
              <Stack gap="xs">
                {[1, 2, 3].map(i => <Skeleton key={i} height={44} radius="md" />)}
              </Stack>
            ) : recentAudit.length === 0 ? (
              <Paper p="md" withBorder radius="md">
                <Text size="sm" c="dimmed" ta="center">
                  No changes recorded yet for this connection.
                  Changes you make will appear here.
                </Text>
              </Paper>
            ) : (
              <Stack gap="xs">
                {recentAudit.map(entry => (
                  <Paper key={entry.id} p="sm" withBorder radius="md">
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                        <ThemeIcon
                          size={28}
                          radius="sm"
                          variant="light"
                          color={entry.success ? 'teal' : 'red'}
                        >
                          {entry.success
                            ? <IconCheck size={14} />
                            : <IconAlertCircle size={14} />
                          }
                        </ThemeIcon>
                        <Stack gap={0} style={{ minWidth: 0 }}>
                          <Text size="sm" truncate>{entry.action}</Text>
                          <Text size="xs" c="dimmed">{entry.statements.length} statement{entry.statements.length > 1 ? 's' : ''}</Text>
                        </Stack>
                      </Group>
                      <Group gap="xs" style={{ flexShrink: 0 }}>
                        <IconClock size={12} color="var(--mantine-color-dimmed)" />
                        <Text size="xs" c="dimmed">{formatDate(entry.timestamp)}</Text>
                      </Group>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>

        </Stack>
      </Box>
    </ScrollArea>
  )
}
