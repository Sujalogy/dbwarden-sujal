import { safeStorage, app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { StoredConnection, ConnectionConfig } from '../shared/types'

export const VAULT_FILE = join(app.getPath('userData'), 'connections.vault')

interface VaultEntry {
  connection: StoredConnection
  encryptedPassword: string
  encryptedSshPassword?: string
}

interface VaultData {
  version: number
  entries: VaultEntry[]
}

// ── In-memory cache (O1 optimization) ──────────────────────────────────────────
let cache: VaultData | null = null

function readVault(): VaultData {
  if (cache) return cache
  if (!existsSync(VAULT_FILE)) {
    cache = { version: 1, entries: [] }
    return cache
  }
  try {
    cache = JSON.parse(readFileSync(VAULT_FILE, 'utf-8')) as VaultData
    return cache
  } catch {
    cache = { version: 1, entries: [] }
    return cache
  }
}

function writeVault(data: VaultData): void {
  writeFileSync(VAULT_FILE, JSON.stringify(data, null, 2), 'utf-8')
  cache = data
}

export function invalidateVaultCache(): void {
  cache = null
}

// ── Raw vault access for backup/restore ────────────────────────────────────────

export function getRawVaultJson(): string {
  if (!existsSync(VAULT_FILE)) return JSON.stringify({ version: 1, entries: [] })
  return readFileSync(VAULT_FILE, 'utf-8')
}

export function setRawVaultJson(json: string): void {
  const parsed = JSON.parse(json) as VaultData  // throws on invalid JSON
  writeVault(parsed)
}

// ── CRUD ────────────────────────────────────────────────────────────────────────

export function listConnections(): StoredConnection[] {
  return readVault().entries.map(e => e.connection)
}

export function saveConnection(
  config: Omit<ConnectionConfig, 'id' | 'createdAt'>,
  password: string,
  sshPassword?: string
): StoredConnection {
  const vault = readVault()
  const connection: StoredConnection = {
    ...config,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  }
  const encryptedPassword = safeStorage.encryptString(password).toString('base64')
  const encryptedSshPassword = sshPassword
    ? safeStorage.encryptString(sshPassword).toString('base64')
    : undefined
  vault.entries.push({ connection, encryptedPassword, encryptedSshPassword })
  writeVault(vault)
  return connection
}

export function updateConnection(
  id: string,
  updates: Partial<ConnectionConfig>,
  password?: string,
  sshPassword?: string
): StoredConnection {
  const vault = readVault()
  const idx = vault.entries.findIndex(e => e.connection.id === id)
  if (idx === -1) throw new Error(`Connection ${id} not found`)
  vault.entries[idx].connection = { ...vault.entries[idx].connection, ...updates }
  if (password) {
    vault.entries[idx].encryptedPassword = safeStorage.encryptString(password).toString('base64')
  }
  if (sshPassword) {
    vault.entries[idx].encryptedSshPassword = safeStorage.encryptString(sshPassword).toString('base64')
  }
  writeVault(vault)
  return vault.entries[idx].connection
}

export function deleteConnection(id: string): void {
  const vault = readVault()
  vault.entries = vault.entries.filter(e => e.connection.id !== id)
  writeVault(vault)
}

export function getCredentials(id: string): { password: string; sshPassword?: string } {
  const vault = readVault()
  const entry = vault.entries.find(e => e.connection.id === id)
  if (!entry) throw new Error(`Connection ${id} not found`)
  return {
    password: safeStorage.decryptString(Buffer.from(entry.encryptedPassword, 'base64')),
    sshPassword: entry.encryptedSshPassword
      ? safeStorage.decryptString(Buffer.from(entry.encryptedSshPassword, 'base64'))
      : undefined,
  }
}
