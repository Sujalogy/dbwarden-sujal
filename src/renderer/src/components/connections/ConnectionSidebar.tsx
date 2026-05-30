import {
  Stack, Text, Group, ActionIcon, Tooltip, ScrollArea,
  Box, Badge, Button, Divider, UnstyledButton
} from '@mantine/core'
import {
  IconPlus, IconDatabase, IconTrash, IconCircleFilled, IconEdit,
  IconChevronRight, IconChevronDown, IconEye, IconEyeOff
} from '@tabler/icons-react'
import { useState, useMemo } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { api } from '../../api'
import { useAppStore } from '../../store/app'
import AddConnectionModal from './AddConnectionModal'
import type { StoredConnection } from '../../../../shared/types'

const ENGINE_COLORS: Record<string, string> = {
  postgres: 'blue', mysql: 'orange', mongodb: 'green', redis: 'red', sqlite: 'gray'
}

export default function ConnectionSidebar() {
  const [opened, { open, close }] = useDisclosure(false)
  const [editingConnection, setEditingConnection] = useState<StoredConnection | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [obfuscated, setObfuscated] = useState<Record<string, boolean>>({})
  const { activeConnectionId, setActiveConnectionId } = useAppStore()
  const qc = useQueryClient()

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.connections.list(),
  })

  function toggleGroup(group: string) {
    setExpandedGroups(prev => {
      const isExpanded = prev[group] !== false
      return { ...prev, [group]: !isExpanded }
    })
  }

  function toggleObfuscate(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const willBeObfuscated = !obfuscated[id]
    setObfuscated(prev => ({ ...prev, [id]: willBeObfuscated }))
    
    if (willBeObfuscated && activeConnectionId) {
      const activeConn = connections.find(c => c.id === activeConnectionId)
      if (activeConn) {
        const [type, name] = id.split(':')
        if (type === 'company' && activeConn.company === name) {
          setActiveConnectionId(null)
        } else if (type === 'project' && activeConn.project === name) {
          setActiveConnectionId(null)
        }
      }
    }
  }

  const { companies, ungrouped } = useMemo(() => {
    const c: Record<string, { projects: Record<string, typeof connections>, noProject: typeof connections }> = {}
    const u: typeof connections = []
    for (const conn of connections) {
      if (conn.company) {
        if (!c[conn.company]) {
          c[conn.company] = { projects: {}, noProject: [] }
        }
        if (conn.project) {
          if (!c[conn.company].projects[conn.project]) {
            c[conn.company].projects[conn.project] = []
          }
          c[conn.company].projects[conn.project].push(conn)
        } else {
          c[conn.company].noProject.push(conn)
        }
      } else {
        u.push(conn)
      }
    }
    return { companies: c, ungrouped: u }
  }, [connections])

  function handleSelect(id: string) {
    if (id === activeConnectionId) return
    setActiveConnectionId(id)
  }

  function handleDelete(id: string, name: string, e: React.MouseEvent) {
    e.stopPropagation()
    modals.openConfirmModal({
      title: 'Delete connection',
      children: <Text size="sm">Remove <b>{name}</b> from DB Warden? This cannot be undone.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await api.connections.delete(id)
        qc.invalidateQueries({ queryKey: ['connections'] })
        if (activeConnectionId === id) setActiveConnectionId(null)
        notifications.show({ message: `Removed "${name}"`, color: 'gray' })
      },
    })
  }

  const renderConnection = (conn: StoredConnection) => (
    <UnstyledButton
      component="div"
      key={conn.id}
      onClick={() => handleSelect(conn.id)}
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        background: activeConnectionId === conn.id
          ? 'var(--mantine-color-dark-5)'
          : 'transparent',
        padding: '6px 8px',
        cursor: 'pointer'
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <IconCircleFilled
            size={8}
            color={`var(--mantine-color-${ENGINE_COLORS[conn.engine] ?? 'gray'}-4)`}
          />
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Group gap={4} wrap="nowrap">
              <Text size="xs" fw={500} truncate style={{ flex: 1, minWidth: 0 }}>
                {conn.name}
              </Text>
              {conn.isProduction && (
                <Badge color="red" size="xs" variant="dot" p={0} />
              )}
            </Group>
            <Text size="xs" c="dimmed" truncate>
              {conn.host}/{conn.database}
            </Text>
          </Stack>
        </Group>

        <Group gap={4}>
          <Tooltip label="Edit">
            <ActionIcon
              size="xs"
              variant="subtle"
              color="blue"
              onClick={(e) => { e.stopPropagation(); setEditingConnection(conn) }}
            >
              <IconEdit size={12} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Remove">
            <ActionIcon
              size="xs"
              variant="subtle"
              color="red"
              onClick={(e) => handleDelete(conn.id, conn.name, e)}
            >
              <IconTrash size={12} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </UnstyledButton>
  )

  return (
    <>
      <Stack gap={0} h="100%" style={{ overflow: 'hidden' }}>
        {/* Logo / Title */}
        <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
          <Group gap="xs">
            <IconDatabase size={18} color="var(--mantine-color-indigo-4)" />
            <Text fw={700} size="sm" c="indigo.4">DB Warden</Text>
          </Group>
        </Box>

        {/* Add button */}
        <Box px="sm" py="xs">
          <Button
            leftSection={<IconPlus size={14} />}
            variant="light"
            color="indigo"
            size="xs"
            fullWidth
            onClick={open}
          >
            Add Connection
          </Button>
        </Box>

        <Divider />

        {/* Connection list */}
        <ScrollArea flex={1} px="xs" py="xs">
          {connections.length === 0 && (
            <Text c="dimmed" size="xs" ta="center" mt="xl">
              No connections yet
            </Text>
          )}
          <Stack gap={2}>
            {Object.entries(companies).map(([companyName, data]) => {
              const companyId = `company:${companyName}`
              const isCompObfuscated = obfuscated[companyId]
              const abbrev = [...data.noProject, ...Object.values(data.projects).flat()].find(c => c.companyAbbreviation)?.companyAbbreviation || '********'
              
              return (
              <Box key={companyName}>
                <UnstyledButton 
                  onClick={() => toggleGroup(companyId)}
                  style={{ width: '100%', padding: '4px 8px', borderRadius: '4px' }}
                >
                  <Group gap="xs" wrap="nowrap">
                    {expandedGroups[companyId] === false || isCompObfuscated
                      ? <IconChevronRight size={14} color="var(--mantine-color-dimmed)" /> 
                      : <IconChevronDown size={14} color="var(--mantine-color-dimmed)" />
                    }
                    <Text size="xs" fw={isCompObfuscated ? 800 : 600} c="dimmed" truncate style={{ flex: 1, letterSpacing: isCompObfuscated && abbrev === '********' ? 2 : 'normal' }}>
                      {isCompObfuscated ? abbrev : companyName}
                    </Text>
                    <Badge size="sm" variant="light" color="gray">
                      {isCompObfuscated ? '*' : data.noProject.length + Object.values(data.projects).flat().length}
                    </Badge>
                    <ActionIcon size="sm" variant="subtle" color="gray" onClick={(e) => toggleObfuscate(companyId, e)}>
                      {isCompObfuscated ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                    </ActionIcon>
                  </Group>
                </UnstyledButton>
                
                {expandedGroups[companyId] !== false && !isCompObfuscated && (
                  <Stack gap={2} ml="md" mt={2}>
                    {Object.entries(data.projects).map(([projectName, conns]) => {
                      const projectId = `project:${companyName}:${projectName}`
                      const isProjObfuscated = obfuscated[projectId]

                      return (
                      <Box key={projectName}>
                        <UnstyledButton 
                          onClick={() => toggleGroup(projectId)}
                          style={{ width: '100%', padding: '4px 8px', borderRadius: '4px' }}
                        >
                          <Group gap="xs" wrap="nowrap">
                            {expandedGroups[projectId] === false || isProjObfuscated
                              ? <IconChevronRight size={14} color="var(--mantine-color-dimmed)" /> 
                              : <IconChevronDown size={14} color="var(--mantine-color-dimmed)" />
                            }
                            <Text size="xs" fw={isProjObfuscated ? 800 : 600} c="dimmed" truncate style={{ flex: 1, letterSpacing: isProjObfuscated ? 2 : 'normal' }}>
                              {isProjObfuscated ? '********' : projectName}
                            </Text>
                            <Badge size="xs" variant="light" color="gray">
                              {isProjObfuscated ? '*' : conns.length}
                            </Badge>
                            <ActionIcon size="sm" variant="subtle" color="gray" onClick={(e) => toggleObfuscate(projectId, e)}>
                              {isProjObfuscated ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                            </ActionIcon>
                          </Group>
                        </UnstyledButton>
                        
                        {expandedGroups[projectId] !== false && !isProjObfuscated && (
                          <Stack gap={2} ml="md" mt={2}>
                            {conns.map(c => renderConnection(c))}
                          </Stack>
                        )}
                      </Box>
                    )})}
                    {data.noProject.map(c => renderConnection(c))}
                  </Stack>
                )}
              </Box>
            )})}

            {ungrouped.length > 0 && Object.keys(companies).length > 0 && (
              <Box mt="xs">
                <Text size="xs" fw={600} c="dimmed" px="sm" mb={4}>UNGROUPED ({ungrouped.length})</Text>
                <Stack gap={2}>
                  {ungrouped.map(c => renderConnection(c))}
                </Stack>
              </Box>
            )}

            {ungrouped.length > 0 && Object.keys(companies).length === 0 && (
              <Stack gap={2}>
                {ungrouped.map(c => renderConnection(c))}
              </Stack>
            )}
          </Stack>
        </ScrollArea>
      </Stack>

      <AddConnectionModal 
        opened={opened || !!editingConnection} 
        onClose={() => { close(); setEditingConnection(null) }} 
        connectionToEdit={editingConnection ?? undefined} 
      />
    </>
  )
}
