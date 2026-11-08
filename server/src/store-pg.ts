import { Pool } from 'pg'
import { SCHEMA_NORMALISE, SCHEMA_STATEMENTS } from './schema.js'
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt, randomUUID, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'

export class ApiError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code) }
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
interface TokenRecord {
  kind: 'access' | 'refresh'; deviceId: string; userId: string; expires: number
  used: boolean; recovery?: { nonce: string; accessExpires: number; expires: number }
}

/** Short, unique, human-typeable device login name. */
function newDeviceUsername(): string {
  return 'dev-' + randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)
}

function successor(token: string, nonce: string, deviceId: string) {
  const derive = (kind: string) => createHmac('sha256', token)
    .update(JSON.stringify(['dsh-remote/refresh/v1', deviceId, nonce, kind])).digest('base64url')
  return { accessToken: derive('access'), refreshToken: derive('refresh') }
}

/**
 * Postgres-backed store with a synchronous in-memory view.
 *
 * The gateway calls get()/authenticate() synchronously on the hot path, so the
 * durable state lives in Postgres while a bounded cache (devices + live tokens)
 * serves those calls. Writes go through to Postgres; a crash loses at most the
 * un-flushed lastSeenAt. Single writer process is assumed.
 */
export class Store {
  private devices = new Map<string, SavedDevice>()
  private tokens = new Map<string, TokenRecord>()
  private touchQueue = new Set<string>()
  private disabledUsers = new Set<string>()
  /** Per-user concurrent WebSocket cap, refreshed from runtime settings. */
  connectionLimit = 16
  private touchTimer?: NodeJS.Timeout
  onInvalidate: (id: string) => void = () => {}

  constructor(readonly pool: Pool) {}

  /**
   * Converge the database to the declarative schema. Safe to run on every boot
   * and from more than one replica (advisory lock + idempotent statements).
   */
  async migrate(): Promise<void> {
    await this.pool.query("SELECT pg_advisory_lock(hashtext('dsh_migrate'))").catch(() => undefined)
    try {
      for (const statement of SCHEMA_STATEMENTS) await this.applySchemaStatement(statement)
      for (const statement of SCHEMA_NORMALISE) await this.pool.query(statement).catch(() => undefined)
      await this.backfillDeviceKeys()
      await this.pool.query(
        'INSERT INTO server_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()',
        ['schema', JSON.stringify({ statements: SCHEMA_STATEMENTS.length, appliedAt: Date.now() })]).catch(() => undefined)
    } finally {
      await this.pool.query("SELECT pg_advisory_unlock(hashtext('dsh_migrate'))").catch(() => undefined)
    }
  }

