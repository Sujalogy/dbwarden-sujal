import { app, BrowserWindow, ipcMain, dialog, session } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import * as authModule from './auth'
import {
  listConnections, saveConnection, updateConnection,
  deleteConnection, getRawVaultJson, setRawVaultJson, invalidateVaultCache
} from './vault'
import { appendAudit, listAudit, getAuditEntry } from './audit'
import { getAdapter, disconnectAdapter, disconnectAll } from './adapters/registry'
import { PostgresAdapter } from './adapters/postgres'
import type {
  SaveConnectionPayload, TestConnectionPayload,
  CreateUserSpec, GrantRequest, StatementPlan, ObjectType
} from '../shared/types'

let mainWindow: BrowserWindow | null = null

// ── IPC guard: enforces auth + updates activity + normalises errors ────────────

function guard(fn: (e: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>) {
  return async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    authModule.updateActivity()
    if (!authModule.isAuthenticated()) {
      throw new Error(JSON.stringify({ message: 'Session expired. Please log in again.', code: 'AUTH_REQUIRED' }))
    }
    try {
      return await fn(event, ...args)
    } catch (err: unknown) {
      const e = err as Error & { code?: string }
      // Re-throw already-formatted errors as-is
      if (e.message.startsWith('{')) throw e
      throw new Error(JSON.stringify({ message: e.message, code: e.code }))
    }
  }
}

// ── Window creation ────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'DB Warden',
    backgroundColor: '#1a1b1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,        // required for preload to use Node crypto/path
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  // Block navigation away from the app
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const appUrl = process.env['ELECTRON_RENDERER_URL'] ?? 'file://'
    if (!url.startsWith(appUrl)) e.preventDefault()
  })

  // Block external window opens
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // CSP header — production only. In dev, Vite Fast Refresh needs inline scripts.
  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:"
          ],
        },
      })
    })
  }

  // Auto-lock callback: tell the renderer to show the lock screen
  authModule.setOnLockCallback(() => {
    mainWindow?.webContents.send('auth:locked')
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await disconnectAll()
  authModule.logout()
  if (process.platform !== 'darwin') app.quit()
})

// ── Auth IPC (unguarded — these bootstrap the session) ────────────────────────

ipcMain.handle('auth:check', () => authModule.checkStatus())

ipcMain.handle('auth:setup', (_e, password: string) => {
  if (authModule.isSetup()) throw new Error('Password is already configured.')
  authModule.setupPassword(password)
  return authModule.checkStatus()
})

ipcMain.handle('auth:login', (_e, password: string) => {
  return authModule.login(password)
})

ipcMain.handle('auth:logout', async () => {
  await disconnectAll()
  authModule.logout()
})

ipcMain.handle('auth:lock', () => {
  authModule.lock()
})

ipcMain.handle('auth:exportVault', guard(async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export DB Warden Vault',
    defaultPath: `dbwarden-backup-${new Date().toISOString().split('T')[0]}.dbwarden`,
    filters: [{ name: 'DB Warden Backup', extensions: ['dbwarden'] }],
  })
  if (canceled || !filePath) return { success: false, canceled: true }
  return { success: true, needsPassword: true, filePath }
}))

