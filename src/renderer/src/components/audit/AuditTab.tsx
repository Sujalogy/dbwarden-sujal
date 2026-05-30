import {
  Box, Stack, Text, Badge, Group, ActionIcon, Tooltip,
  Alert, ScrollArea, Code, Collapse, LoadingOverlay, Table, Button, TextInput, Select
} from '@mantine/core'
import { IconAlertCircle, IconRotateClockwise, IconChevronDown, IconChevronRight, IconRefresh, IconSearch, IconFilter } from '@tabler/icons-react'
import { DatePickerInput } from '@mantine/dates'
import '@mantine/dates/styles.css'
import dayjs from 'dayjs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { api } from '../../api'
import type { AuditEntry } from '../../../../shared/types'

interface Props { connectionId: string }

function formatDate(iso: string) {
  return dayjs(iso).format('DD/MM/YYYY, hh:mm:ss A')
}

export default function AuditTab({ connectionId }: Props) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ['audit', connectionId],
    queryFn: () => api.audit.list(connectionId),
    refetchInterval: 10_000,
  })

  const [showFilters, setShowFilters] = useState<boolean>(false)
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null])
  const [permissionFilter, setPermissionFilter] = useState<string | null>(null)
  const [grantFilter, setGrantFilter] = useState<string | null>(null)
  const [userFilter, setUserFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [statementFilter, setStatementFilter] = useState<string>('')

  const filteredEntries = entries.filter(entry => {
    if (dateRange[0]) {
      const entryDate = dayjs(entry.timestamp)
      const start = dayjs(dateRange[0]).startOf('day')
      if (entryDate.isBefore(start)) return false
      
      if (dateRange[1]) {
        const end = dayjs(dateRange[1]).endOf('day')
        if (entryDate.isAfter(end)) return false
      }
    }

    if (permissionFilter) {
      if (!entry.action.includes(permissionFilter) && !entry.statements.some(s => s.includes(permissionFilter))) return false
    }

    if (grantFilter) {
      if (!entry.action.toUpperCase().startsWith(grantFilter.toUpperCase()) && !entry.statements.some(s => s.toUpperCase().includes(grantFilter.toUpperCase()))) return false
    }

    if (userFilter) {
      const query = userFilter.toLowerCase()
      if (!entry.action.toLowerCase().includes(query) && !entry.statements.some(s => s.toLowerCase().includes(query))) return false
    }

    if (statusFilter === 'success' && !entry.success) return false
    if (statusFilter === 'failed' && entry.success) return false

    if (statementFilter) {
      const query = statementFilter.toLowerCase()
      if (!entry.statements.some(s => s.toLowerCase().includes(query))) return false
    }

    return true
  })

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function confirmRevert(entry: AuditEntry) {
    modals.openConfirmModal({
      title: 'Revert this change?',
      children: (
        <Stack gap="xs">
          <Text size="sm">The following inverse statements will be executed:</Text>
          {entry.reverseStatements?.map((s, i) => (
            <Code key={i} block style={{ fontSize: 11 }}>{s}</Code>
          ))}
        </Stack>
      ),
      labels: { confirm: 'Revert', cancel: 'Cancel' },
      confirmProps: { color: 'orange' },
      onConfirm: async () => {
        try {
          const result = await api.audit.revert(entry.id)
          if (result.success) {
            notifications.show({ message: 'Change reverted', color: 'green' })
            qc.invalidateQueries({ queryKey: ['audit', connectionId] })
            qc.invalidateQueries({ queryKey: ['db', connectionId] })
          } else {
            notifications.show({ message: result.error ?? 'Revert failed', color: 'red' })
          }
        } catch (err: unknown) {
          notifications.show({ message: (err as Error).message, color: 'red' })
        }
      },
    })
  }

  if (error) {
    return (
      <Box p="md">
        <Alert color="red" icon={<IconAlertCircle size={14} />}>
          {(error as Error).message}
        </Alert>
      </Box>
    )
  }

  return (
    <Stack gap={0} h="100%">
      <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', flexShrink: 0 }}>
        <Group justify="space-between">
          <Text size="sm" fw={600}>Audit Log</Text>
          <Group gap="xs">
            <Button
              leftSection={<IconFilter size={14} />}
              size="xs"
              variant={showFilters ? 'light' : 'subtle'}
              onClick={() => setShowFilters(f => !f)}
            >
              Filter
            </Button>
            <Button
              leftSection={<IconRefresh size={14} />}
              size="xs"
              variant="subtle"
              onClick={() => qc.invalidateQueries({ queryKey: ['audit', connectionId] })}
            >
              Refresh
            </Button>
          </Group>
        </Group>
      </Box>

      {showFilters && (
        <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', background: 'var(--mantine-color-dark-8)', overflowX: 'auto', flexShrink: 0 }}>
          <Group align="flex-end" wrap="nowrap" style={{ minWidth: 800 }}>
            <DatePickerInput
              type="range"
              label="Date range"
              placeholder="Pick dates range"
              value={dateRange}
              onChange={setDateRange}
              size="xs"
              clearable
              w={220}
            />
            <Select
              label="Permission"
              placeholder="Any"
              data={['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']}
              value={permissionFilter}
              onChange={setPermissionFilter}
              size="xs"
              clearable
              w={120}
            />
            <Select
              label="Action Type"
              placeholder="Any"
              data={['GRANT', 'REVOKE', 'CREATE', 'DROP', 'ALTER']}
              value={grantFilter}
              onChange={setGrantFilter}
              size="xs"
              clearable
              w={120}
            />
            <Select
              label="Status"
              placeholder="All"
              data={[
                { label: 'All', value: 'all' },
                { label: 'Success', value: 'success' },
                { label: 'Failed', value: 'failed' }
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
              size="xs"
              clearable
              w={100}
            />
            <TextInput
              label="User / Principal"
              placeholder="Filter by user..."
              value={userFilter}
              onChange={e => setUserFilter(e.currentTarget.value)}
              size="xs"
              leftSection={<IconSearch size={14} />}
              style={{ flex: 1 }}
            />
            <TextInput
              label="SQL Statement"
              placeholder="Search statements..."
              value={statementFilter}
              onChange={e => setStatementFilter(e.currentTarget.value)}
              size="xs"
              leftSection={<IconSearch size={14} />}
              style={{ flex: 1 }}
            />
          </Group>
        </Box>
      )}

      <Box style={{ flex: 1, position: 'relative' }}>
        <LoadingOverlay visible={isLoading} />
        <ScrollArea h="100%">
          {entries.length === 0 && !isLoading && (
            <Text c="dimmed" ta="center" size="sm" py="xl">No audit entries yet for this connection.</Text>
          )}
          {entries.length > 0 && filteredEntries.length === 0 && !isLoading && (
            <Text c="dimmed" ta="center" size="sm" py="xl">No entries match your filters. Try clearing them.</Text>
          )}
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={24} />
                <Table.Th>Timestamp</Table.Th>
                <Table.Th>Action</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Statements</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredEntries.map(entry => (
                <>
                  <Table.Tr key={entry.id} style={{ cursor: 'pointer' }} onClick={() => toggleExpand(entry.id)}>
                    <Table.Td>
                      {expanded.has(entry.id)
                        ? <IconChevronDown size={12} />
                        : <IconChevronRight size={12} />}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">{formatDate(entry.timestamp)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{entry.action}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="xs"
                        color={entry.success ? 'green' : 'red'}
                        variant="light"
                      >
                        {entry.success ? 'success' : 'failed'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">{entry.statements.length} stmt{entry.statements.length > 1 ? 's' : ''}</Text>
                    </Table.Td>
                    <Table.Td>
                      {entry.reversible && entry.reverseStatements?.length && (
                        <Tooltip label="Revert this change">
                          <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="orange"
                            onClick={(e) => { e.stopPropagation(); confirmRevert(entry) }}
                          >
                            <IconRotateClockwise size={12} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Table.Td>
                  </Table.Tr>

                  {expanded.has(entry.id) && (
                    <Table.Tr key={entry.id + '-detail'}>
                      <Table.Td colSpan={6} style={{ background: 'var(--mantine-color-dark-7)', padding: '8px 16px' }}>
                        <Stack gap="xs">
                          {entry.error && (
                            <Alert color="red" size="xs">{entry.error}</Alert>
                          )}
                          {entry.statements.map((s, i) => (
                            <Code key={i} block style={{ fontSize: 11 }}>{s}</Code>
                          ))}
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Box>
    </Stack>
  )
}
