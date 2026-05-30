import { contextBridge, ipcRenderer } from 'electron'
import type {
  SaveConnectionPayload, TestConnectionPayload, CreateUserSpec,
  GrantRequest, StatementPlan, ObjectType
} from '../shared/types'

const api = {
  // ── Auth ────────────────────────────────────────────────────────────────────
  auth: {
    check: () => ipcRenderer.invoke('auth:check'),
    setup: (password: string) => ipcRenderer.invoke('auth:setup', password),
    login: (password: string) => ipcRenderer.invoke('auth:login', password),
    logout: () => ipcRenderer.invoke('auth:logout'),
    lock: () => ipcRenderer.invoke('auth:lock'),
    exportVault: () => ipcRenderer.invoke('auth:exportVault'),
    exportVaultWithPassword: (exportPassword: string, filePath: string) =>
      ipcRenderer.invoke('auth:exportVaultWithPassword', exportPassword, filePath),
    importVault: (exportPassword: string) => ipcRenderer.invoke('auth:importVault', exportPassword),
    onLocked: (callback: () => void) => {
      ipcRenderer.on('auth:locked', callback)
      return () => ipcRenderer.removeListener('auth:locked', callback)
    },
  },

  // ── Connections ─────────────────────────────────────────────────────────────
  connections: {
    list: () => ipcRenderer.invoke('connections:list'),
    save: (payload: SaveConnectionPayload) => ipcRenderer.invoke('connections:save', payload),
    update: (id: string, updates: object, password?: string, sshPassword?: string) =>
      ipcRenderer.invoke('connections:update', id, updates, password, sshPassword),
    delete: (id: string) => ipcRenderer.invoke('connections:delete', id),
    test: (payload: TestConnectionPayload) => ipcRenderer.invoke('connections:test', payload),
    disconnect: (id: string) => ipcRenderer.invoke('connections:disconnect', id),
  },

  // ── Database ────────────────────────────────────────────────────────────────
  db: {
    capabilities: (connectionId: string) => ipcRenderer.invoke('db:capabilities', connectionId),
    listPrincipals: (connectionId: string) => ipcRenderer.invoke('db:listPrincipals', connectionId),
    createUser: (connectionId: string, spec: CreateUserSpec) =>
      ipcRenderer.invoke('db:createUser', connectionId, spec),
    dropPrincipal: (connectionId: string, name: string) =>
      ipcRenderer.invoke('db:dropPrincipal', connectionId, name),
    resetPassword: (connectionId: string, name: string, password: string) =>
      ipcRenderer.invoke('db:resetPassword', connectionId, name, password),
    alterPrincipal: (connectionId: string, name: string, spec: object) =>
      ipcRenderer.invoke('db:alterPrincipal', connectionId, name, spec),
    listRoles: (connectionId: string) => ipcRenderer.invoke('db:listRoles', connectionId),
    createRole: (connectionId: string, name: string) =>
      ipcRenderer.invoke('db:createRole', connectionId, name),
    dropRole: (connectionId: string, name: string) =>
      ipcRenderer.invoke('db:dropRole', connectionId, name),
    setMembership: (connectionId: string, role: string, members: string[]) =>
      ipcRenderer.invoke('db:setMembership', connectionId, role, members),
    listObjects: (connectionId: string, scope: { database?: string; schema?: string; type?: ObjectType }) =>
      ipcRenderer.invoke('db:listObjects', connectionId, scope),
    getEffectivePrivileges: (connectionId: string, principal: string, database?: string) =>
      ipcRenderer.invoke('db:getEffectivePrivileges', connectionId, principal, database),
    planGrant: (request: GrantRequest) => ipcRenderer.invoke('db:planGrant', request),
    applyPlan: (plan: StatementPlan) => ipcRenderer.invoke('db:applyPlan', plan),
    getFunctions: (connectionId: string, schema: string) =>
      ipcRenderer.invoke('db:getFunctions', connectionId, schema),
    getFunctionPrivileges: (connectionId: string, schema: string, principal: string) =>
      ipcRenderer.invoke('db:getFunctionPrivileges', connectionId, schema, principal),
    updateFunctionPrivileges: (connectionId: string, payload: { principal: string; grants: { functionIdentity: string; execute: boolean }[] }) =>
      ipcRenderer.invoke('db:updateFunctionPrivileges', connectionId, payload),
  },

  // ── Audit ───────────────────────────────────────────────────────────────────
  audit: {
    list: (connectionId?: string) => ipcRenderer.invoke('audit:list', connectionId),
    revert: (entryId: string) => ipcRenderer.invoke('audit:revert', entryId),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type AppAPI = typeof api
