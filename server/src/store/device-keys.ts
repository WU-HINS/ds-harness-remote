import { randomBytes, randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type { SecretBox } from '../secret-box.js'
import { ApiError, digest, randomToken, type UserRow } from './core.js'

/** Callback into the Store's in-memory device cache. */
export interface DeviceKeyCache {
  revokeCached(deviceId: string): void
}

/** Short, unique, human-typeable device login name. */
function newDeviceUsername(): string {
  return 'dev-' + randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)
}

export interface DeviceKeyRow {
  id: string; label: string; revoked: boolean; createdAt: string
  lastUsedAt: string | null; deviceCount: number; revealable: boolean; key?: string
}

/**
 * Device-key domain: one account may hold N keys, each bound to N devices.
 * The plaintext is sealed so the owner can reveal it again (root.ai.md K2/K7).
 */
export class DeviceKeyStore {
  constructor(
    private readonly pool: Pool,
    private readonly secrets: SecretBox,
    private readonly cache: DeviceKeyCache,
  ) {}

  /** Idempotent: gives every pre-existing user a device username and one device key. */
  async backfill(): Promise<void> {
    const missingNames = await this.pool.query("SELECT id FROM users WHERE device_username IS NULL OR device_username = ''")
    for (const row of missingNames.rows) {
      await this.pool.query('UPDATE users SET device_username = $2 WHERE id = $1', [row.id, newDeviceUsername()])
        .catch(() => undefined)
    }
    const legacy = await this.pool.query(
      "SELECT id, device_key_hash FROM users WHERE device_key_hash IS NOT NULL AND device_key_hash <> ''")
    for (const row of legacy.rows) {
      const existing = await this.pool.query('SELECT 1 FROM device_keys WHERE user_id = $1', [row.id])
      if ((existing.rowCount ?? 0) > 0) continue
      await this.pool.query('INSERT INTO device_keys (id, user_id, label, key_hash) VALUES ($1,$2,$3,$4)',
        [randomUUID(), row.id, 'default', row.device_key_hash]).catch(() => undefined)
    }
  }

  async uniqueUsername(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = newDeviceUsername()
      const taken = await this.pool.query('SELECT 1 FROM users WHERE device_username = $1', [candidate])
      if ((taken.rowCount ?? 0) === 0) return candidate
    }
    throw new ApiError('INTERNAL_ERROR', 500)
  }

  async create(userId: string, label: string): Promise<{ id: string; label: string; key: string }> {
    const id = randomUUID()
    const key = randomToken()
    await this.pool.query('INSERT INTO device_keys (id, user_id, label, key_hash, secret) VALUES ($1,$2,$3,$4,$5)',
      [id, userId, label.slice(0, 64) || 'device', digest(key), await this.secrets.seal(key)])
    return { id, label, key }
  }

  async list(userId: string): Promise<DeviceKeyRow[]> {
    const keys = await this.pool.query('SELECT id, label, revoked, created_at, last_used_at, secret FROM device_keys WHERE user_id = $1 ORDER BY created_at, id', [userId])
    const counts = await this.pool.query("SELECT device_key_id, count(*)::int AS n FROM devices WHERE user_id = $1 AND revoked = false AND device_key_id IS NOT NULL GROUP BY device_key_id", [userId])
    const byKey = new Map<string, number>()
    for (const row of counts.rows) byKey.set(row.device_key_id, row.n)
    // A live key is reversible by contract: the owner may echo it again. Revoked
    // keys and legacy rows without a sealed copy are flagged, never silently blank.
    const listed = await Promise.all(keys.rows.map(async (row: any) => {
      const key = row.revoked ? undefined : await this.secrets.open(row.secret)
      return {
        id: row.id, label: row.label, revoked: row.revoked,
        createdAt: row.created_at, lastUsedAt: row.last_used_at,
        deviceCount: byKey.get(row.id) ?? 0,
        revealable: key !== undefined, ...(key !== undefined ? { key } : {}),
      }
    }))
    // Devices enrolled before device keys existed have no binding. Surface them
    // instead of letting the panel under-report live devices.
    const unbound = await this.pool.query(
      'SELECT count(*)::int AS n FROM devices WHERE user_id = $1 AND revoked = false AND device_key_id IS NULL', [userId])
    const unboundCount = unbound.rows[0]?.n ?? 0
    if (unboundCount > 0) listed.push({ id: 'unbound', label: '(未绑定密钥)', revoked: false, createdAt: '', lastUsedAt: null, deviceCount: unboundCount, revealable: false })
    return listed
  }

  async revoke(keyId: string, userId?: string): Promise<number> {
    if (keyId === 'unbound') throw new ApiError('INVALID_MESSAGE', 400)
    const key = await this.pool.query('SELECT * FROM device_keys WHERE id = $1', [keyId])
    const row = key.rows[0]
    if (!row || (userId !== undefined && row.user_id !== userId)) throw new ApiError('DEVICE_KEY_NOT_FOUND', 404)
    await this.pool.query('UPDATE device_keys SET revoked = true WHERE id = $1', [keyId])
    const bound = await this.pool.query('SELECT id FROM devices WHERE device_key_id = $1 AND revoked = false', [keyId])
    for (const device of bound.rows) {
      await this.pool.query('UPDATE devices SET revoked = true WHERE id = $1', [device.id])
      await this.pool.query('DELETE FROM device_tokens WHERE device_id = $1', [device.id])
      this.cache.revokeCached(device.id)
    }
    return bound.rowCount ?? 0
  }

  async verifyCredential(login: string, secret: string, allowStandardUsername: boolean): Promise<{ user: UserRow; keyId: string } | undefined> {
    const found = await this.pool.query(
      'SELECT * FROM users WHERE device_username = $1' + (allowStandardUsername ? ' OR lower(username) = lower($1)' : '') +
      ' ORDER BY (device_username = $1) DESC LIMIT 1',
      [login])
    const user: UserRow | undefined = found.rows[0]
    if (!user || user.disabled) return undefined
    const key = await this.pool.query('SELECT id FROM device_keys WHERE user_id = $1 AND key_hash = $2 AND revoked = false',
      [user.id, digest(secret)])
    const keyRow = key.rows[0]
    if (!keyRow) return undefined
    await this.pool.query('UPDATE device_keys SET last_used_at = now() WHERE id = $1', [keyRow.id]).catch(() => undefined)
    return { user, keyId: keyRow.id }
  }

  async verifyKey(username: string, deviceKey: string): Promise<UserRow | undefined> {
    return (await this.verifyCredential(username, deviceKey, true))?.user
  }

  /**
   * Re-key one owned key in place: same id and device bindings, new secret.
   * Existing device tokens survive (they are not derived from the key); only
   * future enrolments need the new plaintext. A revoked or foreign key is 404.
   */
  async rotate(userId: string, keyId: string): Promise<{ id: string; label: string; key: string }> {
    const key = randomToken()
    const sealed = await this.secrets.seal(key)
    const updated = await this.pool.query(
      'UPDATE device_keys SET key_hash = $3, secret = $4, last_used_at = NULL WHERE id = $1 AND user_id = $2 AND revoked = false RETURNING id, label',
      [keyId, userId, digest(key), sealed])
    const row = updated.rows[0]
    if (!row) throw new ApiError('DEVICE_KEY_NOT_FOUND', 404)
    return { id: row.id, label: row.label, key }
  }
}
