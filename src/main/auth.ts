import { app, safeStorage } from 'electron'
import {
  readFileSync, writeFileSync, existsSync
} from 'fs'
import { join } from 'path'
import {
  randomUUID, scryptSync, randomBytes,
  createCipheriv, createDecipheriv, timingSafeEqual
} from 'crypto'
import type { AuthStatus, LoginResult, VaultExportResult, VaultImportResult } from '../shared/types'

const AUTH_FILE = join(app.getPath('userData'), 'auth.json')
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000 // 30 minutes
const MAX_ATTEMPTS = 5
const BASE_LOCKOUT_MS = 30_000            // 30 s, doubles per threshold

interface StoredAuth {
  salt: string  // base64
  hash: string  // base64
}

// ── In-memory session state (never touches disk) ────────────────────────────────

let sessionToken: string | null = null
let lastActivity = Date.now()
let failedAttempts = 0
let lockoutUntil: number | null = null
let lockTimer: ReturnType<typeof setInterval> | null = null
let onLockCallback: (() => void) | null = null

// ── Crypto helpers ──────────────────────────────────────────────────────────────

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }) as Buffer
}

// ── Auth file I/O ───────────────────────────────────────────────────────────────

function readAuthFile(): StoredAuth | null {
  if (!existsSync(AUTH_FILE)) return null
  try {
    const buf = readFileSync(AUTH_FILE)
    const json = safeStorage.decryptString(buf)
    return JSON.parse(json) as StoredAuth
  } catch {
    return null
  }
}

function writeAuthFile(data: StoredAuth): void {
  const json = JSON.stringify(data)
  const encrypted = safeStorage.encryptString(json)
  writeFileSync(AUTH_FILE, encrypted)
}

// ── Public API ──────────────────────────────────────────────────────────────────

export function isSetup(): boolean {
  return existsSync(AUTH_FILE)
}

export function isAuthenticated(): boolean {
  return sessionToken !== null
}

export function updateActivity(): void {
  lastActivity = Date.now()
}

export function setOnLockCallback(cb: () => void): void {
  onLockCallback = cb
}

export function checkStatus(): AuthStatus {
  return {
    isSetup: isSetup(),
    isAuthenticated: isAuthenticated(),
    isLockedOut: lockoutUntil !== null && Date.now() < lockoutUntil,
    lockoutRemainingMs: lockoutUntil ? Math.max(0, lockoutUntil - Date.now()) : 0,
  }
}

export function setupPassword(password: string): void {
  const salt = randomBytes(32)
  const hash = hashPassword(password, salt)
  writeAuthFile({
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
  })
  sessionToken = randomUUID()
  lastActivity = Date.now()
  startInactivityTimer()
}

export function login(password: string): LoginResult {
  if (lockoutUntil && Date.now() < lockoutUntil) {
    return {
      success: false,
      error: 'Too many failed attempts.',
      lockedOut: true,
      lockoutRemainingMs: Math.max(0, lockoutUntil - Date.now()),
      remainingAttempts: 0,
    }
  }

  const stored = readAuthFile()
  if (!stored) return { success: false, error: 'Auth not configured.' }

  const salt = Buffer.from(stored.salt, 'base64')
  const storedHash = Buffer.from(stored.hash, 'base64')
  const inputHash = hashPassword(password, salt)

  const matches = timingSafeEqual(inputHash, storedHash)

  if (!matches) {
    failedAttempts++
    if (failedAttempts >= MAX_ATTEMPTS) {
      const multiplier = Math.pow(2, Math.floor(failedAttempts / MAX_ATTEMPTS) - 1)
      lockoutUntil = Date.now() + BASE_LOCKOUT_MS * multiplier
      return {
        success: false,
        error: 'Too many failed attempts.',
        lockedOut: true,
        lockoutRemainingMs: BASE_LOCKOUT_MS * multiplier,
        remainingAttempts: 0,
      }
    }
    return {
      success: false,
      error: 'Incorrect password.',
      remainingAttempts: MAX_ATTEMPTS - failedAttempts,
    }
  }

  failedAttempts = 0
  lockoutUntil = null
  sessionToken = randomUUID()
  lastActivity = Date.now()
  startInactivityTimer()
  return { success: true }
}

export function logout(): void {
  sessionToken = null
  if (lockTimer) { clearInterval(lockTimer); lockTimer = null }
}

export function lock(): void {
  sessionToken = null
}

// ── Inactivity timer ────────────────────────────────────────────────────────────

function startInactivityTimer(): void {
  if (lockTimer) clearInterval(lockTimer)
  lockTimer = setInterval(() => {
    if (!sessionToken) return
    if (Date.now() - lastActivity > INACTIVITY_LIMIT_MS) {
      sessionToken = null
      onLockCallback?.()
    }
  }, 60_000)
}

// ── Vault export / import (AES-256-GCM, separate export password) ───────────────
// Binary format: [16 salt][12 iv][16 authTag][ciphertext]

export function exportVaultData(exportPassword: string, vaultJson: string, savePath: string): void {
  const salt = randomBytes(16)
  const key = scryptSync(exportPassword, salt, 32, { N: 16384, r: 8, p: 1 }) as Buffer
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([
    cipher.update(vaultJson, 'utf-8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  const output = Buffer.concat([salt, iv, authTag, encrypted])
  writeFileSync(savePath, output)
}

export function importVaultData(exportPassword: string, filePath: string): string {
  const raw = readFileSync(filePath)
  if (raw.length < 44) throw new Error('Invalid backup file.')
  const salt = raw.subarray(0, 16)
  const iv = raw.subarray(16, 28)
  const authTag = raw.subarray(28, 44)
  const ciphertext = raw.subarray(44)
  const key = scryptSync(exportPassword, salt, 32, { N: 16384, r: 8, p: 1 }) as Buffer
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext).toString('utf-8') + decipher.final('utf-8')
}
