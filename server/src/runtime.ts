import { OidcClient } from './oidc.js'
import type { OidcConfig } from './oidc.js'
import type { Store } from './store-pg.js'
import type { Settings } from './settings.js'
import { EMPTY_SMTP, smtpConfigured, type SmtpSettings } from './mailer.js'

export interface OidcSettings extends OidcConfig { enabled: boolean; onlySso: boolean; bindRequireVerification: boolean }
export interface LimitsSettings {
  sessionTtlMs: number
  userRatePerMinute: number
  anonRatePerMinute: number
  userConnectionLimit: number
}
export interface IceSettings {
  stunUrls: string[]
  turnUrls: string[]
  turnSecret: string
  turnUsername: string
  turnPassword: string
}
export interface UiSettings { backgroundUrl: string }
export interface ServerSettings {
  /** Public origin; empty means "derive from the request" until an admin sets it. */
  publicUrl: string
  /** Extra peers (beyond loopback/private ranges) allowed to supply client-IP headers. */
  trustedProxyIps: string[]
}
export interface RuntimeDoc { server: ServerSettings; oidc: OidcSettings; limits: LimitsSettings; ice: IceSettings; smtp: SmtpSettings; ui: UiSettings }

export const DEFAULT_BACKGROUND_URL = 'https://t.hinswu.top/pixiv'

const CONFIG_KEY = 'runtime_config'

export const DEFAULT_OIDC: OidcSettings = {
  enabled: false, onlySso: false, bindRequireVerification: true, issuer: '', clientId: '', clientSecret: '', scopes: 'openid email profile',
  allowedDomains: [], autoProvision: true,
}

/**
 * Runtime configuration: environment provides boot defaults, the admin UI
 * overrides them in Postgres. Reads are cached; every write reloads and drops
 * the memoised OIDC client so a change takes effect on the next request.
 */
export class Runtime {
  private doc: RuntimeDoc
  private client?: { fingerprint: string; client: OidcClient }

  constructor(private readonly store: Store, base: Settings) {
    const fromEnv = base.oidc
    this.doc = {
      server: {
        publicUrl: base.publicUrlExplicit ? base.publicUrl.origin : '',
        trustedProxyIps: base.trustedProxyIps,
      },
      oidc: fromEnv ? {
        enabled: true, onlySso: false, bindRequireVerification: true, issuer: fromEnv.issuer, clientId: fromEnv.clientId, clientSecret: fromEnv.clientSecret,
        scopes: fromEnv.scopes, allowedDomains: fromEnv.allowedDomains, autoProvision: fromEnv.autoProvision,
      } : { ...DEFAULT_OIDC },
      limits: {
        sessionTtlMs: base.sessionTtlMs, userRatePerMinute: base.userRatePerMinute,
        anonRatePerMinute: base.anonRatePerMinute, userConnectionLimit: base.userConnectionLimit,
      },
      smtp: {
        host: process.env.DSH_SMTP_HOST ?? '', port: Number(process.env.DSH_SMTP_PORT ?? 587) || 587,
        secure: process.env.DSH_SMTP_SECURE === '1', user: process.env.DSH_SMTP_USER ?? '',
        pass: process.env.DSH_SMTP_PASS ?? '', from: process.env.DSH_SMTP_FROM ?? '',
      },
      ui: { backgroundUrl: DEFAULT_BACKGROUND_URL },
      ice: {
        stunUrls: (process.env.DSH_SERVER_STUN_URLS ?? '').split(',').map(v => v.trim()).filter(Boolean),
        turnUrls: (process.env.DSH_SERVER_TURN_URLS ?? '').split(',').map(v => v.trim()).filter(Boolean),
        turnSecret: process.env.DSH_SERVER_TURN_SECRET ?? '',
        turnUsername: process.env.DSH_SERVER_TURN_USERNAME ?? '',
        turnPassword: process.env.DSH_SERVER_TURN_PASSWORD ?? '',
      },
    }
  }

