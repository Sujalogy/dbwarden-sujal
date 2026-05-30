import {
  Modal, TextInput, PasswordInput, Select, NumberInput, Switch,
  Stack, Group, Button, Divider, Collapse, Text, Alert, Badge,
  Textarea, Tabs, Autocomplete
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle, IconCheck, IconDatabase } from '@tabler/icons-react'
import { api } from '../../api'
import type { TestResult, StoredConnection } from '../../../../shared/types'

const DEFAULT_PORTS: Record<string, number> = {
  postgres: 5432, mysql: 3306, mongodb: 27017, redis: 6379, sqlite: 0
}

const ENGINE_FROM_PROTOCOL: Record<string, string> = {
  postgresql: 'postgres', postgres: 'postgres',
  mysql: 'mysql', mariadb: 'mysql',
  mongodb: 'mongodb', 'mongodb+srv': 'mongodb',
  redis: 'redis', rediss: 'redis',
}

function parseConnectionUrl(url: string): Partial<{
  engine: string; host: string; port: number; database: string;
  username: string; password: string; sslEnabled: boolean
}> | null {
  try {
    const u = new URL(url.trim())
    const protocol = u.protocol.replace(':', '')
    const engine = ENGINE_FROM_PROTOCOL[protocol]
    if (!engine) return null
    const database = u.pathname.replace(/^\//, '')
    const sslmode = u.searchParams.get('sslmode')
    return {
      engine,
      host: u.hostname || '',
      port: u.port ? parseInt(u.port, 10) : DEFAULT_PORTS[engine],
      database: database || '',
      username: u.username ? decodeURIComponent(u.username) : '',
      password: u.password ? decodeURIComponent(u.password) : '',
      sslEnabled: sslmode !== 'disable',
    }
  } catch {
    return null
  }
}

interface Props { opened: boolean; onClose: () => void; connectionToEdit?: StoredConnection }

export default function AddConnectionModal({ opened, onClose, connectionToEdit }: Props) {
  const qc = useQueryClient()
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  const connections = qc.getQueryData<StoredConnection[]>(['connections']) || []
  const existingCompanies = Array.from(new Set(connections.map(c => c.company).filter(Boolean) as string[]))
  const existingProjects = Array.from(new Set(connections.map(c => c.project).filter(Boolean) as string[]))

  const form = useForm({
    initialValues: {
      name: '',
      engine: 'postgres' as string,
      host: '',
      port: 5432,
      database: '',
      username: '',
      password: '',
      isProduction: false,
      company: '',
      companyAbbreviation: '',
      project: '',
      // SSL
      sslEnabled: true,
      sslMode: 'require' as string,
      sslCa: '',
      // SSH
      sshEnabled: false,
      sshHost: '',
      sshPort: 22,
      sshUsername: '',
      sshAuthMethod: 'password' as string,
      sshPassword: '',
      sshPrivateKey: '',
    },
    validate: {
      name: (v) => (v.trim() ? null : 'Name is required'),
      host: (v) => (v.trim() ? null : 'Host is required'),
      database: (v) => (v.trim() ? null : 'Database is required'),
      username: (v) => (v.trim() ? null : 'Username is required'),
      password: (v) => (connectionToEdit || v.trim() ? null : 'Password is required'),
      sshHost: (v, vals) => (vals.sshEnabled && !v.trim() ? 'SSH host is required' : null),
      sshUsername: (v, vals) => (vals.sshEnabled && !v.trim() ? 'SSH username is required' : null),
    },
  })

  useEffect(() => {
    if (opened) {
      if (connectionToEdit) {
        form.setValues({
          name: connectionToEdit.name,
          engine: connectionToEdit.engine,
          host: connectionToEdit.host,
          port: connectionToEdit.port,
          database: connectionToEdit.database,
          username: connectionToEdit.username,
          password: '',
          isProduction: connectionToEdit.isProduction || false,
          company: connectionToEdit.company || '',
          companyAbbreviation: connectionToEdit.companyAbbreviation || '',
          project: connectionToEdit.project || '',
          sslEnabled: connectionToEdit.ssl.enabled,
          sslMode: connectionToEdit.ssl.mode,
          sslCa: connectionToEdit.ssl.ca || '',
          sshEnabled: connectionToEdit.ssh.enabled,
          sshHost: connectionToEdit.ssh.host,
          sshPort: connectionToEdit.ssh.port,
          sshUsername: connectionToEdit.ssh.username,
          sshAuthMethod: connectionToEdit.ssh.authMethod,
          sshPassword: '',
          sshPrivateKey: connectionToEdit.ssh.privateKey || '',
        })
      } else {
        form.reset()
      }
      setTestResult(null)
    }
  }, [opened, connectionToEdit])

  function handleEngineChange(engine: string | null) {
    if (!engine) return
    form.setFieldValue('engine', engine)
    form.setFieldValue('port', DEFAULT_PORTS[engine] ?? 5432)
    setTestResult(null)
  }

  function handleUrlPaste(url: string) {
    const parsed = parseConnectionUrl(url)
    if (!parsed) return
    if (parsed.engine) { form.setFieldValue('engine', parsed.engine); form.setFieldValue('port', parsed.port ?? DEFAULT_PORTS[parsed.engine] ?? 5432) }
    if (parsed.host) form.setFieldValue('host', parsed.host)
    if (parsed.port) form.setFieldValue('port', parsed.port)
    if (parsed.database) form.setFieldValue('database', parsed.database)
    if (parsed.username) form.setFieldValue('username', parsed.username)
    if (parsed.password) form.setFieldValue('password', parsed.password)
    if (parsed.sslEnabled !== undefined) form.setFieldValue('sslEnabled', parsed.sslEnabled)
    setTestResult(null)
    notifications.show({ message: 'Connection URL parsed — review and save.', color: 'green' })
  }

  function buildPayload() {
    const v = form.values
    return {
      config: {
        name: v.name.trim(),
        engine: v.engine as 'postgres',
        host: v.host.trim(),
        port: v.port,
        database: v.database.trim(),
        username: v.username.trim(),
        isProduction: v.isProduction,
        company: v.company.trim() || undefined,
        companyAbbreviation: v.companyAbbreviation.trim() || undefined,
        project: v.project.trim() || undefined,
        ssl: {
          enabled: v.sslEnabled,
          mode: v.sslMode as 'require' | 'verify-full',
          ca: v.sslCa.trim() || undefined,
        },
        ssh: {
          enabled: v.sshEnabled,
          host: v.sshHost.trim(),
          port: v.sshPort,
          username: v.sshUsername.trim(),
          authMethod: v.sshAuthMethod as 'password' | 'key',
          privateKey: v.sshAuthMethod === 'key' ? v.sshPrivateKey.trim() || undefined : undefined,
        },
      },
      password: v.password,
      sshPassword: v.sshEnabled && v.sshAuthMethod === 'password' ? v.sshPassword : undefined,
    }
  }

  async function handleTest() {
    const result = form.validate()
    if (result.hasErrors) return
    setTesting(true)
    setTestResult(null)
    try {
      const payload = buildPayload()
      const res = await api.connections.test({ config: payload.config, password: payload.password, sshPassword: payload.sshPassword })
      setTestResult(res)
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    const result = form.validate()
    if (result.hasErrors) return
    setSaving(true)
    try {
      const payload = buildPayload()
      if (connectionToEdit) {
        await api.connections.update(connectionToEdit.id, payload.config, payload.password || undefined, payload.sshPassword || undefined)
        notifications.show({ message: `Connection "${payload.config.name}" updated`, color: 'green', icon: <IconCheck size={14} /> })
      } else {
        await api.connections.save(payload)
        notifications.show({ message: `Connection "${payload.config.name}" saved`, color: 'green', icon: <IconCheck size={14} /> })
      }
      qc.invalidateQueries({ queryKey: ['connections'] })
      form.reset()
      setTestResult(null)
      onClose()
    } catch (err: unknown) {
      notifications.show({ message: (err as Error).message, color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    form.reset()
    setTestResult(null)
    onClose()
  }

  const v = form.values

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <IconDatabase size={16} />
          <Text fw={600}>{connectionToEdit ? 'Edit Database Connection' : 'Add Database Connection'}</Text>
        </Group>
      }
      size="lg"
      scrollAreaComponent={undefined}
    >
      <Stack gap="sm">
        <Tabs defaultValue="basic">
          <Tabs.List>
            <Tabs.Tab value="basic">Connection</Tabs.Tab>
            <Tabs.Tab value="ssl">SSL / TLS</Tabs.Tab>
            <Tabs.Tab value="ssh">SSH Tunnel</Tabs.Tab>
          </Tabs.List>

          {/* ── Basic ── */}
          <Tabs.Panel value="basic" pt="sm">
            <Stack gap="sm">
              {/* URL paste shortcut */}
              <TextInput
                label="Paste a connection URL (optional)"
                description="postgresql://user:pass@host:5432/db — auto-fills all fields below"
                placeholder="postgresql:// or mongodb:// or redis://..."
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text')
                  if (text.includes('://')) { e.preventDefault(); handleUrlPaste(text) }
                }}
                onBlur={(e) => { if (e.target.value.includes('://')) handleUrlPaste(e.target.value) }}
              />
              <Divider label="or fill manually" labelPosition="center" />
              <Group grow>
                <TextInput label="Display Name" placeholder="My RDS Instance" required {...form.getInputProps('name')} />
                <Select
                  label="Engine"
                  required
                  data={[
                    { value: 'postgres', label: 'PostgreSQL' },
                    { value: 'mysql', label: 'MySQL / MariaDB' },
                    { value: 'mongodb', label: 'MongoDB' },
                    { value: 'redis', label: 'Redis' },
                    { value: 'sqlite', label: 'SQLite' },
                  ]}
                  value={v.engine}
                  onChange={handleEngineChange}
                />
              </Group>

              <Group grow>
                <TextInput label="Host" placeholder="db.example.us-east-1.rds.amazonaws.com" required {...form.getInputProps('host')} />
                <NumberInput label="Port" required min={1} max={65535} {...form.getInputProps('port')} style={{ maxWidth: 110 }} />
              </Group>

              <TextInput label="Database" placeholder="mydb" required {...form.getInputProps('database')} />

              <Group grow>
                <TextInput label="Username" placeholder="admin" required {...form.getInputProps('username')} />
                <PasswordInput 
                  label="Password" 
                  required={!connectionToEdit} 
                  placeholder={connectionToEdit ? "(Leave blank to keep existing)" : ""} 
                  {...form.getInputProps('password')} 
                />
              </Group>

              <Group grow>
                <Autocomplete 
                  label="Company (optional)" 
                  placeholder="Acme Corp" 
                  data={existingCompanies} 
                  {...form.getInputProps('company')} 
                />
                <TextInput 
                  label="Abbreviation (optional)" 
                  placeholder="ACME" 
                  {...form.getInputProps('companyAbbreviation')} 
                />
              </Group>

              <Group grow>
                <Autocomplete 
                  label="Project (optional)" 
                  placeholder="Analytics Engine" 
                  data={existingProjects} 
                  {...form.getInputProps('project')} 
                />
              </Group>

              <Group justify="flex-end">
                <Switch
                  label={<Text size="sm" c="red" fw={500}>Production</Text>}
                  description="Adds extra confirmation dialogs"
                  {...form.getInputProps('isProduction', { type: 'checkbox' })}
                />
              </Group>
            </Stack>
          </Tabs.Panel>

          {/* ── SSL ── */}
          <Tabs.Panel value="ssl" pt="sm">
            <Stack gap="sm">
              <Switch
                label="Enable SSL / TLS"
                description="Required for most cloud databases (AWS RDS, Neon, Supabase, etc.)"
                {...form.getInputProps('sslEnabled', { type: 'checkbox' })}
              />
              <Collapse in={v.sslEnabled}>
                <Stack gap="sm">
                  <Select
                    label="SSL Mode"
                    data={[
                      { value: 'require', label: 'Require (encrypt, no cert check)' },
                      { value: 'verify-ca', label: 'Verify CA' },
                      { value: 'verify-full', label: 'Verify Full (hostname + cert)' },
                    ]}
                    {...form.getInputProps('sslMode')}
                  />
                  <Textarea
                    label="CA Certificate (optional)"
                    description="Paste the PEM content of your CA bundle (e.g. AWS RDS CA)"
                    placeholder="-----BEGIN CERTIFICATE-----"
                    rows={4}
                    {...form.getInputProps('sslCa')}
                  />
                </Stack>
              </Collapse>
            </Stack>
          </Tabs.Panel>

          {/* ── SSH ── */}
          <Tabs.Panel value="ssh" pt="sm">
            <Stack gap="sm">
              <Switch
                label="Use SSH Tunnel"
                description="Connect via an intermediate bastion / jump host"
                {...form.getInputProps('sshEnabled', { type: 'checkbox' })}
              />
              <Collapse in={v.sshEnabled}>
                <Stack gap="sm">
                  <Group grow>
                    <TextInput label="SSH Host" placeholder="bastion.example.com" {...form.getInputProps('sshHost')} />
                    <NumberInput label="SSH Port" min={1} max={65535} {...form.getInputProps('sshPort')} style={{ maxWidth: 110 }} />
                  </Group>
                  <TextInput label="SSH Username" {...form.getInputProps('sshUsername')} />
                  <Select
                    label="Auth Method"
                    data={[
                      { value: 'password', label: 'Password' },
                      { value: 'key', label: 'Private Key' },
                    ]}
                    {...form.getInputProps('sshAuthMethod')}
                  />
                  {v.sshAuthMethod === 'password' && (
                    <PasswordInput 
                      label="SSH Password" 
                      placeholder={connectionToEdit ? "(Leave blank to keep existing)" : ""} 
                      {...form.getInputProps('sshPassword')} 
                    />
                  )}
                  {v.sshAuthMethod === 'key' && (
                    <Textarea
                      label="Private Key (PEM)"
                      placeholder="-----BEGIN RSA PRIVATE KEY-----"
                      rows={5}
                      {...form.getInputProps('sshPrivateKey')}
                    />
                  )}
                </Stack>
              </Collapse>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* Test result */}
        {testResult && (
          <Alert
            color={testResult.success ? 'green' : 'red'}
            icon={testResult.success ? <IconCheck size={14} /> : <IconAlertCircle size={14} />}
          >
            {testResult.success
              ? `Connected as ${testResult.currentUser} · ${testResult.serverVersion} · ${testResult.latencyMs}ms`
              : testResult.error}
          </Alert>
        )}

        <Divider />

        <Group justify="flex-end">
          <Button variant="subtle" onClick={handleClose}>Cancel</Button>
          <Button variant="light" loading={testing} onClick={handleTest}>Test Connection</Button>
          <Button loading={saving} onClick={handleSave}>Save Connection</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
