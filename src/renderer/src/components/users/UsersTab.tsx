import {
  Box, Group, Button, Text, Badge, ActionIcon, Tooltip,
  Table, Stack, LoadingOverlay, Alert, TextInput, ScrollArea
} from '@mantine/core'
import {
  IconPlus, IconTrash, IconKey, IconEdit, IconSearch, IconAlertCircle
} from '@tabler/icons-react'
import { useDisclosure } from '@mantine/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'
import { api } from '../../api'
import CreateUserModal from './CreateUserModal'
import ResetPasswordModal from './ResetPasswordModal'
import EditPrincipalModal from './EditPrincipalModal'
import type { Principal } from '../../../../shared/types'

interface Props { connectionId: string }

export default function UsersTab({ connectionId }: Props) {
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false)
  const [resetTarget, setResetTarget] = useState<Principal | null>(null)
  const [editTarget, setEditTarget] = useState<Principal | null>(null)
  const [search, setSearch] = useState('')
  const qc = useQueryClient()

  const { data: principals = [], isLoading, error } = useQuery({
    queryKey: ['db', connectionId, 'principals'],
    queryFn: () => api.db.listPrincipals(connectionId),
  })

  const filtered = principals.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  function confirmDrop(p: Principal) {
    modals.openConfirmModal({
      title: `Drop ${p.type} "${p.name}"`,
      children: (
        <Stack gap="xs">
          <Text size="sm">This will permanently delete the {p.type}. This cannot be undone.</Text>
          {p.members.length > 0 && (
            <Alert color="orange" icon={<IconAlertCircle size={14} />}>
              This role has {p.members.length} member(s). Dropping it will affect their access.
            </Alert>
          )}
        </Stack>
      ),
      labels: { confirm: 'Drop', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api.db.dropPrincipal(connectionId, p.name)
          qc.invalidateQueries({ queryKey: ['db', connectionId, 'principals'] })
          notifications.show({ message: `Dropped "${p.name}"`, color: 'orange' })
        } catch (err: unknown) {
          notifications.show({ message: (err as Error).message, color: 'red' })
        }
      },
    })
  }

  if (error) {
    return (
      <Box p="md">
        <Alert color="red" icon={<IconAlertCircle size={14} />} title="Failed to load users">
          {(error as Error).message}
        </Alert>
      </Box>
    )
  }

  return (
    <>
      <Stack gap={0} h="100%">
        {/* Toolbar */}
        <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
          <Group justify="space-between">
            <TextInput
              placeholder="Search principals..."
              leftSection={<IconSearch size={14} />}
              size="xs"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ width: 240 }}
            />
            <Button leftSection={<IconPlus size={14} />} size="xs" onClick={openCreate}>
              New User / Role
            </Button>
          </Group>
        </Box>

        {/* Table */}
        <Box style={{ flex: 1, position: 'relative' }}>
          <LoadingOverlay visible={isLoading} />
          <ScrollArea h="100%">
            <Table highlightOnHover stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Login</Table.Th>
                  <Table.Th>Superuser</Table.Th>
                  <Table.Th>Create DB</Table.Th>
                  <Table.Th>Create Role</Table.Th>
                  <Table.Th>Conn Limit</Table.Th>
                  <Table.Th>Member of</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map(p => (
                  <Table.Tr key={p.name}>
                    <Table.Td>
                      <Text size="sm" fw={500}>{p.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="light" color={p.type === 'user' ? 'blue' : 'violet'}>
                        {p.type}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" color={p.canLogin ? 'green' : 'gray'} variant="dot">
                        {p.canLogin ? 'yes' : 'no'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {p.isSuper && <Badge size="xs" color="red" variant="filled">super</Badge>}
                    </Table.Td>
                    <Table.Td>
                      {p.canCreateDb && <Badge size="xs" color="teal" variant="light">yes</Badge>}
                    </Table.Td>
                    <Table.Td>
                      {p.canCreateRole && <Badge size="xs" color="grape" variant="light">yes</Badge>}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {p.connectionLimit === 0 ? '∞' : p.connectionLimit}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={2}>
                        {p.memberOf.slice(0, 3).map(r => (
                          <Badge key={r} size="xs" variant="outline">{r}</Badge>
                        ))}
                        {p.memberOf.length > 3 && (
                          <Text size="xs" c="dimmed">+{p.memberOf.length - 3}</Text>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Tooltip label="Edit">
                          <ActionIcon size="xs" variant="subtle" onClick={() => setEditTarget(p)}>
                            <IconEdit size={12} />
                          </ActionIcon>
                        </Tooltip>
                        {p.type === 'user' && (
                          <Tooltip label="Reset Password">
                            <ActionIcon size="xs" variant="subtle" color="orange" onClick={() => setResetTarget(p)}>
                              <IconKey size={12} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <Tooltip label="Drop">
                          <ActionIcon size="xs" variant="subtle" color="red" onClick={() => confirmDrop(p)}>
                            <IconTrash size={12} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <Table.Tr>
                    <Table.Td colSpan={9}>
                      <Text ta="center" c="dimmed" size="sm" py="xl">No principals found</Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Box>
      </Stack>

      <CreateUserModal
        opened={createOpened}
        onClose={closeCreate}
        connectionId={connectionId}
        existingRoles={principals.filter(p => p.type === 'role').map(p => p.name)}
      />

      {resetTarget && (
        <ResetPasswordModal
          opened={!!resetTarget}
          onClose={() => setResetTarget(null)}
          connectionId={connectionId}
          principalName={resetTarget.name}
        />
      )}

      {editTarget && (
        <EditPrincipalModal
          opened={!!editTarget}
          onClose={() => setEditTarget(null)}
          connectionId={connectionId}
          principal={editTarget}
          existingRoles={principals.filter(p => p.type === 'role').map(p => p.name)}
        />
      )}
    </>
  )
}