  get current(): RuntimeDoc { return this.doc }
  get limits(): LimitsSettings { return this.doc.limits }

  async init(): Promise<void> {
    const stored = await this.store.getSetting<Partial<RuntimeDoc>>(CONFIG_KEY)
    if (!stored) return
    this.doc = {
      oidc: { ...this.doc.oidc, ...(stored.oidc ?? {}) },
      limits: { ...this.doc.limits, ...(stored.limits ?? {}) },
      ice: { ...this.doc.ice, ...(stored.ice ?? {}) },
      smtp: { ...this.doc.smtp, ...(stored.smtp ?? {}) },
      ui: { ...this.doc.ui, ...(stored.ui ?? {}) },
      server: { ...this.doc.server, ...(stored.server ?? {}) },
    }
    this.client = undefined
  }

  async update(patch: Partial<RuntimeDoc>): Promise<RuntimeDoc> {
    const next: RuntimeDoc = {
      oidc: { ...this.doc.oidc, ...(patch.oidc ?? {}) },
      limits: { ...this.doc.limits, ...(patch.limits ?? {}) },
      ice: { ...this.doc.ice, ...(patch.ice ?? {}) },
      smtp: { ...this.doc.smtp, ...(patch.smtp ?? {}) },
      ui: { ...this.doc.ui, ...(patch.ui ?? {}) },
      server: { ...this.doc.server, ...(patch.server ?? {}) },
    }
    const publicUrl = next.server.publicUrl.trim()
    if (publicUrl) {
      let parsed: URL
      try { parsed = new URL(publicUrl) } catch { throw new Error('公网地址不是合法 URL') }
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
      if (parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('公网地址只能是 origin（不含路径）')
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
        throw new Error('公网地址必须是 https（localhost 例外）')
      }
      next.server.publicUrl = parsed.origin
    }
    // A background must be https: it is loaded by the browser on the login page.
    if (next.ui.backgroundUrl && !/^https:\/\//i.test(next.ui.backgroundUrl)) throw new Error('背景图必须是 https 地址')
    if (next.oidc.enabled && (!next.oidc.issuer || !next.oidc.clientId)) throw new Error('OIDC 启用时必须填写 issuer 与 clientId')
    // SSO-only removes password login entirely, so it must not be reachable
    // while OIDC is unconfigured — that would lock every account out.
    if (next.oidc.onlySso && (!next.oidc.enabled || !next.oidc.issuer || !next.oidc.clientId)) {
      throw new Error('仅 OIDC 模式要求先启用并配置 OIDC')
    }
    await this.store.setSetting(CONFIG_KEY, next)
    this.doc = next
    this.client = undefined
    return next
  }

  oidcClient(origin: string): OidcClient | undefined {
    const config = this.doc.oidc
    if (!config.enabled || !config.issuer || !config.clientId) return undefined
    const fingerprint = JSON.stringify([origin, config.issuer, config.clientId, config.clientSecret, config.scopes, config.allowedDomains])
    if (this.client?.fingerprint !== fingerprint) {
      this.client = { fingerprint, client: new OidcClient(config, origin) }
    }
    return this.client.client
  }

  /** Admin view: the client secret never leaves the server in clear text. */
  redacted(): Record<string, unknown> {
    return {
      oidc: { ...this.doc.oidc, clientSecret: this.doc.oidc.clientSecret ? '••••••' : '' },
      limits: this.doc.limits,
      ice: { ...this.doc.ice, turnSecret: this.doc.ice.turnSecret ? '••••••' : '', turnPassword: this.doc.ice.turnPassword ? '••••••' : '' },
      smtp: { ...this.doc.smtp, pass: this.doc.smtp.pass ? '••••••' : '' },
      ui: this.doc.ui,
      server: this.doc.server,
      smtpReady: smtpConfigured(this.doc.smtp),
    }
  }
}
