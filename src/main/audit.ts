import { app } from 'electron'
import { appendFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { AuditEntry } from '../shared/types'

const AUDIT_FILE = join(app.getPath('userData'), 'audit.jsonl')

export function appendAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
  const full: AuditEntry = {
    ...entry,
    id: randomUUID(),
    timestamp: new Date().toISOString()
  }
  appendFileSync(AUDIT_FILE, JSON.stringify(full) + '\n', 'utf-8')
  return full
}

export function listAudit(connectionId?: string): AuditEntry[] {
  if (!existsSync(AUDIT_FILE)) return []
  const lines = readFileSync(AUDIT_FILE, 'utf-8')
    .split('\n')
    .filter(Boolean)
  const entries = lines.map(l => JSON.parse(l) as AuditEntry).reverse()
  if (connectionId) return entries.filter(e => e.connectionId === connectionId)
  return entries
}

export function getAuditEntry(id: string): AuditEntry | undefined {
  return listAudit().find(e => e.id === id)
}
