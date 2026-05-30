import { Modal, PasswordInput, Stack, Group, Button, Text, Progress } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useState, useCallback } from 'react'
import { notifications } from '@mantine/notifications'
import { IconRefresh, IconCheck } from '@tabler/icons-react'
import { api } from '../../api'
import { generatePassword, getPasswordStrength } from '../../utils/password'

interface Props {
  opened: boolean
  onClose: () => void
  connectionId: string
  principalName: string
}

export default function ResetPasswordModal({ opened, onClose, connectionId, principalName }: Props) {
  const [saving, setSaving] = useState(false)
  const form = useForm({
    initialValues: { password: '' },
    validate: { password: (v) => (v.trim() ? null : 'Password is required') },
  })

  const pw = form.values.password
  const s = getPasswordStrength(pw)

  const handleGenerate = useCallback(() => form.setFieldValue('password', generatePassword()), [form])

  async function handleSave() {
    if (form.validate().hasErrors) return
    setSaving(true)
    try {
      await api.db.resetPassword(connectionId, principalName, form.values.password)
      notifications.show({ message: `Password reset for "${principalName}"`, color: 'green', icon: <IconCheck size={14} /> })
      form.reset()
      onClose()
    } catch (err: unknown) {
      notifications.show({ message: (err as Error).message, color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal opened={opened} onClose={() => { form.reset(); onClose() }} title={<Text fw={600}>Reset Password — {principalName}</Text>} size="sm">
      <Stack gap="sm">
        <Group align="flex-end" gap="xs">
          <PasswordInput label="New Password" required style={{ flex: 1 }} {...form.getInputProps('password')} />
          <Button leftSection={<IconRefresh size={14} />} variant="light" size="sm" onClick={handleGenerate}>
            Generate
          </Button>
        </Group>
        {pw && (
          <Group gap="xs">
            <Progress value={(s.score / 5) * 100} color={s.color} size="xs" style={{ flex: 1 }} />
            <Text size="xs" c={s.color}>{s.label}</Text>
          </Group>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={() => { form.reset(); onClose() }}>Cancel</Button>
          <Button loading={saving} color="orange" onClick={handleSave}>Reset Password</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
