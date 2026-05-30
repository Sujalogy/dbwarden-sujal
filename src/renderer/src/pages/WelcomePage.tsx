import {
  Center, Stack, Title, Text, SimpleGrid, Paper, Group,
  Badge, Button, Box, ThemeIcon, Divider, ActionIcon, Tooltip
} from '@mantine/core'
import {
  IconPlus, IconDatabase, IconCloud, IconBolt,
  IconShieldLock, IconUsers, IconHistory, IconChevronRight,
  IconBrandAws, IconServer
} from '@tabler/icons-react'
import { useDisclosure } from '@mantine/hooks'
import { useAppStore } from '../store/app'
import { useQueryClient } from '@tanstack/react-query'
import Logo from '../components/Logo'
import AddConnectionModal from '../components/connections/AddConnectionModal'

const ENGINE_COLOR: Record<string, string> = {
  postgres: 'blue', mysql: 'orange', mongodb: 'green', redis: 'red', sqlite: 'gray',
}

const ENGINE_LABEL: Record<string, string> = {
  postgres: 'PostgreSQL', mysql: 'MySQL', mongodb: 'MongoDB', redis: 'Redis', sqlite: 'SQLite',
}

const CLOUD_PRESETS = [
  { label: 'AWS RDS', icon: IconBrandAws, color: 'orange', hint: 'postgresql://user:pass@host.rds.amazonaws.com:5432/db' },
  { label: 'Neon', icon: IconBolt, color: 'teal', hint: 'postgresql://user:pass@host.neon.tech:5432/db?sslmode=require' },
  { label: 'Supabase', icon: IconDatabase, color: 'green', hint: 'postgresql://postgres:pass@db.projectid.supabase.co:5432/postgres' },
  { label: 'Cloud DB', icon: IconCloud, color: 'blue', hint: '' },
]

