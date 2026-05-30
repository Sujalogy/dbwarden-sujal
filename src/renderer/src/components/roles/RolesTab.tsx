import {
  Box, Stack, Group, Button, Text, Modal, TextInput,
  MultiSelect, Badge, ActionIcon, Tooltip, Alert, LoadingOverlay,
  Paper, Divider, ScrollArea
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconTrash, IconAlertCircle, IconCheck, IconUsers, IconHierarchy } from '@tabler/icons-react'
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, addEdge } from '@xyflow/react'
import type { Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api } from '../../api'
import type { Role } from '../../../../shared/types'
import { useEffect } from 'react'

interface Props { connectionId: string }

import dagre from 'dagre'

function getLayoutedElements(nodes: any[], edges: any[], direction = 'TB') {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  
  const nodeWidth = 140
  const nodeHeight = 50

  dagreGraph.setGraph({ rankdir: direction })

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    node.targetPosition = direction === 'LR' ? 'left' : 'top'
    node.sourcePosition = direction === 'LR' ? 'right' : 'bottom'
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    }
  })

  return { nodes, edges }
}

function buildGraph(roles: Role[]) {
  const nodes = roles.map((r) => ({
    id: r.name,
    data: {
      label: (
        <div style={{ fontSize: 11, padding: '2px 6px' }}>
          <div style={{ fontWeight: 600, color: r.isBuiltin ? '#868e96' : undefined }}>{r.name}</div>
          {r.members.length > 0 && <div style={{ color: '#868e96', fontSize: 10 }}>{r.members.length} member{r.members.length > 1 ? 's' : ''}</div>}
        </div>
      )
    },
    position: { x: 0, y: 0 },
    style: {
      background: r.isBuiltin ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-dark-5)',
      border: '1px solid var(--mantine-color-dark-3)',
      borderRadius: 8,
      color: 'white',
      padding: 4,
      minWidth: 120,
    },
  }))

  const edges: { id: string; source: string; target: string; animated?: boolean; style?: object }[] = []
  for (const role of roles) {
    for (const member of role.members) {
      edges.push({
        id: `${member}->${role.name}`,
        source: member,
        target: role.name,
        animated: false,
        style: { stroke: 'var(--mantine-color-indigo-4)' },
      })
    }
  }

  return getLayoutedElements(nodes, edges)
}

