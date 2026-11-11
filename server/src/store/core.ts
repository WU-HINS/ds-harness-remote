import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'

export class ApiError extends Error {
  constructor(readonly code: string, readonly status = 400, readonly detail?: string) { super(detail ?? code) }
}

export const digest = (value: string): string => createHash('sha256').update(value).digest('hex')
export const randomToken = (): string => randomBytes(32).toString('base64url')
export const equal = (left: string, right: string): boolean =>
  timingSafeEqual(Buffer.from(digest(left)), Buffer.from(digest(right)))

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  return 'scrypt$' + salt.toString('base64url') + '$' + scryptSync(password, salt, 32).toString('base64url')
}
const scryptAsync = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => scrypt(password, salt, 32, (error, key) => error ? reject(error) : resolve(key as Buffer)))
export async function verifyPasswordAsync(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [scheme, salt, key] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !key) return false
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64url'))
  const expected = Buffer.from(key, 'base64url')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false
  const [scheme, salt, key] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !key) return false
  const actual = scryptSync(password, Buffer.from(salt, 'base64url'), 32)
  const expected = Buffer.from(key, 'base64url')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export interface UserRow {
  id: string; username: string; email: string | null; role: 'admin' | 'user'
  disabled: boolean; device_key_hash: string; device_username: string; password_hash: string | null; email_verified: boolean; created_at: string
  oidc_issuer: string | null; oidc_subject: string | null
}
export interface SavedDevice { descriptor: any; userId: string; revoked: boolean; lastSeenAt: number; deviceKeyId?: string }

/** Closed audit-action set; root.ai.md §2 lists the same 34 names. */
export const AUDIT_ACTIONS: ReadonlySet<string> = new Set([
  'account.registered',
  'auth.code_failure',
  'device.registered',
  'device.registered_from_account',
  'device.removed',
  'device.renamed',
  'device.revoked_by_admin',
  'device_key.created',
  'device_key.revoked',
  'device_key.rotated',
  'device_key.ticket_issued',
  'device_login.failure',
  'device_login.success',
  'email.change_started',
  'email.changed',
  'login.disabled',
  'login.failure',
  'login.sso_only_rejected',
  'login.success',
  'oidc.auto_bound',
  'oidc.bound',
  'oidc.conflict',
  'oidc.failure',
  'oidc.provisioned',
  'oidc.rejected',
  'oidc.success',
  'oidc.unbound',
  'password.changed',
  'password.reset',
  'settings.updated',
  'setup.admin_created',
  'user.created',
  'user.deleted',
  'user.updated',
])
