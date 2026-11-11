import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Pool } from 'pg'
import type { SecretBox } from '../secret-box.js'
import { ApiError } from './core.js'

/** One-time e-mail codes: HMAC digests only, with per-mailbox quotas. */
export class EmailCodeStore {
  private lastSweep = 0

  constructor(private readonly pool: Pool, private readonly secrets: SecretBox) {}

  /** Issue a 6-digit code; only its keyed digest is stored. Caller decides delivery. */
  async issue(email: string, purpose: string, ttlMs = 600_000): Promise<string> {
    const value = email.trim().toLowerCase()
    const last = await this.pool.query(
      'SELECT created_at FROM email_codes WHERE email = $1 AND purpose = $2 ORDER BY created_at DESC LIMIT 1', [value, purpose])
    if (last.rows[0]) {
      const age = Date.now() - new Date(last.rows[0].created_at).getTime()
      if (age < 60_000) throw new ApiError('EMAIL_RATE_LIMITED', 429)
    }
    const counts = await this.pool.query(
      "SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour, count(*)::int AS day " +
      "FROM email_codes WHERE email = $1 AND created_at > now() - interval '1 day'", [value])
    const hour = counts.rows[0]?.hour ?? 0
    const day = counts.rows[0]?.day ?? 0
    if (hour >= 5 || day >= 20) throw new ApiError('EMAIL_QUOTA_EXCEEDED', 429)
    await this.cleanup()
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await this.pool.query(
      'INSERT INTO email_codes (id, email, purpose, code_hash, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), value, purpose, await this.secrets.codeDigest(code, value, purpose), new Date(Date.now() + ttlMs)])
    return code
  }

  /** Test seam: forget the throttle so a sweep can be asserted deterministically. */
  resetSweep(): void {
    this.lastSweep = 0
  }

  /** Drop codes that expired more than a day ago; cheap and idempotent. */
  async cleanup(): Promise<void> {
    if (Date.now() - this.lastSweep < 60_000) return
    this.lastSweep = Date.now()
    await this.pool.query("DELETE FROM email_codes WHERE expires_at < now() - interval '1 day'").catch(() => undefined)
  }

  async check(email: string, purpose: string, code: string): Promise<boolean> {
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
    const actual = Buffer.from(await this.secrets.codeDigest(code.trim(), value, purpose))
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }

  async markConsumed(email: string, purpose: string): Promise<void> {
    await this.pool.query(
      'UPDATE email_codes SET consumed_at = now() WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL',
      [email.trim().toLowerCase(), purpose])
  }

  async consume(email: string, purpose: string, code: string): Promise<boolean> {
    if (!(await this.check(email, purpose, code))) return false
    await this.markConsumed(email, purpose)
    return true
  }
}