  private async tableExists(name: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1', [name])
    return (result.rowCount ?? 0) > 0
  }
  private async columnExists(table: string, column: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2',
      [table, column])
    return (result.rowCount ?? 0) > 0
  }

  /** Apply one declarative statement, skipping work that is already done. */
  private async applySchemaStatement(statement: string): Promise<void> {
    const create = /^CREATE TABLE IF NOT EXISTS ([a-z_]+)/i.exec(statement)
    if (create) {
      if (await this.tableExists(create[1]!)) return
      await this.pool.query(statement)
      return
    }
    const alter = /^ALTER TABLE ([a-z_]+) ADD COLUMN IF NOT EXISTS ([a-z_]+)/i.exec(statement)
    if (alter) {
      if (await this.columnExists(alter[1]!, alter[2]!)) return
      await this.pool.query(statement.replace('IF NOT EXISTS ', ''))
      return
    }
    // Indexes are idempotent in PostgreSQL; some embedded engines are stricter,
    // so a duplicate-object error is treated as already applied.
    await this.pool.query(statement).catch((error: unknown) => {
      const message = String((error as Error)?.message ?? '')
      if (/already exists|duplicate/i.test(message)) return
      throw error
    })
  }

  /** Idempotent: gives every pre-existing user a device username and one device key. */
  private async backfillDeviceKeys(): Promise<void> {
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

  /** Refuse to run as a second writer; the in-memory cache assumes one process. */
  private leaseClient?: { release: () => void }

  /**
   * Hold a session-scoped advisory lock for the lifetime of the process. The
   * connection must stay checked out: pool.query releases it (and the lock)
   * immediately, which made the second-writer check a no-op.
   */
  async acquireInstanceLease(): Promise<void> {
    if (this.leaseClient) return
    const client = await this.pool.connect().catch(() => undefined)
    if (!client) return
    const result = await client.query("SELECT pg_try_advisory_lock(hashtext('dsh_single_writer')) AS ok")
      .catch(() => undefined)
    if (!result) { client.release(); return }
    if (result.rows[0]?.ok === false) { client.release(); throw new ApiError('INSTANCE_LOCKED', 503) }
    this.leaseClient = client
  }

  releaseInstanceLease(): void {
    this.leaseClient?.release()
    this.leaseClient = undefined
  }

  async hydrate(): Promise<void> {
    const users = await this.pool.query('SELECT id FROM users WHERE disabled = true')
    for (const row of users.rows) this.disabledUsers.add(row.id)
    const devices = await this.pool.query('SELECT * FROM devices')
    for (const row of devices.rows) {
      this.devices.set(row.id, {
        userId: row.user_id,
        ...(row.device_key_id ? { deviceKeyId: row.device_key_id } : {}),
        revoked: row.revoked,
        lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0,
        descriptor: {
          v: 1, deviceId: row.id, name: row.name, role: row.role,
          ...(row.platform ? { platform: row.platform } : {}),
          ...(row.version ? { version: row.version } : {}),
          identityKey: row.identity_key,
        },
      })
    }
    const tokens = await this.pool.query('SELECT * FROM device_tokens WHERE expires_at > now()')
    for (const row of tokens.rows) {
      this.tokens.set(row.id, {
        kind: row.kind, deviceId: row.device_id, userId: row.user_id,
        expires: new Date(row.expires_at).getTime(), used: row.used,
        ...(row.recovery_nonce ? { recovery: { nonce: row.recovery_nonce, accessExpires: new Date(row.recovery_access_expires).getTime(), expires: row.recovery_expires ? new Date(row.recovery_expires).getTime() : 0 } } : {}),
      })
    }
  }

  // ── synchronous gateway surface ───────────────────────────────────────────
  get(id: string): SavedDevice {
    const device = this.devices.get(id)
    if (!device) throw new ApiError('DEVICE_NOT_FOUND', 404)
    if (device.revoked || this.disabledUsers.has(device.userId)) throw new ApiError('DEVICE_REVOKED', 403)
    return device
  }
  authenticate(token: string): SavedDevice {
    const record = this.tokens.get(digest(token))
    if (!record || record.kind !== 'access') throw new ApiError('AUTH_INVALID', 401)
    if (record.expires <= Date.now()) throw new ApiError('TOKEN_EXPIRED', 401)
    return this.get(record.deviceId)
  }
  touch(id: string, _clientVersion?: string, _harnessVersion?: string): void {
    const device = this.devices.get(id)
    if (!device) return
    device.lastSeenAt = Date.now()
    this.touchQueue.add(id)
    if (this.touchTimer) return
    this.touchTimer = setTimeout(() => {
      const ids = [...this.touchQueue]
      this.touchQueue.clear()
      this.touchTimer = undefined
      void this.pool.query('UPDATE devices SET last_seen_at = now() WHERE id = ANY($1::text[])', [ids]).catch(() => undefined)
    }, 5000)
    this.touchTimer.unref?.()
  }
  list(userId?: string): SavedDevice[] {
    return [...this.devices.values()].filter(d => !d.revoked && (userId === undefined || d.userId === userId))
  }
  ownedBy(deviceId: string, userId: string): boolean {
    return this.devices.get(deviceId)?.userId === userId
  }

  // ── device lifecycle ──────────────────────────────────────────────────────
  private async uniqueDeviceUsername(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = newDeviceUsername()
      const taken = await this.pool.query('SELECT 1 FROM users WHERE device_username = $1', [candidate])
      if ((taken.rowCount ?? 0) === 0) return candidate
    }
    throw new ApiError('INTERNAL_ERROR', 500)
  }

  async createDeviceKey(userId: string, label: string): Promise<{ id: string; label: string; key: string }> {
    const id = randomUUID()
    const key = randomToken()
    await this.pool.query('INSERT INTO device_keys (id, user_id, label, key_hash, secret) VALUES ($1,$2,$3,$4,$5)',
      [id, userId, label.slice(0, 64) || 'device', digest(key), await this.sealSecret(key)])
    return { id, label, key }
  }

  async listDeviceKeys(userId: string): Promise<Array<{ id: string; label: string; revoked: boolean; createdAt: string; lastUsedAt: string | null; deviceCount: number }>> {
    const keys = await this.pool.query(
      'SELECT id, label, revoked, created_at, last_used_at, secret FROM device_keys WHERE user_id = $1 ORDER BY created_at, id', [userId])
    const counts = await this.pool.query(
      "SELECT device_key_id, count(*)::int AS n FROM devices WHERE user_id = $1 AND revoked = false AND device_key_id IS NOT NULL GROUP BY device_key_id", [userId])
    const byKey = new Map<string, number>()
    for (const row of counts.rows) byKey.set(row.device_key_id, row.n)
    const listed = await Promise.all(keys.rows.map(async (row: any) => ({
      id: row.id, label: row.label, revoked: row.revoked,
      createdAt: row.created_at, lastUsedAt: row.last_used_at,
      deviceCount: byKey.get(row.id) ?? 0,
      // Keys created before the secret column existed cannot be revealed.
      ...(row.revoked ? {} : { key: await this.openSecret(row.secret) }),
    })))
    // Devices enrolled before device keys existed have no binding. Surface them
    // instead of letting the panel under-report live devices.
    const unbound = await this.pool.query(
      'SELECT count(*)::int AS n FROM devices WHERE user_id = $1 AND revoked = false AND device_key_id IS NULL', [userId])
    const unboundCount = unbound.rows[0]?.n ?? 0
    if (unboundCount > 0) {
      listed.push({ id: 'unbound', label: '(未绑定密钥)', revoked: false, createdAt: '', lastUsedAt: null, deviceCount: unboundCount })
    }
    return listed
  }

  async revokeDeviceKey(keyId: string, userId?: string): Promise<void> {
    if (keyId === 'unbound') throw new ApiError('INVALID_MESSAGE', 400)
    const key = await this.pool.query('SELECT * FROM device_keys WHERE id = $1', [keyId])
    const row = key.rows[0]
    if (!row || (userId !== undefined && row.user_id !== userId)) throw new ApiError('DEVICE_KEY_NOT_FOUND', 404)
    await this.pool.query('UPDATE device_keys SET revoked = true WHERE id = $1', [keyId])
    const bound = await this.pool.query('SELECT id FROM devices WHERE device_key_id = $1 AND revoked = false', [keyId])
    for (const device of bound.rows) {
      await this.pool.query('UPDATE devices SET revoked = true WHERE id = $1', [device.id])
      const cached = this.devices.get(device.id)
      if (cached) cached.revoked = true
      this.invalidate(device.id)
    }
  }

  async verifyDeviceCredential(login: string, secret: string, allowStandardUsername: boolean): Promise<{ user: UserRow; keyId: string } | undefined> {
    const found = await this.pool.query(
      'SELECT * FROM users WHERE device_username = $1' + (allowStandardUsername ? ' OR lower(username) = lower($1)' : ''),
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

  async register(userId: string, descriptor: any, deviceKeyId?: string): Promise<{ accessToken: string; refreshToken: string; accessTokenExpiresAt: number; refreshTokenExpiresAt: number }> {
    const id = String(descriptor.deviceId)
    const existing = this.devices.get(id)
    if (existing && existing.userId !== userId) throw new ApiError('PEER_IDENTITY_MISMATCH', 409)
    if (existing && existing.descriptor.identityKey !== descriptor.identityKey) throw new ApiError('PEER_IDENTITY_MISMATCH', 409)
    const prior = await this.pool.query('SELECT user_id, revoked FROM devices WHERE id = $1', [id])
    const priorRow = prior.rows[0]
    if (priorRow) {
      if (priorRow.user_id !== userId) throw new ApiError('PEER_IDENTITY_MISMATCH', 409)
      // Revocation is terminal: a revoked device cannot re-enrol with its old key.
      if (priorRow.revoked) throw new ApiError('DEVICE_REVOKED', 409)
    }
    const written = await this.pool.query(
      'INSERT INTO devices (id, user_id, name, platform, version, role, identity_key, device_key_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ' +
      'ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, platform = EXCLUDED.platform, version = EXCLUDED.version, ' +
      'device_key_id = COALESCE(EXCLUDED.device_key_id, devices.device_key_id) ' +
      'WHERE devices.revoked = false AND devices.user_id = EXCLUDED.user_id ' +
      'RETURNING id, device_key_id',
      [id, userId, descriptor.name, descriptor.platform ?? null, descriptor.version ?? null, descriptor.role, descriptor.identityKey, deviceKeyId ?? null])
    if ((written.rowCount ?? 0) === 0) {
      // Revocation is terminal: a revoked device cannot re-enrol with its old key.
      const row = await this.pool.query('SELECT user_id, revoked FROM devices WHERE id = $1', [id])
      const found = row.rows[0]
      if (found && found.user_id !== userId) throw new ApiError('PEER_IDENTITY_MISMATCH', 409)
      throw new ApiError('DEVICE_REVOKED', 409)
    }
    const boundKeyId: string | undefined = written.rows[0]?.device_key_id ?? deviceKeyId
    this.devices.set(id, {
      userId, revoked: false, lastSeenAt: existing?.lastSeenAt ?? 0,
      ...(boundKeyId ? { deviceKeyId: boundKeyId } : {}),
      descriptor: { ...descriptor, deviceId: id },
    })
    return this.issue(id, userId)
  }

  private async issue(deviceId: string, userId: string, refreshExpires = Date.now() + 30 * 86400_000, previous?: { token: string; record: TokenRecord }) {
    const accessExpires = Date.now() + 3600_000
    const nonce = randomBytes(32).toString('base64url')
    const pair = previous ? successor(previous.token, nonce, deviceId) : { accessToken: randomToken(), refreshToken: randomToken() }
    const access = { kind: 'access' as const, deviceId, userId, expires: accessExpires, used: false }
    const refresh = { kind: 'refresh' as const, deviceId, userId, expires: refreshExpires, used: false }
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      if (previous) {
        await client.query('UPDATE device_tokens SET used = true, recovery_nonce = $2, recovery_access_expires = $3, recovery_expires = $4 WHERE id = $1',
          [digest(previous.token), nonce, new Date(accessExpires), new Date(Date.now() + 120_000)])
      }
      await client.query('INSERT INTO device_tokens (id, device_id, user_id, kind, expires_at) VALUES ($1,$2,$3,$4,$5), ($6,$2,$3,$7,$8)',
        [digest(pair.accessToken), deviceId, userId, 'access', new Date(accessExpires), digest(pair.refreshToken), 'refresh', new Date(refreshExpires)])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
    if (previous) {
      // Mirror the consumed-token state into the cache; otherwise a replay
      // would be treated as a fresh rotation and mint a different successor.
      const recovery = { nonce, accessExpires: accessExpires, expires: Date.now() + 120_000 }
      this.tokens.set(digest(previous.token), { ...previous.record, used: true, recovery })
    }
    this.tokens.set(digest(pair.accessToken), access)
    this.tokens.set(digest(pair.refreshToken), refresh)
    return { ...pair, accessTokenExpiresAt: accessExpires, refreshTokenExpiresAt: refreshExpires }
  }

  async refresh(deviceId: string, token: string) {
    // Every failure mode returns the same code so the endpoint cannot be used
    // to probe whether a device exists, is revoked, or is merely unknown.
    const reject = () => new ApiError('AUTH_INVALID', 401)
    let record: TokenRecord | undefined
    try { this.get(deviceId); record = this.tokens.get(digest(token)) } catch { throw reject() }
    if (!record || record.kind !== 'refresh' || record.deviceId !== deviceId) throw reject()
    if (record.expires <= Date.now()) throw reject()
    if (!record.used) return this.issue(deviceId, record.userId, record.expires, { token, record })
    // A consumed token is replayable for 120s so a lost response can be
    // recovered; after that window a replay means theft → revoke the device.
    const recoveryExpires = record.recovery?.expires ?? 0
    if (!record.recovery || Date.now() > recoveryExpires) {
      await this.revoke(deviceId).catch(() => undefined)
      throw reject()
    }
    const pair = successor(token, record.recovery.nonce, deviceId)
    const next = this.tokens.get(digest(pair.refreshToken))
    if (!next || next.kind !== 'refresh' || next.used) {
      await this.revoke(deviceId).catch(() => undefined)
      throw reject()
    }
    return { ...pair, accessTokenExpiresAt: record.recovery.accessExpires, refreshTokenExpiresAt: next.expires }
  }

  invalidate(deviceId: string): void {
    for (const [key, value] of this.tokens) if (value.deviceId === deviceId) { this.tokens.delete(key); void this.pool.query('DELETE FROM device_tokens WHERE id = $1', [key]).catch(() => undefined) }
    void this.pool.query('DELETE FROM device_tokens WHERE device_id = $1', [deviceId]).catch(() => undefined)
    this.onInvalidate(deviceId)
  }
  async revoke(deviceId: string, userId?: string): Promise<void> {
    const device = this.get(deviceId)
    if (userId !== undefined && device.userId !== userId) throw new ApiError('DEVICE_NOT_FOUND', 404)
    await this.pool.query('UPDATE devices SET revoked = true WHERE id = $1', [deviceId])
    device.revoked = true
    this.invalidate(deviceId)
  }
  async rename(deviceId: string, name: string): Promise<void> {
    const device = this.get(deviceId)
    device.descriptor.name = name
    await this.pool.query('UPDATE devices SET name = $2 WHERE id = $1', [deviceId, name])
  }

  // ── users ─────────────────────────────────────────────────────────────────
  async countUsers(): Promise<number> {
    const result = await this.pool.query('SELECT count(*)::int AS n FROM users')
    return result.rows[0].n as number
  }
  async findUserByEmail(email: string): Promise<UserRow | undefined> {
    const result = await this.pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()])
    return result.rows[0]
  }
  async findUserByLogin(login: string): Promise<UserRow | undefined> {
    const value = login.trim()
    if (value.includes('@')) {
      const byEmail = await this.findUserByEmail(value)
      if (byEmail) return byEmail
    }
    return this.findUserByUsername(value)
  }

  async findUserByUsername(username: string): Promise<UserRow | undefined> {
    const result = await this.pool.query('SELECT * FROM users WHERE lower(username) = lower($1)', [username])
    return result.rows[0]
  }
  async findUserById(id: string): Promise<UserRow | undefined> {
    const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [id])
    return result.rows[0]
  }
  async createUser(input: { username: string; password?: string; role?: 'admin' | 'user'; email?: string; emailVerified?: boolean }): Promise<{ user: UserRow; deviceKey: string }> {
    const deviceKey = randomToken()
    const deviceUsername = await this.uniqueDeviceUsername()
    const sealed = await this.sealSecret(deviceKey)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        'INSERT INTO users (id, username, email, email_verified, role, password_hash, device_key_hash, device_username) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [randomUUID(), input.username.trim().toLowerCase(), input.email ? input.email.trim().toLowerCase() : null, input.emailVerified === true,
         input.role ?? 'user', input.password ? hashPassword(input.password) : null, digest(deviceKey), deviceUsername])
      await client.query('INSERT INTO device_keys (id, user_id, label, key_hash, secret) VALUES ($1,$2,$3,$4,$5)',
        [randomUUID(), result.rows[0].id, 'default', digest(deviceKey), sealed])
      await client.query('COMMIT')
      return { user: result.rows[0], deviceKey }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }
  /** Atomic first-admin creation: exactly one caller can win. */
  async createFirstAdmin(username: string, password: string): Promise<{ user: UserRow; deviceKey: string }> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      // Portable mutex: the primary key makes exactly one concurrent setup win.
      try {
        await client.query('INSERT INTO setup_lock (id) VALUES (1)')
      } catch {
        await client.query('ROLLBACK')
        throw new ApiError('SETUP_CLOSED', 409)
      }
      const count = await client.query('SELECT count(*)::int AS n FROM users')
      if (count.rows[0].n > 0) { await client.query('ROLLBACK'); throw new ApiError('SETUP_CLOSED', 409) }
      const deviceKey = randomToken()
      const deviceUsername = 'dev-' + randomUUID().replace(/-/g, '').slice(0, 10)
      const sealedAdminKey = await this.sealSecret(deviceKey)
      const inserted = await client.query(
        'INSERT INTO users (id, username, role, password_hash, device_key_hash, device_username) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [randomUUID(), username, 'admin', hashPassword(password), digest(deviceKey), deviceUsername])
      await client.query('INSERT INTO device_keys (id, user_id, label, key_hash, secret) VALUES ($1,$2,$3,$4,$5)',
        [randomUUID(), inserted.rows[0].id, 'default', digest(deviceKey), sealedAdminKey])
      await client.query('COMMIT')
      return { user: inserted.rows[0], deviceKey }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }
  async peekSetupKey(candidate: string): Promise<boolean> {
    const stored = await this.getSetting<{ key: string }>('setup_key')
    if (!stored?.key) return false
    const a = Buffer.from(digest(candidate)); const b = Buffer.from(digest(stored.key))
    return a.length === b.length && timingSafeEqual(a, b)
  }

  async setPassword(userId: string, password: string, opts: { revokeAllDevices?: boolean } = {}): Promise<void> {
    await this.pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, hashPassword(password)])
    await this.pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])
    if (opts.revokeAllDevices) {
      const all = await this.pool.query('SELECT id FROM devices WHERE user_id = $1 AND revoked = false', [userId])
      for (const device of all.rows) await this.revokeCached(device.id)
    } else {
      const unbound = await this.pool.query(
        'SELECT id FROM devices WHERE user_id = $1 AND device_key_id IS NULL AND revoked = false', [userId])
      for (const device of unbound.rows) await this.revokeCached(device.id)
    }
  }

  private async revokeCached(deviceId: string): Promise<void> {
    await this.pool.query('UPDATE devices SET revoked = true WHERE id = $1', [deviceId])
    const cached = this.devices.get(deviceId)
    if (cached) cached.revoked = true
    this.invalidate(deviceId)
  }
  async rotateDeviceKey(userId: string): Promise<string> {
    const deviceKey = randomToken()
    const hash = digest(deviceKey)
    const existing = await this.pool.query(
      "SELECT id FROM device_keys WHERE user_id = $1 AND label = 'default' AND revoked = false LIMIT 1", [userId])
    const sealed = await this.sealSecret(deviceKey)
    if (existing.rows[0]) {
      await this.pool.query('UPDATE device_keys SET key_hash = $2, secret = $3, last_used_at = NULL WHERE id = $1', [existing.rows[0].id, hash, sealed])
    } else {
      await this.pool.query('INSERT INTO device_keys (id, user_id, label, key_hash, secret) VALUES ($1,$2,$3,$4,$5)',
        [randomUUID(), userId, 'default', hash, sealed])
    }
    await this.pool.query('UPDATE users SET device_key_hash = $2 WHERE id = $1', [userId, hash])
    return deviceKey
  }
  async verifyDeviceKey(username: string, deviceKey: string): Promise<UserRow | undefined> {
    const verified = await this.verifyDeviceCredential(username, deviceKey, true)
    return verified?.user
  }
  async setDisabled(userId: string, disabled: boolean): Promise<void> {
    await this.pool.query('UPDATE users SET disabled = $2 WHERE id = $1', [userId, disabled])
    if (disabled) {
      this.disabledUsers.add(userId)
      await this.pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])
      for (const [id, device] of [...this.devices]) if (device.userId === userId) this.invalidate(id)
    } else {
      this.disabledUsers.delete(userId)
    }
  }
  async listUsers(): Promise<UserRow[]> {
    return (await this.pool.query('SELECT * FROM users ORDER BY created_at, id')).rows
  }
  async deleteUser(userId: string): Promise<void> {
    this.disabledUsers.add(userId)
    for (const [id, device] of [...this.devices]) {
      if (device.userId !== userId) continue
      this.devices.delete(id)
      this.onInvalidate(id)
    }
    await this.pool.query('DELETE FROM users WHERE id = $1', [userId])
  }
  async linkOidc(userId: string, issuer: string, subject: string): Promise<void> {
    // Conditional update: never overwrite an existing binding.
    const result = await this.pool.query(
      'UPDATE users SET oidc_issuer = $2, oidc_subject = $3 WHERE id = $1 AND oidc_subject IS NULL', [userId, issuer, subject])
    if ((result.rowCount ?? 0) === 0) throw new ApiError('OIDC_ALREADY_BOUND', 409)
  }
  async unlinkOidc(userId: string): Promise<void> {
    await this.pool.query('UPDATE users SET oidc_issuer = NULL, oidc_subject = NULL WHERE id = $1', [userId])
  }
  async findUserByOidc(issuer: string, subject: string): Promise<UserRow | undefined> {
    return (await this.pool.query('SELECT * FROM users WHERE oidc_issuer = $1 AND oidc_subject = $2', [issuer, subject])).rows[0]
  }

  // ── web sessions ──────────────────────────────────────────────────────────
  async createSession(userId: string, ttlMs: number): Promise<{ token: string; expiresAt: number }> {
    const token = randomToken()
    const expiresAt = Date.now() + ttlMs
    await this.pool.query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2,$3)', [digest(token), userId, new Date(expiresAt)])
    return { token, expiresAt }
  }
  async sessionUser(token: string): Promise<UserRow | undefined> {
    if (!token) return undefined
    const result = await this.pool.query(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.expires_at > now() AND u.disabled = false',
      [digest(token)])
    return result.rows[0]
  }
  async clearOtherSessions(keepToken?: string): Promise<void> {
    if (keepToken) await this.pool.query('DELETE FROM sessions WHERE id <> $1', [digest(keepToken)])
    else await this.pool.query('DELETE FROM sessions')
  }
  async deleteSession(token: string): Promise<void> {
    if (token) await this.pool.query('DELETE FROM sessions WHERE id = $1', [digest(token)])
  }
  async getSetting<T>(key: string): Promise<T | undefined> {
    const result = await this.pool.query('SELECT value FROM server_settings WHERE key = $1', [key])
    return result.rows[0]?.value as T | undefined
  }
  async setSetting(key: string, value: unknown): Promise<void> {
    await this.pool.query(
      'INSERT INTO server_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()',
      [key, JSON.stringify(value)])
  }
  async deleteSetting(key: string): Promise<void> {
    await this.pool.query('DELETE FROM server_settings WHERE key = $1', [key])
  }
  /** One-time bootstrap secret; valid only while no user exists. */
  async ensureSetupKey(generate: () => string): Promise<string> {
    const existing = await this.getSetting<{ key: string }>('setup_key')
    if (existing?.key) return existing.key
    const key = generate()
    await this.setSetting('setup_key', { key, createdAt: Date.now() })
    return key
  }
  async consumeSetupKey(candidate: string): Promise<boolean> {
    const stored = await this.getSetting<{ key: string }>('setup_key')
    if (!stored?.key) return false
    const a = Buffer.from(digest(candidate)); const b = Buffer.from(digest(stored.key))
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false
    await this.deleteSetting('setup_key')
    return true
  }

  async listAllDevices(): Promise<Array<{ descriptor: any; userId: string; username: string; revoked: boolean; lastSeenAt: number }>> {
    const result = await this.pool.query('SELECT d.*, u.username FROM devices d JOIN users u ON u.id = d.user_id ORDER BY d.created_at DESC, d.id')
    return result.rows.map((row: any) => ({
      userId: row.user_id, username: row.username, revoked: row.revoked,
      lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0,
      descriptor: { v: 1, deviceId: row.id, name: row.name, role: row.role, platform: row.platform ?? undefined, version: row.version ?? undefined, identityKey: row.identity_key },
    }))
  }
  async listAudit(limit: number): Promise<Array<{ at: string; actor: string | null; action: string; userId: string | null; detail: unknown }>> {
    const result = await this.pool.query('SELECT at, actor, action, user_id, detail FROM audit_log ORDER BY id DESC LIMIT $1', [limit])
    return result.rows.map((row: any) => ({ at: row.at, actor: row.actor, action: row.action, userId: row.user_id, detail: row.detail }))
  }

  private codeSecret?: string
  private async codeKey(): Promise<string> {
    if (this.codeSecret) return this.codeSecret
    const stored = await this.getSetting<{ key: string }>('code_secret')
    if (stored?.key) { this.codeSecret = stored.key; return stored.key }
    const key = randomBytes(32).toString('base64url')
    await this.setSetting('code_secret', { key })
    this.codeSecret = key
    return key
  }
  private deviceKeyCrypto?: Buffer
  /** AES-256-GCM key derived from the server secret: owners must be able to reveal keys. */
  private async deviceKeyKey(): Promise<Buffer> {
    if (this.deviceKeyCrypto) return this.deviceKeyCrypto
    const material = Buffer.from(await this.codeKey(), 'utf8')
    this.deviceKeyCrypto = Buffer.from(hkdfSync('sha256', material, Buffer.alloc(0), 'dsh.device-key', 32))
    return this.deviceKeyCrypto
  }
  private async sealSecret(plain: string): Promise<string> {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', await this.deviceKeyKey(), iv)
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
  }
  private async openSecret(sealed: string | null | undefined): Promise<string | undefined> {
    if (!sealed) return undefined
    try {
      const raw = Buffer.from(sealed, 'base64')
      const decipher = createDecipheriv('aes-256-gcm', await this.deviceKeyKey(), raw.subarray(0, 12))
      decipher.setAuthTag(raw.subarray(12, 28))
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
    } catch { return undefined }
  }
  private async codeDigest(code: string, email: string, purpose: string): Promise<string> {
    return createHmac('sha256', await this.codeKey()).update(code + ':' + email + ':' + purpose).digest('hex')
  }

  /** Issue a 6-digit code; only its keyed digest is stored. Caller decides delivery. */
  async issueEmailCode(email: string, purpose: string, ttlMs = 600_000): Promise<string> {
    const value = email.trim().toLowerCase()
    const last = await this.pool.query(
      'SELECT created_at FROM email_codes WHERE email = $1 AND purpose = $2 ORDER BY created_at DESC LIMIT 1', [value, purpose])
    if (last.rows[0]) {
      const age = Date.now() - new Date(last.rows[0].created_at).getTime()
      if (age < 60_000) throw new ApiError('EMAIL_RATE_LIMITED', 429)
    }
    // Per-mailbox quota: five codes per hour and twenty per day, across purposes.
    const counts = await this.pool.query(
      "SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour, count(*)::int AS day " +
      "FROM email_codes WHERE email = $1 AND created_at > now() - interval '1 day'", [value])
    const hour = counts.rows[0]?.hour ?? 0
    const day = counts.rows[0]?.day ?? 0
    if (hour >= 5 || day >= 20) throw new ApiError('EMAIL_QUOTA_EXCEEDED', 429)
    await this.cleanupEmailCodes()
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await this.pool.query(
      'INSERT INTO email_codes (id, email, purpose, code_hash, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), value, purpose, await this.codeDigest(code, value, purpose), new Date(Date.now() + ttlMs)])
    return code
  }

  private lastSweep = 0
  /** Drop codes that expired more than a day ago; cheap and idempotent. */
  async cleanupEmailCodes(): Promise<void> {
    if (Date.now() - this.lastSweep < 60_000) return
    this.lastSweep = Date.now()
    await this.pool.query("DELETE FROM email_codes WHERE expires_at < now() - interval '1 day'").catch(() => undefined)
  }

  async checkEmailCode(email: string, purpose: string, code: string): Promise<boolean> {
    const value = email.trim().toLowerCase()
    const row = await this.pool.query(
      'SELECT id, code_hash, expires_at, attempts FROM email_codes WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1',
      [value, purpose])
    const record = row.rows[0]
    if (!record) return false
    if (new Date(record.expires_at).getTime() < Date.now()) return false
    // Charge the attempt first so concurrent guesses cannot all observe attempts=0.
    const charged = await this.pool.query(
      'UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1 AND consumed_at IS NULL AND attempts < 5', [record.id])
    if ((charged.rowCount ?? 0) === 0) return false
    const expected = Buffer.from(record.code_hash)
    const actual = Buffer.from(await this.codeDigest(code.trim(), value, purpose))
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }

  async markEmailCodeConsumed(email: string, purpose: string): Promise<void> {
    await this.pool.query(
      'UPDATE email_codes SET consumed_at = now() WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL',
      [email.trim().toLowerCase(), purpose])
  }

  async consumeEmailCode(email: string, purpose: string, code: string): Promise<boolean> {
    if (!(await this.checkEmailCode(email, purpose, code))) return false
    await this.markEmailCodeConsumed(email, purpose)
    return true
  }


  async setUsername(userId: string, username: string): Promise<void> {
    await this.pool.query('UPDATE users SET username = $2 WHERE id = $1', [userId, username.trim().toLowerCase()])
  }

  async setEmail(userId: string, email: string, verified: boolean): Promise<void> {
    await this.pool.query('UPDATE users SET email = $2, email_verified = $3 WHERE id = $1',
      [userId, email.trim().toLowerCase(), verified])
  }

  async audit(action: string, actor?: string, userId?: string, detail?: unknown): Promise<void> {
    await this.pool.query('INSERT INTO audit_log (actor, user_id, action, detail) VALUES ($1,$2,$3,$4)',
      [actor ?? null, userId ?? null, action, detail === undefined ? null : JSON.stringify(detail)]).catch(() => undefined)
  }
}