export default function RolesTab({ connectionId }: Props) {
  const qc = useQueryClient()
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false)
  const [membershipTarget, setMembershipTarget] = useState<Role | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const { data, isLoading, error } = useQuery({
    queryKey: ['db', connectionId, 'roles'],
    queryFn: () => api.db.listRoles(connectionId),
  })
  
  const roles = data ?? []

  useEffect(() => {
    if (!data) return
    const { nodes: n, edges: e } = buildGraph(data)
    setNodes(n as Parameters<typeof setNodes>[0])
    setEdges(e as Parameters<typeof setEdges>[0])
  }, [data, setNodes, setEdges])

  const allNames = roles.map(r => r.name)

  const onConnect = useCallback(async (params: Connection) => {
    if (!params.source || !params.target) return
    const member = params.source
    const role = params.target

    const targetRole = roles.find(r => r.name === role)
    if (!targetRole) return

    if (targetRole.members.includes(member)) {
      notifications.show({ message: `"${member}" is already a member of "${role}"`, color: 'blue' })
      return
    }

    const newMembers = [...targetRole.members, member]
    
    try {
      await api.db.setMembership(connectionId, role, newMembers)
      setEdges(eds => addEdge(params, eds))
      qc.invalidateQueries({ queryKey: ['db', connectionId, 'roles'] })
      qc.invalidateQueries({ queryKey: ['db', connectionId, 'principals'] })
      notifications.show({ message: `Granted role "${role}" to "${member}"`, color: 'green', icon: <IconCheck size={14} /> })
    } catch (err: unknown) {
      notifications.show({ message: (err as Error).message, color: 'red' })
    }
  }, [roles, connectionId, qc, setEdges])

  function confirmDrop(name: string) {
    modals.openConfirmModal({
      title: `Drop role "${name}"`,
      children: <Text size="sm">This will permanently delete the role.</Text>,
      labels: { confirm: 'Drop', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api.db.dropRole(connectionId, name)
          qc.invalidateQueries({ queryKey: ['db', connectionId, 'roles'] })
          qc.invalidateQueries({ queryKey: ['db', connectionId, 'principals'] })
          notifications.show({ message: `Dropped role "${name}"`, color: 'orange' })
        } catch (err: unknown) {
          notifications.show({ message: (err as Error).message, color: 'red' })
        }
      },
    })
  }

  if (error) {
    return (
      <Box p="md">
        <Alert color="red" icon={<IconAlertCircle size={14} />} title="Failed to load roles">
          {(error as Error).message}
        </Alert>
      </Box>
    )
  }

  return (
    <>
      <Stack gap={0} h="100%" style={{ overflow: 'hidden' }}>
        <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
          <Group>
            <Button leftSection={<IconPlus size={14} />} size="xs" onClick={openCreate}>New Role</Button>
          </Group>
        </Box>

        <Group align="stretch" style={{ flex: 1, overflow: 'hidden' }} gap={0} wrap="nowrap">
          {/* Left: role list */}
          <Box w={280} h="100%" style={{ borderRight: '1px solid var(--mantine-color-dark-4)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box px="xs" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
              <Text size="xs" fw={600} c="dimmed">ROLES ({roles.length})</Text>
            </Box>
            <ScrollArea style={{ flex: 1 }}>
              <Stack gap={2} p="xs">
                {roles.map(r => (
                  <Paper key={r.name} p="xs" withBorder
                    style={{ cursor: 'pointer', background: 'var(--mantine-color-dark-6)' }}
                    onClick={() => setMembershipTarget(r)}
                  >
                    <Group justify="space-between">
                      <Stack gap={2}>
                        <Group gap={4}>
                          <IconHierarchy size={12} color="var(--mantine-color-indigo-4)" />
                          <Text size="xs" fw={500}>{r.name}</Text>
                          {r.isBuiltin && <Badge size="xs" variant="dot" color="gray">built-in</Badge>}
                        </Group>
                        {r.members.length > 0 && (
                          <Text size="xs" c="dimmed">{r.members.length} member{r.members.length !== 1 ? 's' : ''}</Text>
                        )}
                      </Stack>
                      {!r.isBuiltin && (
                        <Tooltip label="Drop">
                          <ActionIcon size="xs" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); confirmDrop(r.name) }}>
                            <IconTrash size={12} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </ScrollArea>
          </Box>

          {/* Right: React Flow graph */}
          <Box style={{ flex: 1, position: 'relative', background: 'var(--mantine-color-dark-8)' }}>
            <LoadingOverlay visible={isLoading} />
            {roles.length > 0 ? (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
                colorMode="dark"
              >
                <Background />
                <Controls />
                <MiniMap nodeColor="var(--mantine-color-indigo-6)" />
              </ReactFlow>
            ) : (
              <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Text c="dimmed" size="sm">No roles to display</Text>
              </Box>
            )}
          </Box>
        </Group>
      </Stack>

      {/* Create role modal */}
      <CreateRoleModal
        opened={createOpened}
        onClose={closeCreate}
        connectionId={connectionId}
        onCreated={() => qc.invalidateQueries({ queryKey: ['db', connectionId, 'roles'] })}
      />

      {/* Membership editor */}
      {membershipTarget && (
        <MembershipModal
          opened={!!membershipTarget}
          onClose={() => setMembershipTarget(null)}
          connectionId={connectionId}
          role={membershipTarget}
          allNames={allNames}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['db', connectionId, 'roles'] })
            qc.invalidateQueries({ queryKey: ['db', connectionId, 'principals'] })
            setMembershipTarget(null)
          }}
        />
      )}
    </>
  )
}

function CreateRoleModal({ opened, onClose, connectionId, onCreated }: { opened: boolean; onClose: () => void; connectionId: string; onCreated: () => void }) {
  const [saving, setSaving] = useState(false)
  const form = useForm({ initialValues: { name: '' }, validate: { name: (v) => (v.trim() ? null : 'Role name is required') } })
  async function handleSave() {
    if (form.validate().hasErrors) return
    setSaving(true)
    try {
      await api.db.createRole(connectionId, form.values.name.trim())
      onCreated()
      notifications.show({ message: `Role "${form.values.name}" created`, color: 'green', icon: <IconCheck size={14} /> })
      form.reset(); onClose()
    } catch (err: unknown) {
      notifications.show({ message: (err as Error).message, color: 'red' })
    } finally { setSaving(false) }
  }
  return (
    <Modal opened={opened} onClose={() => { form.reset(); onClose() }} title={<Text fw={600}>Create Role</Text>} size="sm">
      <Stack gap="sm">
        <TextInput label="Role Name" required placeholder="app_readonly" {...form.getInputProps('name')} />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={() => { form.reset(); onClose() }}>Cancel</Button>
          <Button loading={saving} onClick={handleSave}>Create</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function MembershipModal({ opened, onClose, connectionId, role, allNames, onSaved }: { opened: boolean; onClose: () => void; connectionId: string; role: Role; allNames: string[]; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const form = useForm({ initialValues: { members: role.members } })
  async function handleSave() {
    setSaving(true)
    try {
      await api.db.setMembership(connectionId, role.name, form.values.members)
      notifications.show({ message: `Updated members of "${role.name}"`, color: 'green' })
      onSaved()
    } catch (err: unknown) {
      notifications.show({ message: (err as Error).message, color: 'red' })
    } finally { setSaving(false) }
  }
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={600}>Members of "{role.name}"</Text>} size="sm">
      <Stack gap="sm">
        <MultiSelect
          label="Members"
          description="Users and roles that belong to this role"
          data={allNames.filter(n => n !== role.name)}
          searchable
          {...form.getInputProps('members')}
        />
        <Divider />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
