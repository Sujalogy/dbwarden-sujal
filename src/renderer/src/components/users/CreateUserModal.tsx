import {
  Modal, TextInput, PasswordInput, Switch, NumberInput,
  Stack, Group, Button, MultiSelect, Text, Progress, Divider
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { IconRefresh, IconCheck } from '@tabler/icons-react'
import { api } from '../../api'
import { generatePassword, getPasswordStrength } from '../../utils/password'

interface Props {
  opened: boolean
  onClose: () => void
  connectionId: string
  existingRoles: string[]
}

export default function CreateUserModal({ opened, onClose, connectionId, existingRoles }: Props) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)

  const form = useForm({
    initialValues: {
      username: '',
      password: '',
      canLogin: true,
      isSuper: false,
      canCreateDb: false,
      canCreateRole: false,
      connectionLimit: 0,
      validUntil: '',
      memberOf: [] as string[],
    },
    validate: {
      username: (v) => (v.trim() ? null : 'Username is required'),
      password: (v) => (v.trim() ? null : 'Password is required'),
    },
  })

  const pw = form.values.password
  const strength = getPasswordStrength(pw)

  const handleGenerate = useCallback(() => {
    form.setFieldValue('password', generatePassword())
  }, [form])

  async function handleSave() {
    const result = form.validate()
    if (result.hasErrors) return
    setSaving(true)
    try {
      await api.db.createUser(connectionId, {
        ...form.values,
        username: form.values.username.trim(),
        validUntil: form.values.validUntil || undefined,
      })
      qc.invalidateQueries({ queryKey: ['db', connectionId, 'principals'] })
      notifications.show({
        message: `User "${form.values.username}" created`,
        color: 'green',
        icon: <IconCheck size={14} />
      })
      form.reset()
      onClose()
    } catch (err: unknown) {
      notifications.show({ message: (err as Error).message, color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={() => { form.reset(); onClose() }}
      title={<Text fw={600}>Create User / Role</Text>}
      size="md"
    >
      <Stack gap="sm">
        <TextInput label="Username" required placeholder="app_readonly" {...form.getInputProps('username')} />

        {/* Password with generator */}
        <Stack gap={4}>
          <Group align="flex-end" gap="xs">
            <PasswordInput
              label="Password"
              required
              style={{ flex: 1 }}
              {...form.getInputProps('password')}
            />
            <Button
              leftSection={<IconRefresh size={14} />}
              variant="light"
              size="sm"
              onClick={handleGenerate}
              mb={form.errors.password ? 20 : 0}
            >
              Generate
            </Button>
          </Group>
          {pw && (
            <Group gap="xs" align="center">
              <Progress
                value={(strength.score / 5) * 100}
                color={strength.color}
                size="xs"
                style={{ flex: 1 }}
              />
              <Text size="xs" c={strength.color}>{strength.label}</Text>
            </Group>
          )}
        </Stack>

        <Divider label="Attributes" labelPosition="left" />

        <Group grow>
          <Switch label="Can Login" {...form.getInputProps('canLogin', { type: 'checkbox' })} />
          <Switch label="Superuser" {...form.getInputProps('isSuper', { type: 'checkbox' })} />
        </Group>
        <Group grow>
          <Switch label="Create DB" {...form.getInputProps('canCreateDb', { type: 'checkbox' })} />
          <Switch label="Create Role" {...form.getInputProps('canCreateRole', { type: 'checkbox' })} />
        </Group>

        <Group grow>
          <NumberInput
            label="Connection Limit"
            description="0 = unlimited"
            min={-1}
            {...form.getInputProps('connectionLimit')}
          />
          <TextInput
            label="Valid Until"
            placeholder="2027-01-01"
            description="Leave blank for no expiry"
            {...form.getInputProps('validUntil')}
          />
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
          <Button variant="subtle" onClick={() => { form.reset(); onClose() }}>Cancel</Button>
          <Button loading={saving} onClick={handleSave}>Create</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
