import type { Pool } from 'pg'
import { digest, randomToken, type UserRow } from './core.js'

/** Web sessions: opaque tokens, only their digest is stored. */
export class SessionStore {
  constructor(private readonly pool: Pool) {}

  async create(userId: string, ttlMs: number): Promise<{ token: string; expiresAt: number }> {
    const token = randomToken()
    const expiresAt = Date.now() + ttlMs
    await this.pool.query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2,$3)', [digest(token), userId, new Date(expiresAt)])
    return { token, expiresAt }
  }

  async user(token: string): Promise<UserRow | undefined> {
    if (!token) return undefined
    const result = await this.pool.query(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.expires_at > now() AND u.disabled = false',
      [digest(token)])
    return result.rows[0]
  }

  async clearOthers(keepToken?: string): Promise<void> {
    if (keepToken) await this.pool.query('DELETE FROM sessions WHERE id <> $1', [digest(keepToken)])
    else await this.pool.query('DELETE FROM sessions')
  }

  async delete(token: string): Promise<void> {
    if (token) await this.pool.query('DELETE FROM sessions WHERE id = $1', [digest(token)])
  }
}
