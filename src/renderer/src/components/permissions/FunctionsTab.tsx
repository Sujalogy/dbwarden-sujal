import {
  Box, Stack, Group, Select, Text, Badge, Checkbox, Button, Alert,
  Drawer, ScrollArea, Divider, LoadingOverlay, Code, ActionIcon,
  Tooltip, Accordion, Paper, TextInput
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { notifications } from '@mantine/notifications'
import { IconShieldLock, IconAlertCircle, IconCheck, IconX, IconMathFunction } from '@tabler/icons-react'
import { api } from '../../api'
import type { DbFunction, FunctionPrivilege } from '../../../../shared/types'

interface Props { connectionId: string }

interface PendingChange {
  func: DbFunction
  grant: boolean // true = grant, false = revoke
}

export default function FunctionsTab({ connectionId }: Props) {
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

  const { data: functions = [], isLoading: funcsLoading } = useQuery({
    queryKey: ['db', connectionId, 'functions', selectedSchema],
    queryFn: () => api.db.getFunctions(connectionId, selectedSchema!),
    enabled: !!currentConn && !!selectedSchema,
  })

  const { data: privileges = [], isLoading: privsLoading } = useQuery({
    queryKey: ['db', connectionId, 'function_privileges', selectedSchema, selectedPrincipal],
    queryFn: () => api.db.getFunctionPrivileges(connectionId, selectedSchema!, selectedPrincipal!),
    enabled: !!selectedSchema && !!selectedPrincipal,
  })

  const filteredFunctions = useMemo(() => {
    if (!searchQuery) return functions
    const lower = searchQuery.toLowerCase()
    return functions.filter(f => f.name.toLowerCase().includes(lower) || f.args.toLowerCase().includes(lower))
  }, [functions, searchQuery])

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

  function hasPrivilege(func: DbFunction): boolean {
    const pendingEntry = pending.find(p => p.func.oid === func.oid)
    if (pendingEntry) return pendingEntry.grant

    const entry = privileges.find(e => e.functionIdentity === func.fullIdentity)
    return entry?.canExecute ?? false
  }

  function togglePrivilege(func: DbFunction) {
    const current = hasPrivilege(func)
    const existing = pending.findIndex(p => p.func.oid === func.oid)

    if (existing >= 0) {
      setPending(prev => prev.filter((_, i) => i !== existing))
      return
    }

    const shouldGrant = !current
    setPending(prev => [...prev, { func, grant: shouldGrant }])
  }

  function getColumnState(): 'all' | 'some' | 'none' {
    if (filteredFunctions.length === 0) return 'none'
    let count = 0
    for (const func of filteredFunctions) {
      if (hasPrivilege(func)) count++
    }
    if (count === 0) return 'none'
    if (count === filteredFunctions.length) return 'all'
    return 'some'
  }

  function toggleColumn() {
    const state = getColumnState()
    const shouldGrant = state !== 'all'
    
    setPending(prev => {
      let next = [...prev]
      for (const func of filteredFunctions) {
        const current = privileges.find(e => e.functionIdentity === func.fullIdentity)?.canExecute ?? false
        const isPendingIdx = next.findIndex(p => p.func.oid === func.oid)
        
        if (isPendingIdx >= 0) next.splice(isPendingIdx, 1)
        
        if (shouldGrant && !current) {
          next.push({ func, grant: true })
        } else if (!shouldGrant && current) {
          next.push({ func, grant: false })
        }
      }
      return next
    })
  }

  async function applyChanges() {
    if (!selectedPrincipal || pending.length === 0) return
    setApplying(true)
    closeDrawer()

    const grants = pending.map(p => ({
      functionIdentity: p.func.fullIdentity,
      execute: p.grant
    }))

    const result = await api.db.updateFunctionPrivileges(connectionId, {
      principal: selectedPrincipal,
      grants
    })

    if (result.success) {
      notifications.show({ message: 'Function privileges updated', color: 'green', icon: <IconCheck size={14} /> })
      setPending([])
      qc.invalidateQueries({ queryKey: ['db', connectionId, 'function_privileges', selectedSchema, selectedPrincipal] })
      qc.invalidateQueries({ queryKey: ['audit', connectionId] })
    } else {
      notifications.show({ message: result.error ?? 'Failed to apply', color: 'red' })
    }
    
    setApplying(false)
  }

  const isLoading = schemasLoading || funcsLoading || privsLoading

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
              Select a user or role to view and manage their function privileges.
            </Alert>
          )}

          {selectedPrincipal && !selectedSchema && schemas.length > 0 && (
            <Alert icon={<IconShieldLock size={14} />} color="blue" variant="light">
              Select a schema to see the permission matrix for its functions and procedures.
            </Alert>
          )}

          {selectedPrincipal && selectedSchema && functions.length === 0 && !isLoading && (
            <Alert icon={<IconMathFunction size={14} />} color="gray" variant="light">
              No functions or procedures found in schema "{selectedSchema}".
            </Alert>
          )}

          {selectedPrincipal && selectedSchema && functions.length > 0 && (
            <ScrollArea h="100%">
              <Box style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--mantine-color-body)' }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 12px', borderBottom: '1px solid var(--mantine-color-dark-4)', minWidth: 400 }}>
                        <Group justify="space-between" align="center" wrap="nowrap">
                          <Text size="xs" fw={600} c="dimmed">FUNCTION / PROCEDURE</Text>
                          <TextInput
                            size="xs"
                            placeholder="Search routines..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.currentTarget.value)}
                            w={150}
                            radius="xl"
                          />
                        </Group>
                      </th>
                      <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--mantine-color-dark-4)', width: 120 }}>
                        <Stack gap={4} align="center">
                          <Text size="xs" fw={600} c="dimmed">EXECUTE</Text>
                          <Checkbox
                            size="xs"
                            checked={getColumnState() === 'all'}
                            indeterminate={getColumnState() === 'some'}
                            onChange={toggleColumn}
                            style={{ cursor: 'pointer' }}
                          />
                        </Stack>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFunctions.map(func => {
                      const state = hasPrivilege(func)
                      const isPending = pending.some(p => p.func.oid === func.oid)
                      return (
                        <tr key={func.oid} style={{ borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
                          <td style={{ padding: '4px 12px' }}>
                            <Group gap="xs" wrap="nowrap">
                              <Badge size="xs" variant="dot" color={func.type === 'procedure' ? 'grape' : 'blue'}>
                                {func.type}
                              </Badge>
                              <Text size="sm" fw={500} style={{ fontFamily: 'monospace' }}>
                                {func.name}(<Text span c="dimmed" size="xs">{func.args}</Text>)
                              </Text>
                            </Group>
                          </td>
                          <td style={{ padding: '4px 8px' }}>
                            <Group justify="center">
                              <Checkbox
                                checked={state}
                                onChange={() => togglePrivilege(func)}
                                color={isPending ? 'orange' : 'green'}
                                style={{ cursor: 'pointer' }}
                                size="xs"
                              />
                            </Group>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Box>
            </ScrollArea>
          )}
        </Box>
      </Stack>

      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        position="right"
        title={<Group><IconAlertCircle size={20} color="var(--mantine-color-orange-5)"/><Text fw={600}>Preview Changes</Text></Group>}
        size="lg"
      >
        <Stack gap="md">
          <Text size="sm">The following statements will be executed:</Text>
          
          <Paper withBorder p="xs" bg="dark.8">
            <ScrollArea h={400} offsetScrollbars>
              <Code block bg="transparent" color="gray.3" style={{ fontSize: 13 }}>
                {pending.map(p => 
                  p.grant 
                    ? `GRANT EXECUTE ON ROUTINE ${p.func.fullIdentity} TO "${selectedPrincipal}";` 
                    : `REVOKE EXECUTE ON ROUTINE ${p.func.fullIdentity} FROM "${selectedPrincipal}";`
                ).join('\n')}
              </Code>
            </ScrollArea>
          </Paper>

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeDrawer}>Cancel</Button>
            <Button loading={applying} onClick={applyChanges}>Apply Changes</Button>
          </Group>
        </Stack>
      </Drawer>
    </>
  )
}
