import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto'

/**
 * Sealing for stored credentials.
 *
 * The server secret lives in `server_settings.code_secret`; the AES key for
 * device keys is derived from it with HKDF. A database backup alone therefore
 * cannot reveal a key, while the running process can — required because the
 * owner must be able to echo a device key again (root.ai.md §6.1 K2).
 */
export class SecretBox {
  private secret?: string
  private deviceKey?: Buffer

  constructor(
    private readonly readSecret: () => Promise<string | undefined>,
    private readonly writeSecret: (key: string) => Promise<void>,
  ) {}

  /** HMAC key for e-mail codes; created once and persisted. */
  async codeKey(): Promise<string> {
    if (this.secret) return this.secret
    const stored = await this.readSecret()
    if (stored) { this.secret = stored; return stored }
    const key = randomBytes(32).toString('base64url')
    await this.writeSecret(key)
    this.secret = key
    return key
  }

  /** AES-256-GCM key derived from the server secret. */
  private async deviceKeyKey(): Promise<Buffer> {
    if (this.deviceKey) return this.deviceKey
    const material = Buffer.from(await this.codeKey(), 'utf8')
    this.deviceKey = Buffer.from(hkdfSync('sha256', material, Buffer.alloc(0), 'dsh.device-key', 32))
    return this.deviceKey
  }

  async seal(plain: string): Promise<string> {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', await this.deviceKeyKey(), iv)
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
  }

  async open(sealed: string | null | undefined): Promise<string | undefined> {
    if (!sealed) return undefined
    try {
      const raw = Buffer.from(sealed, 'base64')
      const decipher = createDecipheriv('aes-256-gcm', await this.deviceKeyKey(), raw.subarray(0, 12))
      decipher.setAuthTag(raw.subarray(12, 28))
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
    } catch { return undefined }
  }

  async codeDigest(code: string, email: string, purpose: string): Promise<string> {
    return createHmac('sha256', await this.codeKey()).update(code + ':' + email + ':' + purpose).digest('hex')
  }
}
