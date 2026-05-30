export function formatDbMessage(rawMessage: string): string {
  if (!rawMessage) return 'Unknown database error'

  // Split by newlines if multiple errors/warnings were batched
  const messages = rawMessage.split('\n').filter(m => m.trim().length > 0)
  
  if (messages.length === 0) return rawMessage

  const formatted: string[] = []
  
  const revokeColTables = new Set<string>()
  const grantDeniedTables = new Set<string>()
  const revokeDeniedTables = new Set<string>()

  for (const msg of messages) {
    const text = msg

    // Group repetitive column-level revoke warnings by table
    const revokeColMatch = text.match(/no privileges could be revoked for column "([^"]+)" of relation "([^"]+)"/i)
    if (revokeColMatch) {
      revokeColTables.add(revokeColMatch[2])
      continue
    }

    const grantMatch = text.match(/no privileges were granted for "([^"]+)"/i)
    if (grantMatch) {
      grantDeniedTables.add(grantMatch[1])
      continue
    }

    const revokeMatch = text.match(/no privileges could be revoked for "([^"]+)"/i)
    if (revokeMatch) {
      revokeDeniedTables.add(revokeMatch[1])
      continue
    }

    const deniedMatch = text.match(/permission denied for relation "?([^"]+)"?/i)
    if (deniedMatch) {
      formatted.push(`\u2022 Permission denied for table "${deniedMatch[1]}".`)
      continue
    }

    const schemaDeniedMatch = text.match(/permission denied for schema "?([^"]+)"?/i)
    if (schemaDeniedMatch) {
      formatted.push(`\u2022 Permission denied for schema "${schemaDeniedMatch[1]}".`)
      continue
    }

    const roleExistsMatch = text.match(/role "([^"]+)" already exists/i)
    if (roleExistsMatch) {
      formatted.push(`\u2022 The user or role "${roleExistsMatch[1]}" already exists.`)
      continue
    }

    const roleNotExistsMatch = text.match(/role "([^"]+)" does not exist/i)
    if (roleNotExistsMatch) {
      formatted.push(`\u2022 The user or role "${roleNotExistsMatch[1]}" does not exist.`)
      continue
    }

    const authMatch = text.match(/password authentication failed for user "([^"]+)"/i)
    if (authMatch) {
      formatted.push(`\u2022 Incorrect password for user "${authMatch[1]}".`)
      continue
    }

    // Default formatting: Capitalize first letter
    formatted.push(`\u2022 ${text.charAt(0).toUpperCase() + text.slice(1)}`)
  }

  if (revokeColTables.size > 0) {
    const arr = Array.from(revokeColTables)
    if (arr.length === 1) formatted.push(`\u2022 Could not revoke some privileges on table "${arr[0]}" (you lack permissions).`)
    else formatted.push(`\u2022 Could not revoke some privileges on ${arr.length} tables (you lack permissions).`)
  }

  if (grantDeniedTables.size > 0) {
    const arr = Array.from(grantDeniedTables)
    if (arr.length === 1) formatted.push(`\u2022 You lack permissions to grant privileges on "${arr[0]}".`)
    else formatted.push(`\u2022 You lack permissions to grant privileges on ${arr.length} tables.`)
  }

  if (revokeDeniedTables.size > 0) {
    const arr = Array.from(revokeDeniedTables)
    if (arr.length === 1) formatted.push(`\u2022 You lack permissions to revoke privileges on "${arr[0]}".`)
    else formatted.push(`\u2022 You lack permissions to revoke privileges on ${arr.length} tables.`)
  }

  // Deduplicate identical lines
  const unique = [...new Set(formatted)]
  
  // If there's only 1 message, remove the bullet point
  if (unique.length === 1) {
    return unique[0].replace('\u2022 ', '')
  }

  // If there are too many messages, truncate them
  if (unique.length > 5) {
    return unique.slice(0, 5).join('\n') + `\n...and ${unique.length - 5} more.`
  }

  return unique.join('\n')
}
