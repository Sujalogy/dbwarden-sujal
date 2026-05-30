export type Engine = 'postgres' | 'mysql' | 'mongodb' | 'redis' | 'sqlite'

export interface SSLConfig {
  enabled: boolean
  mode: 'disable' | 'require' | 'verify-ca' | 'verify-full'
  ca?: string
  cert?: string
  key?: string
}

export interface SSHTunnelConfig {
  enabled: boolean
  host: string
  port: number
  username: string
  authMethod: 'password' | 'key'
  privateKey?: string
}

export interface ConnectionConfig {
  id: string
  name: string
  engine: Engine
  host: string
  port: number
  database: string
  username: string
  ssl: SSLConfig
  ssh: SSHTunnelConfig
  isProduction: boolean
  company?: string
  companyAbbreviation?: string
  project?: string
  color?: string
  createdAt: string
}

export type StoredConnection = ConnectionConfig

export interface Capabilities {
  supportsUsers: boolean
  supportsRoles: boolean
  supportsGrants: boolean
  supportsSchemas: boolean
  supportsColumnPrivileges: boolean
  supportsMembership: boolean
  supportsPasswordReset: boolean
  supportsFunctions: boolean
}

export interface Principal {
  name: string
  type: 'user' | 'role'
  canLogin: boolean
  isSuper: boolean
  canCreateDb: boolean
  canCreateRole: boolean
  connectionLimit: number
  validUntil?: string | null
  memberOf: string[]
  members: string[]
}

export interface Role {
  name: string
  isBuiltin: boolean
  members: string[]
  memberOf: string[]
}

export type PrivilegeType =
  | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE'
  | 'REFERENCES' | 'TRIGGER' | 'CREATE' | 'CONNECT'
  | 'TEMPORARY' | 'EXECUTE' | 'USAGE' | 'ALL'

export type ObjectType = 'database' | 'schema' | 'table' | 'view' | 'sequence' | 'function' | 'procedure' | 'routine'

export interface DbObject {
  type: ObjectType
  database?: string
  schema?: string
  name: string
  fullPath: string
  args?: string // For functions/procedures like "integer, text"
}

export interface DbFunction {
  oid: string
  schema: string
  name: string
  args: string
  type: 'function' | 'procedure' | 'aggregate' | 'window'
  fullIdentity: string // schema.name(args)
}

export interface FunctionPrivilege {
  principal: string
  functionIdentity: string
  canExecute: boolean
  grantor?: string
}

export interface PrivilegeEntry {
  principal: string
  object: DbObject
  privilege: PrivilegeType
  grantOption: boolean
  source: 'direct' | 'role' | 'public'
  grantor?: string
  throughRole?: string
}

export interface GrantRequest {
  connectionId: string
  principal: string
  objects: DbObject[]
  privileges: PrivilegeType[]
  withGrantOption: boolean
  revoke: boolean
}

export interface StatementPlan {
  id: string
  connectionId: string
  statements: string[]
  description: string
  request: GrantRequest
}

export interface ApplyResult {
  success: boolean
  statementsExecuted: string[]
  error?: string
}

export interface CreateUserSpec {
  username: string
  password: string
  canLogin: boolean
  isSuper: boolean
  canCreateDb: boolean
  canCreateRole: boolean
  connectionLimit: number
  validUntil?: string
  memberOf: string[]
}

export interface AuditEntry {
  id: string
  connectionId: string
  connectionName: string
  action: string
  statements: string[]
  success: boolean
  error?: string
  timestamp: string
  reversible: boolean
  reverseStatements?: string[]
}

export interface TestResult {
  success: boolean
  error?: string
  latencyMs?: number
  serverVersion?: string
  currentUser?: string
  isSuper?: boolean
}

export interface SaveConnectionPayload {
  config: Omit<ConnectionConfig, 'id' | 'createdAt'>
  password: string
  sshPassword?: string
}

export interface TestConnectionPayload {
  config: Omit<ConnectionConfig, 'id' | 'createdAt'>
  password: string
  sshPassword?: string
}

export interface AuthStatus {
  isSetup: boolean
  isAuthenticated: boolean
  isLockedOut: boolean
  lockoutRemainingMs: number
}

export interface LoginResult {
  success: boolean
  error?: string
  remainingAttempts?: number
  lockedOut?: boolean
  lockoutRemainingMs?: number
}

export interface VaultExportResult {
  success: boolean
  canceled?: boolean
  filePath?: string
  error?: string
}

export interface VaultImportResult {
  success: boolean
  canceled?: boolean
  error?: string
}
