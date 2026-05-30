const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?'

export function generatePassword(length = 20): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map(b => CHARSET[b % CHARSET.length])
    .join('')
}

export interface PasswordStrength {
  score: number   // 0–5
  label: string
  color: string
}

export function getPasswordStrength(pw: string): PasswordStrength {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 14) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['red', 'orange', 'yellow', 'teal', 'green']
  return { score, label: labels[score] ?? 'Strong', color: colors[score] ?? 'green' }
}
