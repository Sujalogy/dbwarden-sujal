import { listConnections, getCredentials } from '../vault'
import { PostgresAdapter } from './postgres'

type AnyAdapter = PostgresAdapter

const active = new Map<string, AnyAdapter>()

export async function getAdapter(connectionId: string): Promise<AnyAdapter> {
  if (active.has(connectionId)) return active.get(connectionId)!

  const connections = listConnections()
  const config = connections.find(c => c.id === connectionId)
  if (!config) throw new Error(`Connection "${connectionId}" not found`)

  const { password, sshPassword } = getCredentials(connectionId)

  let adapter: AnyAdapter
  switch (config.engine) {
    case 'postgres':
      adapter = new PostgresAdapter()
      break
    default:
      throw new Error(`Engine "${config.engine}" is not yet supported`)
  }

  await adapter.connect(config, password, sshPassword)
  active.set(connectionId, adapter)
  return adapter
}

export async function disconnectAdapter(connectionId: string): Promise<void> {
  const adapter = active.get(connectionId)
  if (adapter) {
    await adapter.disconnect()
    active.delete(connectionId)
  }
}

export async function disconnectAll(): Promise<void> {
  for (const id of active.keys()) {
    await disconnectAdapter(id)
  }
}
