import { Pool } from 'pg'
import type { PoolConfig } from 'pg'
import { Client as SSHClient } from 'ssh2'
import type { ConnectConfig as SSHConnectConfig } from 'ssh2'
import * as net from 'net'
import { randomUUID } from 'crypto'
import { formatDbMessage } from '../messages'
import type {
  ConnectionConfig, Capabilities, Principal, Role, DbObject,
  PrivilegeEntry, GrantRequest, StatementPlan, ApplyResult,
  CreateUserSpec, TestResult, PrivilegeType, ObjectType
} from '../../shared/types'

interface SSHTunnel {
  localPort: number
  cleanup: () => void
}

function createSSHTunnel(
  sshCfg: ConnectionConfig['ssh'],
  dbHost: string,
  dbPort: number,
  sshPassword?: string
): Promise<SSHTunnel> {
  return new Promise((resolve, reject) => {
    const ssh = new SSHClient()
    const server = net.createServer((sock) => {
      ssh.forwardOut('127.0.0.1', 0, dbHost, dbPort, (err, stream) => {
        if (err) { sock.destroy(); return }
        sock.pipe(stream)
        stream.pipe(sock)
      })
    })

    server.listen(0, '127.0.0.1', () => {
      const { port: localPort } = server.address() as net.AddressInfo

      ssh.on('ready', () => {
        resolve({
          localPort,
          cleanup: () => { server.close(); ssh.end() }
        })
      })

      ssh.on('error', (err) => {
        server.close()
        reject(err)
      })

      const cfg: SSHConnectConfig = {
        host: sshCfg.host,
        port: sshCfg.port,
        username: sshCfg.username,
        readyTimeout: 10000,
      }

      if (sshCfg.authMethod === 'key' && sshCfg.privateKey) {
        cfg.privateKey = sshCfg.privateKey
      } else if (sshPassword) {
        cfg.password = sshPassword
      }

      ssh.connect(cfg)
    })

    server.on('error', reject)
  })
}

function buildPoolConfig(
  config: ConnectionConfig,
  password: string,
  tunnelPort?: number
): PoolConfig {
  const ssl = config.ssl.enabled
    ? {
        rejectUnauthorized: config.ssl.mode === 'verify-full',
        ca: config.ssl.ca || undefined,
        cert: config.ssl.cert || undefined,
        key: config.ssl.key || undefined,
      }
    : undefined

  return {
    host: tunnelPort ? '127.0.0.1' : config.host,
    port: tunnelPort ?? config.port,
    database: config.database,
    user: config.username,
    password,
    ssl,
    connectionTimeoutMillis: 15000,
    max: 5,
  }
}

export class PostgresAdapter {
  private pool: Pool | null = null
  private tunnel: SSHTunnel | null = null
  readonly engine = 'postgres' as const

  readonly capabilities: Capabilities = {
    supportsUsers: true,
    supportsRoles: true,
    supportsGrants: true,
    supportsSchemas: true,
    supportsColumnPrivileges: true,
    supportsMembership: true,
    supportsPasswordReset: true,
  }

  async connect(config: ConnectionConfig, password: string, sshPassword?: string): Promise<void> {
    let tunnelPort: number | undefined
    if (config.ssh.enabled) {
      this.tunnel = await createSSHTunnel(config.ssh, config.host, config.port, sshPassword)
      tunnelPort = this.tunnel.localPort
    }
    const poolCfg = buildPoolConfig(config, password, tunnelPort)
    this.pool = new Pool(poolCfg)
    const client = await this.pool.connect()
    client.release()
  }

  async disconnect(): Promise<void> {
    if (this.pool) { await this.pool.end(); this.pool = null }
    if (this.tunnel) { this.tunnel.cleanup(); this.tunnel = null }
  }

