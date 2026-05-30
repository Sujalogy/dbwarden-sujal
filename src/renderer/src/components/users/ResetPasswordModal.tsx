import { Modal, PasswordInput, Stack, Group, Button, Text, Progress } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useState, useCallback } from 'react'
import { notifications } from '@mantine/notifications'
import { IconRefresh, IconCheck } from '@tabler/icons-react'
import { api } from '../../api'

function generatePassword(len = 20): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => chars[b % chars.length])
    .join('')
}

function strength(pw: string) {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 14) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return { score: s, label: ['Very weak','Weak','Fair','Good','Strong'][s] ?? 'Strong', color: ['red','orange','yellow','teal','green'][s] ?? 'green' }
}

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
  const s = strength(pw)

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
