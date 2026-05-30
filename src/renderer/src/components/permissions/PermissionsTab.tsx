import {
  Box, Stack, Group, Select, Text, Badge, Checkbox, Button, Alert,
  Drawer, ScrollArea, Divider, LoadingOverlay, Code, ActionIcon,
  Tooltip, Accordion, Paper, TextInput, CopyButton
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { notifications } from '@mantine/notifications'
import { IconShieldLock, IconAlertCircle, IconCheck, IconX, IconCopy } from '@tabler/icons-react'
import { api } from '../../api'
import type { GrantRequest, PrivilegeType, DbObject, PrivilegeEntry } from '../../../../shared/types'

const TABLE_PRIVILEGES: PrivilegeType[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']

interface Props { connectionId: string }

interface PendingChange {
  object: DbObject
  privilege: PrivilegeType
  grant: boolean // true = grant, false = revoke
}

export default function PermissionsTab({ connectionId }: Props) {
  const qc = useQueryClient()
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false)
  const [selectedPrincipal, setSelectedPrincipal] = useState<string | null>(null)
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [pending, setPending] = useState<PendingChange[]>([])
  const [applying, setApplying] = useState(false)

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.connections.list(),
  })
  const currentConn = connections.find(c => c.id === connectionId)
  const currentDb = currentConn?.database

  const { data: principals = [] } = useQuery({
    queryKey: ['db', connectionId, 'principals'],
    queryFn: () => api.db.listPrincipals(connectionId),
  })

  const { data: schemas = [], isLoading: schemasLoading } = useQuery({
    queryKey: ['db', connectionId, 'objects', 'schemas', currentDb],
    queryFn: () => api.db.listObjects(connectionId, { database: currentDb }),
    select: (objs) => objs.filter(o => o.type === 'schema'),
    enabled: !!currentDb,
  })

  const { data: tables = [], isLoading: tablesLoading } = useQuery({
    queryKey: ['db', connectionId, 'objects', 'tables', currentDb, selectedSchema],
    queryFn: () => api.db.listObjects(connectionId, { database: currentDb, schema: selectedSchema ?? undefined }),
    enabled: !!currentDb && !!selectedSchema,
  })

  const { data: privileges = [], isLoading: privsLoading } = useQuery({
    queryKey: ['db', connectionId, 'privileges', selectedPrincipal],
    queryFn: () => api.db.getEffectivePrivileges(connectionId, selectedPrincipal!),
    enabled: !!selectedPrincipal,
  })

  const filteredTables = useMemo(() => {
    if (!searchQuery) return tables
    const lower = searchQuery.toLowerCase()
    return tables.filter(t => t.name.toLowerCase().includes(lower))
  }, [tables, searchQuery])

  const principalOptions = [
    {
      group: 'Users',
      items: principals.filter(p => p.type === 'user').map(p => ({ value: p.name, label: p.name })),
    },
    {
      group: 'Roles',
      items: principals.filter(p => p.type === 'role').map(p => ({ value: p.name, label: p.name })),
    }
  ].filter(g => g.items.length > 0)

  const schemaOptions = schemas.map(s => ({ value: s.name, label: s.name }))

  function hasPrivilege(obj: DbObject, priv: PrivilegeType): 'direct' | 'role' | null {
    const pendingEntry = pending.find(p => p.object.fullPath === obj.fullPath && p.privilege === priv)
    if (pendingEntry) return pendingEntry.grant ? 'direct' : null

    const entry = privileges.find(
      e => e.object.fullPath === obj.fullPath && e.privilege === priv
    )
    return entry?.source ?? null
  }

  function togglePrivilege(obj: DbObject, priv: PrivilegeType) {
    const current = hasPrivilege(obj, priv)
    const existing = pending.findIndex(p => p.object.fullPath === obj.fullPath && p.privilege === priv)

    if (existing >= 0) {
      setPending(prev => prev.filter((_, i) => i !== existing))
      return
    }

    const shouldGrant = current === null
    setPending(prev => [...prev, { object: obj, privilege: priv, grant: shouldGrant }])
  }

  function getColumnState(priv: PrivilegeType): 'all' | 'some' | 'none' {
    if (filteredTables.length === 0) return 'none'
    let count = 0
    for (const table of filteredTables) {
      if (hasPrivilege(table, priv) !== null) count++
    }
    if (count === 0) return 'none'
    if (count === filteredTables.length) return 'all'
    return 'some'
  }

  function toggleColumn(priv: PrivilegeType) {
    const state = getColumnState(priv)
    const shouldGrant = state !== 'all'
    
    setPending(prev => {
      let next = [...prev]
      for (const table of filteredTables) {
        const current = privileges.find(e => e.object.fullPath === table.fullPath && e.privilege === priv)?.source ?? null
        const isPendingIdx = next.findIndex(p => p.object.fullPath === table.fullPath && p.privilege === priv)
        
        if (isPendingIdx >= 0) next.splice(isPendingIdx, 1)
        
        if (shouldGrant && current === null) {
          next.push({ object: table, privilege: priv, grant: true })
        } else if (!shouldGrant && current === 'direct') {
          next.push({ object: table, privilege: priv, grant: false })
        }
      }
      return next
    })
  }

  async function applyChanges() {
    if (!selectedPrincipal || pending.length === 0) return
    setApplying(true)
    closeDrawer()

    const grants = pending.filter(p => p.grant)
    const revokes = pending.filter(p => !p.grant)

    const plans = []
    if (grants.length > 0) {
      const req: GrantRequest = {
        connectionId, principal: selectedPrincipal,
        objects: grants.map(p => p.object),
        privileges: [...new Set(grants.map(p => p.privilege))],
        withGrantOption: false, revoke: false,
      }
      plans.push(await api.db.planGrant(req))
    }
    if (revokes.length > 0) {
      const req: GrantRequest = {
        connectionId, principal: selectedPrincipal,
        objects: revokes.map(p => p.object),
        privileges: [...new Set(revokes.map(p => p.privilege))],
        withGrantOption: false, revoke: true,
      }
      plans.push(await api.db.planGrant(req))
    }

    let allOk = true
    for (const plan of plans) {
      const result = await api.db.applyPlan(plan)
      if (!result.success) {
        notifications.show({ message: result.error ?? 'Failed to apply', color: 'red' })
        allOk = false
        break
      }
    }

    if (allOk) {
      notifications.show({ message: 'Privileges updated', color: 'green', icon: <IconCheck size={14} /> })
      setPending([])
      qc.invalidateQueries({ queryKey: ['db', connectionId, 'privileges', selectedPrincipal] })
    }
    setApplying(false)
  }

  const isLoading = schemasLoading || tablesLoading || privsLoading

  return (
    <>
      <Stack gap={0} h="100%">
        {/* Toolbar */}
        <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
          <Group>
            <Select
              placeholder="Select principal..."
              data={principalOptions}
              value={selectedPrincipal}
              onChange={setSelectedPrincipal}
              searchable
              style={{ width: 220 }}
              size="xs"
            />
            <Select
              placeholder="Select schema..."
              data={schemaOptions}
              value={selectedSchema}
              onChange={setSelectedSchema}
              searchable
              style={{ width: 180 }}
              size="xs"
              disabled={!selectedPrincipal}
            />
            {pending.length > 0 && (
              <Group gap="xs" ml="auto">
                <Badge color="orange" variant="light">{pending.length} pending change{pending.length > 1 ? 's' : ''}</Badge>
                <Button size="xs" variant="light" onClick={openDrawer}>Preview</Button>
                <Button size="xs" loading={applying} onClick={applyChanges}>Apply</Button>
                <ActionIcon size="sm" variant="subtle" color="red" onClick={() => setPending([])}>
                  <IconX size={14} />
                </ActionIcon>
              </Group>
            )}
          </Group>
        </Box>

        {/* Matrix */}
        <Box style={{ flex: 1, position: 'relative', overflow: 'hidden' }} p="md">
          <LoadingOverlay visible={isLoading || applying} />

          {!selectedPrincipal && (
            <Alert icon={<IconShieldLock size={14} />} color="blue" variant="light">
              Select a user or role to view and manage their privileges.
            </Alert>
          )}

          {selectedPrincipal && !selectedSchema && schemas.length > 0 && (
            <Alert icon={<IconShieldLock size={14} />} color="blue" variant="light">
              Select a schema to see the permission matrix for its tables.
            </Alert>
          )}

          {selectedPrincipal && selectedSchema && tables.length > 0 && (
            <ScrollArea h="100%">
              <Box style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--mantine-color-body)' }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 12px', borderBottom: '1px solid var(--mantine-color-dark-4)', minWidth: 250 }}>
                        <Group justify="space-between" align="center" wrap="nowrap">
                          <Text size="xs" fw={600} c="dimmed">TABLE</Text>
                          <TextInput
                            size="xs"
                            placeholder="Search tables..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.currentTarget.value)}
                            w={150}
                            radius="xl"
                          />
                        </Group>
                      </th>
                      {TABLE_PRIVILEGES.map(priv => {
                        const state = getColumnState(priv)
                        return (
                          <th key={priv} style={{ padding: '6px 8px', borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
                            <Stack gap={4} align="center">
                              <Text size="xs" fw={600} c="dimmed">{priv}</Text>
                              <Checkbox
                                size="xs"
                                checked={state === 'all'}
                                indeterminate={state === 'some'}
                                onChange={() => toggleColumn(priv)}
                                style={{ cursor: 'pointer' }}
                              />
                            </Stack>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTables.map(obj => (
                      <tr key={obj.fullPath} style={{ borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
                        <td style={{ padding: '4px 12px' }}>
                          <Text size="sm">{obj.name}</Text>
                        </td>
                        {TABLE_PRIVILEGES.map(priv => {
                          const state = hasPrivilege(obj, priv)
                          const isPending = pending.some(p => p.object.fullPath === obj.fullPath && p.privilege === priv)
                          return (
                            <td key={priv} style={{ padding: '4px 8px' }}>
                              <Group justify="center">
                                <Tooltip
                                  label={state === 'role' ? `Inherited via role` : state === 'direct' ? 'Direct grant' : 'Not granted'}
                                  withArrow
                                >
                                  <Checkbox
                                    checked={state !== null}
                                    indeterminate={state === 'role'}
                                    onChange={() => togglePrivilege(obj, priv)}
                                    disabled={state === 'role' && !isPending}
                                    color={isPending ? 'orange' : state === 'role' ? 'gray' : 'green'}
                                    size="xs"
                                    style={{ cursor: state === 'role' && !isPending ? 'not-allowed' : 'pointer' }}
                                  />
                                </Tooltip>
                              </Group>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            </ScrollArea>
          )}

          {selectedPrincipal && selectedSchema && tables.length === 0 && !isLoading && (
            <Text c="dimmed" size="sm">No tables found in schema "{selectedSchema}".</Text>
          )}
        </Box>
      </Stack>

      {/* Preview drawer */}
      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        title={<Text fw={600}>Preview Changes</Text>}
        position="right"
        size="md"
      >
        <Stack gap="sm">
          <Group justify="space-between" align="flex-end">
            <Text size="sm" c="dimmed">
              The following SQL will be executed when you click Apply:
            </Text>
            <CopyButton value={pending.map(p => p.grant ? `GRANT ${p.privilege} ON TABLE "${p.object.schema}"."${p.object.name}" TO "${selectedPrincipal}";` : `REVOKE ${p.privilege} ON TABLE "${p.object.schema}"."${p.object.name}" FROM "${selectedPrincipal}";`).join('\n')} timeout={2000}>
              {({ copied, copy }) => (
                <Button color={copied ? 'teal' : 'blue'} variant="light" size="xs" onClick={copy} leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}>
                  {copied ? 'Copied' : 'Copy All'}
                </Button>
              )}
            </CopyButton>
          </Group>
          <ScrollArea h={400}>
            <Code block style={{ fontSize: 12 }}>
              {pending.map(p => 
                p.grant
                  ? `GRANT ${p.privilege} ON TABLE "${p.object.schema}"."${p.object.name}" TO "${selectedPrincipal}";`
                  : `REVOKE ${p.privilege} ON TABLE "${p.object.schema}"."${p.object.name}" FROM "${selectedPrincipal}";`
              ).join('\n')}
            </Code>
          </ScrollArea>
          <Divider />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeDrawer}>Close</Button>
            <Button loading={applying} onClick={applyChanges}>Apply Now</Button>
          </Group>
        </Stack>
      </Drawer>
    </>
  )
}