export default function WelcomePage() {
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const { connections, setActiveConnectionId } = useAppStore()

  const totalConnections = connections.length
  const prodConnections = connections.filter(c => c.isProduction).length
  const engines = [...new Set(connections.map(c => c.engine))]
  const recent = connections.slice(-4).reverse()

  const hasConnections = connections.length > 0

  return (
    <>
      <Box p="xl" h="100%" style={{ overflowY: 'auto' }}>
        <Stack gap="xl" maw={860} mx="auto">

          {/* Header */}
          <Group justify="space-between" align="flex-start">
            <Group gap="md">
              <Logo size={48} />
              <Stack gap={2}>
                <Title order={2}>DB Warden</Title>
                <Text size="sm" c="dimmed">Your access-control cockpit</Text>
              </Stack>
            </Group>
            <Button leftSection={<IconPlus size={14} />} onClick={openAdd}>
              Add Connection
            </Button>
          </Group>

          {/* Stats row */}
          {hasConnections && (
            <SimpleGrid cols={3} spacing="md">
              <Paper p="md" withBorder radius="md">
                <Group gap="sm">
                  <ThemeIcon size={40} radius="md" variant="light" color="indigo">
                    <IconDatabase size={20} />
                  </ThemeIcon>
                  <Stack gap={0}>
                    <Text size="xl" fw={700}>{totalConnections}</Text>
                    <Text size="xs" c="dimmed">Saved connections</Text>
                  </Stack>
                </Group>
              </Paper>

              <Paper p="md" withBorder radius="md">
                <Group gap="sm">
                  <ThemeIcon size={40} radius="md" variant="light" color="red">
                    <IconShieldLock size={20} />
                  </ThemeIcon>
                  <Stack gap={0}>
                    <Text size="xl" fw={700}>{prodConnections}</Text>
                    <Text size="xs" c="dimmed">Production DBs</Text>
                  </Stack>
                </Group>
              </Paper>

              <Paper p="md" withBorder radius="md">
                <Group gap="sm">
                  <ThemeIcon size={40} radius="md" variant="light" color="teal">
                    <IconServer size={20} />
                  </ThemeIcon>
                  <Stack gap={0}>
                    <Text size="xl" fw={700}>{engines.length}</Text>
                    <Text size="xs" c="dimmed">
                      {engines.length === 0 ? 'No engines' : engines.map(e => ENGINE_LABEL[e] ?? e).join(', ')}
                    </Text>
                  </Stack>
                </Group>
              </Paper>
            </SimpleGrid>
          )}

          {/* Recent connections */}
          {hasConnections && (
            <Stack gap="sm">
              <Text fw={600} size="sm">Recent Connections</Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                {recent.map(conn => (
                  <Paper
                    key={conn.id}
                    p="md"
                    withBorder
                    radius="md"
                    style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
                    onClick={() => setActiveConnectionId(conn.id)}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--mantine-color-indigo-5)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '')}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                        <ThemeIcon
                          size={36} radius="md" variant="light"
                          color={ENGINE_COLOR[conn.engine] ?? 'gray'}
                        >
                          <IconDatabase size={18} />
                        </ThemeIcon>
                        <Stack gap={2} style={{ minWidth: 0 }}>
                          <Group gap={6}>
                            <Text size="sm" fw={600} truncate>{conn.name}</Text>
                            {conn.isProduction && <Badge size="xs" color="red" variant="filled">PROD</Badge>}
                          </Group>
                          <Text size="xs" c="dimmed" truncate>
                            {conn.host}/{conn.database}
                          </Text>
                        </Stack>
                      </Group>
                      <ActionIcon variant="subtle" color="indigo" size="sm">
                        <IconChevronRight size={14} />
                      </ActionIcon>
                    </Group>
                  </Paper>
                ))}
              </SimpleGrid>
            </Stack>
          )}

          <Divider />

          {/* Cloud quick-connect */}
          <Stack gap="sm">
            <Stack gap={2}>
              <Text fw={600} size="sm">
                {hasConnections ? 'Add another connection' : 'Get started — connect your database'}
              </Text>
              <Text size="xs" c="dimmed">Paste a connection URL or pick a provider to pre-fill the form</Text>
            </Stack>

            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
              {CLOUD_PRESETS.map(({ label, icon: Icon, color }) => (
                <Paper
                  key={label}
                  p="md"
                  withBorder
                  radius="md"
                  style={{ cursor: 'pointer', textAlign: 'center', transition: 'border-color 0.15s' }}
                  onClick={openAdd}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = `var(--mantine-color-${color}-5)`)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '')}
                >
                  <Stack gap="xs" align="center">
                    <ThemeIcon size={36} radius="md" variant="light" color={color}>
                      <Icon size={20} />
                    </ThemeIcon>
                    <Text size="xs" fw={500}>{label}</Text>
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
          </Stack>

          {/* Empty state prompt */}
          {!hasConnections && (
            <Center py="xl">
              <Stack align="center" gap="md" maw={360}>
                <Logo size={72} />
                <Stack gap="xs" align="center">
                  <Title order={4} ta="center">No connections yet</Title>
                  <Text size="sm" c="dimmed" ta="center">
                    Add your first database connection. Credentials are encrypted with
                    OS-level security — nothing leaves your machine.
                  </Text>
                </Stack>
                <Button size="md" leftSection={<IconPlus size={16} />} onClick={openAdd}>
                  Add Connection
                </Button>
              </Stack>
            </Center>
          )}

          {/* Feature highlights */}
          <Divider />
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            {[
              { icon: IconUsers, color: 'blue', title: 'Users & Roles', desc: 'Create users, set roles, reset passwords — all via forms, no SQL.' },
              { icon: IconShieldLock, color: 'indigo', title: 'Permission Matrix', desc: 'Click cells to grant or revoke. Preview the SQL before applying.' },
              { icon: IconHistory, color: 'teal', title: 'Audit Log', desc: 'Every change recorded. Filter, inspect, and revert in one click.' },
            ].map(({ icon: Icon, color, title, desc }) => (
              <Paper key={title} p="md" withBorder radius="md" style={{ background: 'var(--mantine-color-dark-7)' }}>
                <Stack gap="xs">
                  <ThemeIcon size={32} radius="sm" variant="light" color={color}>
                    <Icon size={16} />
                  </ThemeIcon>
                  <Text size="sm" fw={600}>{title}</Text>
                  <Text size="xs" c="dimmed">{desc}</Text>
                </Stack>
              </Paper>
            ))}
          </SimpleGrid>

        </Stack>
      </Box>

      <AddConnectionModal opened={addOpened} onClose={closeAdd} />
    </>
  )
}