ipcMain.handle('auth:exportVaultWithPassword', guard(async (_e, exportPassword: string, filePath: string) => {
  try {
    const vaultJson = getRawVaultJson()
    authModule.exportVaultData(exportPassword, vaultJson, filePath)
    return { success: true, filePath }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
}))

ipcMain.handle('auth:importVault', guard(async (_e, exportPassword: string) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
    title: 'Import DB Warden Vault',
    filters: [{ name: 'DB Warden Backup', extensions: ['dbwarden'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths[0]) return { success: false, canceled: true }
  try {
    const vaultJson = authModule.importVaultData(exportPassword, filePaths[0])
    setRawVaultJson(vaultJson) // validates JSON + writes + updates cache
    await disconnectAll()     // reset any open connections
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: 'Invalid backup file or wrong password.' }
  }
}))

// ── Connections ────────────────────────────────────────────────────────────────

ipcMain.handle('connections:list', guard(async () => listConnections()))

ipcMain.handle('connections:save', guard(async (_e, payload: SaveConnectionPayload) =>
  saveConnection(payload.config, payload.password, payload.sshPassword)
))

ipcMain.handle('connections:update', guard(async (_e, id: string, updates: Partial<typeof Object>, password?: string, sshPassword?: string) => {
  const result = updateConnection(id, updates as Parameters<typeof updateConnection>[1], password, sshPassword)
  await disconnectAdapter(id)
  return result
}))

ipcMain.handle('connections:delete', guard(async (_e, id: string) => {
  await disconnectAdapter(id)
  deleteConnection(id)
}))

// Test is guarded too — user must be logged in to test new connections
ipcMain.handle('connections:test', guard(async (_e, payload: TestConnectionPayload) => {
  const adapter = new PostgresAdapter()
  return adapter.testConnection(
    { ...payload.config, id: '', createdAt: '' },
    payload.password,
    payload.sshPassword
  )
}))

ipcMain.handle('connections:disconnect', guard(async (_e, id: string) => {
  await disconnectAdapter(id)
}))

// ── Capabilities ───────────────────────────────────────────────────────────────

ipcMain.handle('db:capabilities', guard(async (_e, connectionId: string) => {
  const adapter = await getAdapter(connectionId)
  return adapter.capabilities
}))

// ── Principals ─────────────────────────────────────────────────────────────────

ipcMain.handle('db:listPrincipals', guard(async (_e, connectionId: string) => {
  const adapter = await getAdapter(connectionId)
  return adapter.listPrincipals()
}))

ipcMain.handle('db:createUser', guard(async (_e, connectionId: string, spec: CreateUserSpec) => {
  const adapter = await getAdapter(connectionId)
  const conn = listConnections().find(c => c.id === connectionId)!
  const stmts = await adapter.createUser(spec)
  appendAudit({
    connectionId, connectionName: conn.name,
    action: `Create user "${spec.username}"`,
    statements: stmts, success: true,
    reversible: true,
    reverseStatements: [`DROP ROLE IF EXISTS "${spec.username}"`],
  })
}))

ipcMain.handle('db:dropPrincipal', guard(async (_e, connectionId: string, name: string) => {
  const adapter = await getAdapter(connectionId)
  const conn = listConnections().find(c => c.id === connectionId)!
  const stmts = await adapter.dropPrincipal(name)
  appendAudit({
    connectionId, connectionName: conn.name,
    action: `Drop role/user "${name}"`,
    statements: stmts, success: true, reversible: false,
  })
}))

ipcMain.handle('db:resetPassword', guard(async (_e, connectionId: string, name: string, password: string) => {
  const adapter = await getAdapter(connectionId)
  const conn = listConnections().find(c => c.id === connectionId)!
  const stmts = await adapter.resetPassword(name, password)
  appendAudit({
    connectionId, connectionName: conn.name,
    action: `Reset password for "${name}"`,
    statements: [`ALTER ROLE "${name}" WITH PASSWORD '[redacted]'`],
    success: true, reversible: false,
  })
  return stmts
}))

ipcMain.handle('db:alterPrincipal', guard(async (_e, connectionId: string, name: string, spec: Partial<CreateUserSpec>) => {
  const adapter = await getAdapter(connectionId)
  const conn = listConnections().find(c => c.id === connectionId)!
  const stmts = await adapter.alterPrincipal(name, spec)
  appendAudit({
    connectionId, connectionName: conn.name,
    action: `Alter role "${name}"`,
    statements: stmts, success: true, reversible: false,
  })
}))

// ── Roles ──────────────────────────────────────────────────────────────────────

ipcMain.handle('db:listRoles', guard(async (_e, connectionId: string) => {
  const adapter = await getAdapter(connectionId)
  return adapter.listRoles()
}))

ipcMain.handle('db:createRole', guard(async (_e, connectionId: string, name: string) => {
  const adapter = await getAdapter(connectionId)
  const conn = listConnections().find(c => c.id === connectionId)!
  const stmts = await adapter.createRole(name)
  appendAudit({
    connectionId, connectionName: conn.name,
    action: `Create role "${name}"`,
    statements: stmts, success: true, reversible: true,
    reverseStatements: [`DROP ROLE IF EXISTS "${name}"`],
  })
}))

ipcMain.handle('db:dropRole', guard(async (_e, connectionId: string, name: string) => {
  const adapter = await getAdapter(connectionId)
  const conn = listConnections().find(c => c.id === connectionId)!
  const stmts = await adapter.dropRole(name)
  appendAudit({
    connectionId, connectionName: conn.name,
    action: `Drop role "${name}"`,
    statements: stmts, success: true, reversible: false,
  })
}))

ipcMain.handle('db:setMembership', guard(async (_e, connectionId: string, role: string, members: string[]) => {
  const adapter = await getAdapter(connectionId)
  const conn = listConnections().find(c => c.id === connectionId)!
  const stmts = await adapter.setMembership(role, members)
  appendAudit({
    connectionId, connectionName: conn.name,
    action: `Update membership of role "${role}"`,
    statements: stmts, success: true, reversible: false,
  })
}))

// ── Objects ────────────────────────────────────────────────────────────────────

ipcMain.handle('db:listObjects', guard(async (_e, connectionId: string, scope: { database?: string; schema?: string; type?: ObjectType }) => {
  const adapter = await getAdapter(connectionId)
  return adapter.listObjects(scope)
}))

// ── Privileges ─────────────────────────────────────────────────────────────────

ipcMain.handle('db:getEffectivePrivileges', guard(async (_e, connectionId: string, principal: string, database?: string) => {
  const adapter = await getAdapter(connectionId)
  return adapter.getEffectivePrivileges(principal, database)
}))

ipcMain.handle('db:planGrant', guard(async (_e, request: GrantRequest) => {
  const adapter = await getAdapter(request.connectionId)
  return adapter.planGrant(request)
}))

ipcMain.handle('db:applyPlan', guard(async (_e, plan: StatementPlan) => {
  const adapter = await getAdapter(plan.connectionId)
  const conn = listConnections().find(c => c.id === plan.connectionId)!
  const result = await adapter.applyPlan(plan)
  appendAudit({
    connectionId: plan.connectionId,
    connectionName: conn.name,
    action: plan.description,
    statements: result.statementsExecuted,
    success: result.success,
    error: result.error,
    reversible: false,
  })
  return result
}))

ipcMain.handle('db:getFunctions', guard(async (_e, connectionId: string, schema: string) => {
  const adapter = await getAdapter(connectionId)
  return adapter.getFunctions(schema)
}))

ipcMain.handle('db:getFunctionPrivileges', guard(async (_e, connectionId: string, schema: string, principal: string) => {
  const adapter = await getAdapter(connectionId)
  return adapter.getFunctionPrivileges(schema, principal)
}))

ipcMain.handle('db:updateFunctionPrivileges', guard(async (_e, connectionId: string, payload: { principal: string; grants: { functionIdentity: string; execute: boolean }[] }) => {
  const adapter = await getAdapter(connectionId)
  const conn = listConnections().find(c => c.id === connectionId)!
  const result = await adapter.updateFunctionPrivileges(payload.principal, payload.grants)
  appendAudit({
    connectionId,
    connectionName: conn.name,
    action: `Update function privileges for "${payload.principal}"`,
    statements: result.statementsExecuted,
    success: result.success,
    error: result.error,
    reversible: false,
  })
  return result
}))

// ── Audit ──────────────────────────────────────────────────────────────────────

ipcMain.handle('audit:list', guard(async (_e, connectionId?: string) => listAudit(connectionId)))

ipcMain.handle('audit:revert', guard(async (_e, entryId: string) => {
  const entry = getAuditEntry(entryId)
  if (!entry) return { success: false, statementsExecuted: [], error: 'Audit entry not found' }
  if (!entry.reversible || !entry.reverseStatements?.length) {
    return { success: false, statementsExecuted: [], error: 'This action cannot be reverted' }
  }
  const adapter = await getAdapter(entry.connectionId)
  const plan: StatementPlan = {
    id: entry.id + '-revert',
    connectionId: entry.connectionId,
    statements: entry.reverseStatements,
    description: `Revert: ${entry.action}`,
    request: { connectionId: entry.connectionId, principal: '', objects: [], privileges: [], withGrantOption: false, revoke: false },
  }
  return adapter.applyPlan(plan)
}))