  private async query<T extends object>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.pool) throw new Error('Not connected')
    const result = await this.pool.query(sql, params)
    return result.rows as T[]
  }

  async testConnection(config: ConnectionConfig, password: string, sshPassword?: string): Promise<TestResult> {
    const start = Date.now()
    let tempTunnel: SSHTunnel | null = null
    let tempPool: Pool | null = null
    try {
      let tunnelPort: number | undefined
      if (config.ssh.enabled) {
        tempTunnel = await createSSHTunnel(config.ssh, config.host, config.port, sshPassword)
        tunnelPort = tempTunnel.localPort
      }
      tempPool = new Pool({ ...buildPoolConfig(config, password, tunnelPort), max: 1 })
      const client = await tempPool.connect()
      const rows = await client.query(`
        SELECT
          version() AS ver,
          current_user AS cur_user,
          usesuper AS is_super
        FROM pg_user
        WHERE usename = current_user
      `)
      client.release()
      const row = rows.rows[0]
      return {
        success: true,
        latencyMs: Date.now() - start,
        serverVersion: (row.ver as string).split(' ').slice(0, 2).join(' '),
        currentUser: row.cur_user as string,
        isSuper: row.is_super as boolean,
      }
    } catch (err: unknown) {
      return {
        success: false,
        error: (err as Error).message,
        latencyMs: Date.now() - start,
      }
    } finally {
      if (tempPool) await tempPool.end().catch(() => undefined)
      if (tempTunnel) tempTunnel.cleanup()
    }
  }

  async listPrincipals(): Promise<Principal[]> {
    const roles = await this.query<{
      name: string; can_login: boolean; is_super: boolean;
      can_create_db: boolean; can_create_role: boolean;
      connection_limit: number; valid_until: Date | string | null
    }>(`
      SELECT
        rolname AS name,
        rolcanlogin AS can_login,
        rolsuper AS is_super,
        rolcreatedb AS can_create_db,
        rolcreaterole AS can_create_role,
        rolconnlimit AS connection_limit,
        rolvaliduntil AS valid_until
      FROM pg_catalog.pg_roles
      WHERE 
        (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user)
        OR pg_has_role(current_user, oid, 'MEMBER')
      ORDER BY rolname
    `)

    const memberships = await this.query<{ member: string; role: string }>(`
      SELECT m.rolname AS member, r.rolname AS role
      FROM pg_auth_members am
      JOIN pg_roles m ON m.oid = am.member
      JOIN pg_roles r ON r.oid = am.roleid
      WHERE 
        (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user)
        OR (pg_has_role(current_user, m.oid, 'MEMBER') AND pg_has_role(current_user, r.oid, 'MEMBER'))
    `)

    return roles.map(r => ({
      name: r.name,
      type: (r.can_login ? 'user' : 'role') as 'user' | 'role',
      canLogin: r.can_login,
      isSuper: r.is_super,
      canCreateDb: r.can_create_db,
      canCreateRole: r.can_create_role,
      connectionLimit: r.connection_limit === -1 ? 0 : r.connection_limit,
      validUntil: r.valid_until ? (isNaN(new Date(r.valid_until).getTime()) ? 'infinity' : new Date(r.valid_until).toISOString()) : null,
      memberOf: memberships.filter(m => m.member === r.name).map(m => m.role),
      members: memberships.filter(m => m.role === r.name).map(m => m.member),
    }))
  }

  async createUser(spec: CreateUserSpec): Promise<string[]> {
    const attrs: string[] = [spec.canLogin ? 'LOGIN' : 'NOLOGIN']
    if (spec.isSuper) attrs.push('SUPERUSER')
    if (spec.canCreateDb) attrs.push('CREATEDB')
    if (spec.canCreateRole) attrs.push('CREATEROLE')
    if (spec.connectionLimit >= 0) attrs.push(`CONNECTION LIMIT ${spec.connectionLimit}`)
    if (spec.validUntil) attrs.push(`VALID UNTIL '${spec.validUntil}'`)

    const escaped = spec.password.replace(/'/g, "''")
    const stmts: string[] = [
      `CREATE ROLE "${spec.username}" WITH ${attrs.join(' ')} PASSWORD '${escaped}'`
    ]
    for (const role of spec.memberOf) {
      stmts.push(`GRANT "${role}" TO "${spec.username}"`)
    }
    for (const stmt of stmts) await this.query(stmt)
    return stmts
  }

  async dropPrincipal(name: string): Promise<string[]> {
    const stmts = [`DROP ROLE IF EXISTS "${name}"`]
    await this.query(stmts[0])
    return stmts
  }

  async resetPassword(name: string, password: string): Promise<string[]> {
    const escaped = password.replace(/'/g, "''")
    const stmts = [`ALTER ROLE "${name}" WITH PASSWORD '${escaped}'`]
    await this.query(stmts[0])
    return stmts
  }

  async alterPrincipal(name: string, spec: Partial<CreateUserSpec>): Promise<string[]> {
    const attrs: string[] = []
    if (spec.canLogin !== undefined) attrs.push(spec.canLogin ? 'LOGIN' : 'NOLOGIN')
    if (spec.isSuper !== undefined) attrs.push(spec.isSuper ? 'SUPERUSER' : 'NOSUPERUSER')
    if (spec.canCreateDb !== undefined) attrs.push(spec.canCreateDb ? 'CREATEDB' : 'NOCREATEDB')
    if (spec.canCreateRole !== undefined) attrs.push(spec.canCreateRole ? 'CREATEROLE' : 'NOCREATEROLE')
    if (spec.connectionLimit !== undefined) attrs.push(`CONNECTION LIMIT ${spec.connectionLimit}`)
    if (spec.validUntil) attrs.push(`VALID UNTIL '${spec.validUntil}'`)
    if (spec.password) {
      const escaped = spec.password.replace(/'/g, "''")
      attrs.push(`PASSWORD '${escaped}'`)
    }
    const stmts: string[] = []
    if (attrs.length > 0) {
      stmts.push(`ALTER ROLE "${name}" WITH ${attrs.join(' ')}`)
      await this.query(stmts[0])
    }
    return stmts
  }

  async listRoles(): Promise<Role[]> {
    const roles = await this.query<{ rolname: string }>(`SELECT rolname FROM pg_roles ORDER BY rolname`)
    const memberships = await this.query<{ member: string; role: string }>(`
      SELECT m.rolname AS member, r.rolname AS role
      FROM pg_auth_members am
      JOIN pg_roles m ON m.oid = am.member
      JOIN pg_roles r ON r.oid = am.roleid
    `)
    return roles.map(r => ({
      name: r.rolname,
      isBuiltin: r.rolname.startsWith('pg_') || r.rolname.startsWith('rds_') || r.rolname.startsWith('aurora_'),
      members: memberships.filter(m => m.role === r.rolname).map(m => m.member),
      memberOf: memberships.filter(m => m.member === r.rolname).map(m => m.role),
    }))
  }

  async createRole(name: string): Promise<string[]> {
    const stmts = [`CREATE ROLE "${name}" NOLOGIN`]
    await this.query(stmts[0])
    return stmts
  }

  async dropRole(name: string): Promise<string[]> {
    const stmts = [`DROP ROLE IF EXISTS "${name}"`]
    await this.query(stmts[0])
    return stmts
  }

  async setMembership(role: string, members: string[]): Promise<string[]> {
    const current = await this.query<{ member: string }>(`
      SELECT m.rolname AS member
      FROM pg_auth_members am
      JOIN pg_roles m ON m.oid = am.member
      JOIN pg_roles r ON r.oid = am.roleid
      WHERE r.rolname = $1
    `, [role])
    const currentMembers = current.map(r => r.member)
    const toAdd = members.filter(m => !currentMembers.includes(m))
    const toRemove = currentMembers.filter(m => !members.includes(m))
    const stmts: string[] = [
      ...toAdd.map(m => `GRANT "${role}" TO "${m}"`),
      ...toRemove.map(m => `REVOKE "${role}" FROM "${m}"`),
    ]
    for (const stmt of stmts) await this.query(stmt)
    return stmts
  }

  async listObjects(scope: { database?: string; schema?: string; type?: ObjectType }): Promise<DbObject[]> {
    const objects: DbObject[] = []

    if (!scope.database && !scope.schema) {
      const dbs = await this.query<{ datname: string }>(`
        SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname
      `)
      return dbs.map(db => ({ type: 'database' as ObjectType, name: db.datname, fullPath: db.datname }))
    }

    if (scope.database && !scope.schema) {
      const schemas = await this.query<{ schema_name: string }>(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
          AND schema_name NOT LIKE 'pg_temp_%'
          AND schema_name NOT LIKE 'pg_toast_temp_%'
        ORDER BY schema_name
      `)
      return schemas.map(s => ({
        type: 'schema' as ObjectType,
        database: scope.database,
        name: s.schema_name,
        fullPath: `${scope.database}.${s.schema_name}`,
      }))
    }

    if (scope.database && scope.schema) {
      const tables = await this.query<{ table_name: string; table_type: string }>(`
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = $1 AND table_type IN ('BASE TABLE','VIEW')
        ORDER BY table_name
      `, [scope.schema])
      return tables.map(t => ({
        type: (t.table_type === 'VIEW' ? 'view' : 'table') as ObjectType,
        database: scope.database,
        schema: scope.schema,
        name: t.table_name,
        fullPath: `${scope.database}.${scope.schema}.${t.table_name}`,
      }))
    }

    return objects
  }

  async getEffectivePrivileges(principal: string, _database?: string): Promise<PrivilegeEntry[]> {
    const direct = await this.query<{
      table_catalog: string; table_schema: string; table_name: string;
      privilege_type: string; is_grantable: string; grantor: string
    }>(`
      SELECT table_catalog, table_schema, table_name, privilege_type, is_grantable, grantor
      FROM information_schema.role_table_grants
      WHERE grantee = $1
        AND table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY table_schema, table_name, privilege_type
    `, [principal])

    const entries: PrivilegeEntry[] = direct.map(p => ({
      principal,
      object: {
        type: 'table' as ObjectType,
        database: p.table_catalog,
        schema: p.table_schema,
        name: p.table_name,
        fullPath: `${p.table_catalog}.${p.table_schema}.${p.table_name}`,
      },
      privilege: p.privilege_type as PrivilegeType,
      grantOption: p.is_grantable === 'YES',
      source: 'direct' as const,
      grantor: p.grantor,
    }))

    const memberOf = await this.query<{ role: string }>(`
      SELECT r.rolname AS role
      FROM pg_auth_members am
      JOIN pg_roles r ON r.oid = am.roleid
      JOIN pg_roles m ON m.oid = am.member
      WHERE m.rolname = $1
    `, [principal])

    for (const { role } of memberOf) {
      const inherited = await this.query<{
        table_catalog: string; table_schema: string; table_name: string;
        privilege_type: string; is_grantable: string; grantor: string
      }>(`
        SELECT table_catalog, table_schema, table_name, privilege_type, is_grantable, grantor
        FROM information_schema.role_table_grants
        WHERE grantee = $1 AND table_schema NOT IN ('pg_catalog','information_schema')
      `, [role])

      for (const p of inherited) {
        const fp = `${p.table_catalog}.${p.table_schema}.${p.table_name}`
        const alreadyDirect = entries.some(
          e => e.object.fullPath === fp && e.privilege === p.privilege_type && e.source === 'direct'
        )
        if (!alreadyDirect) {
          entries.push({
            principal,
            object: {
              type: 'table' as ObjectType,
              database: p.table_catalog,
              schema: p.table_schema,
              name: p.table_name,
              fullPath: fp,
            },
            privilege: p.privilege_type as PrivilegeType,
            grantOption: false,
            source: 'role' as const,
            grantor: p.grantor,
            throughRole: role,
          })
        }
      }
    }

    return entries
  }

  planGrant(request: GrantRequest): StatementPlan {
    const verb = request.revoke ? 'REVOKE' : 'GRANT'
    const privs = request.privileges.join(', ')
    const statements: string[] = []

    for (const obj of request.objects) {
      let target: string
      if (obj.type === 'database') target = `DATABASE "${obj.name}"`
      else if (obj.type === 'schema') target = `SCHEMA "${obj.name}"`
      else target = `TABLE "${obj.schema}"."${obj.name}"`

      if (request.revoke) {
        statements.push(`REVOKE ${privs} ON ${target} FROM "${request.principal}"`)
      } else {
        const opt = request.withGrantOption ? ' WITH GRANT OPTION' : ''
        statements.push(`GRANT ${privs} ON ${target} TO "${request.principal}"${opt}`)
      }
    }

    return {
      id: randomUUID(),
      connectionId: request.connectionId,
      statements,
      description: `${verb} ${privs} on ${request.objects.length} object(s) to/from "${request.principal}"`,
      request,
    }
  }

  async applyPlan(plan: StatementPlan): Promise<ApplyResult> {
    if (!this.pool) return { success: false, statementsExecuted: [], error: 'Not connected' }
    
    const executed: string[] = []
    const notices: string[] = []
    
    let client: any;
    try {
      client = await this.pool.connect()
      client.on('notice', (msg: any) => {
        if (msg.message) notices.push(msg.message)
      })

      for (const stmt of plan.statements) {
        await client.query(stmt)
        executed.push(stmt)
      }
      
      if (notices.length > 0) {
        // PostgreSQL often issues a WARNING if you lack the rights to grant/revoke
        return { success: false, statementsExecuted: executed, error: formatDbMessage(notices.join('\n')) }
      }

      return { success: true, statementsExecuted: executed }
    } catch (err: unknown) {
      return { success: false, statementsExecuted: executed, error: formatDbMessage((err as Error).message) }
    } finally {
      if (client) {
        client.removeAllListeners('notice')
        client.release()
      }
    }
  }

  async getFunctions(schema: string): Promise<DbFunction[]> {
    if (!this.pool) return []
    const res = await this.pool.query(`
      SELECT p.oid::text as oid, n.nspname as schema, p.proname as name, 
             pg_get_function_identity_arguments(p.oid) as args,
             CASE p.prokind 
               WHEN 'f' THEN 'function'
               WHEN 'p' THEN 'procedure'
               WHEN 'a' THEN 'aggregate'
               WHEN 'w' THEN 'window'
             END as type
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1
      ORDER BY p.proname
    `, [schema])
    return res.rows.map(r => ({
      ...r,
      fullIdentity: `"${r.schema}"."${r.name}"(${r.args})`
    }))
  }

  async getFunctionPrivileges(schema: string, principal: string): Promise<FunctionPrivilege[]> {
    if (!this.pool) return []
    const res = await this.pool.query(`
      SELECT p.oid::text as oid, a.grantor::regrole::text as grantor,
             CASE WHEN a.grantee = 0 THEN 'public' ELSE a.grantee::regrole::text END as grantee
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE n.nspname = $1 AND a.privilege_type = 'EXECUTE'
    `, [schema])

    const funcs = await this.getFunctions(schema)
    const map = new Map<string, {can: boolean, grantor?: string}>()

    for (const row of res.rows) {
      if (row.grantee === principal || row.grantee === 'public') {
        map.set(row.oid, { can: true, grantor: row.grantor })
      }
    }

    return funcs.map(f => {
      const p = map.get(f.oid)
      return {
        principal,
        functionIdentity: f.fullIdentity,
        canExecute: !!p?.can,
        grantor: p?.grantor
      }
    })
  }

  async updateFunctionPrivileges(principal: string, grants: { functionIdentity: string; execute: boolean }[]): Promise<ApplyResult> {
    if (!this.pool) return { success: false, statementsExecuted: [], error: 'Not connected' }
    
    const statements: string[] = []
    for (const grant of grants) {
      if (grant.execute) {
        statements.push(`GRANT EXECUTE ON ROUTINE ${grant.functionIdentity} TO "${principal}"`)
      } else {
        statements.push(`REVOKE EXECUTE ON ROUTINE ${grant.functionIdentity} FROM "${principal}"`)
      }
    }

    return this.applyPlan({
      id: randomUUID(),
      connectionId: 'tmp', 
      statements,
      description: 'Update function privileges',
      request: {} as any
    })
  }
}
