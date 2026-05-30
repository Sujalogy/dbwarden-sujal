import { Modal, Switch, NumberInput, TextInput, MultiSelect, Stack, Group, Button, Text, Divider } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { IconCheck } from '@tabler/icons-react'
import { api } from '../../api'
import type { Principal } from '../../../../shared/types'

interface Props {
  opened: boolean
  onClose: () => void
  connectionId: string
  principal: Principal
  existingRoles: string[]
}

export default function EditPrincipalModal({ opened, onClose, connectionId, principal, existingRoles }: Props) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)

  const form = useForm({
    initialValues: {
      canLogin: principal.canLogin,
      isSuper: principal.isSuper,
      canCreateDb: principal.canCreateDb,
      canCreateRole: principal.canCreateRole,
      connectionLimit: principal.connectionLimit,
      validUntil: principal.validUntil ?? '',
      memberOf: principal.memberOf,
    },
  })

  async function handleSave() {
    setSaving(true)
    try {
      await api.db.alterPrincipal(connectionId, principal.name, form.values)
      qc.invalidateQueries({ queryKey: ['db', connectionId, 'principals'] })
      notifications.show({ message: `Updated "${principal.name}"`, color: 'green', icon: <IconCheck size={14} /> })
      onClose()
    } catch (err: unknown) {
      notifications.show({ message: (err as Error).message, color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={600}>Edit — {principal.name}</Text>} size="md">
      <Stack gap="sm">
        <Group grow>
          <Switch label="Can Login" {...form.getInputProps('canLogin', { type: 'checkbox' })} />
          <Switch label="Superuser" {...form.getInputProps('isSuper', { type: 'checkbox' })} />
        </Group>
        <Group grow>
          <Switch label="Create DB" {...form.getInputProps('canCreateDb', { type: 'checkbox' })} />
          <Switch label="Create Role" {...form.getInputProps('canCreateRole', { type: 'checkbox' })} />
        </Group>
        <Group grow>
          <NumberInput label="Connection Limit" description="0 = unlimited" min={-1} {...form.getInputProps('connectionLimit')} />
          <TextInput label="Valid Until" placeholder="2027-01-01" {...form.getInputProps('validUntil')} />
        </Group>
        <MultiSelect
          label="Member of Roles"
          data={existingRoles}
          placeholder="Select roles"
          searchable
          {...form.getInputProps('memberOf')}
        />
        <Divider />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={handleSave}>Save Changes</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
