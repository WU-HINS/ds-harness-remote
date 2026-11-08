import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { isIP } from 'node:net'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { z } from 'zod'
import { Gateway } from './gateway.js'
import { ApiError, Store, digest, randomToken, verifyPasswordAsync } from './store-pg.js'
import { loadSettings, type Settings } from './settings.js'
import { perMinute } from './ratelimit.js'
import { Runtime } from './runtime.js'
import { createSmtpMailer, smtpConfigured, type Mailer } from './mailer.js'
import { accountDevicesPage, accountKeysPage, accountPage, adminPage, adminSettingsPage, bindPage, forgotPage, homePage, loginPage, registerPage, setupPage } from './pages.js'
import { buildIceServers, parseIceConfig } from './ice.js'

const REGISTER = z.object({ v: z.literal(1).optional(), device: z.object({
  deviceId: z.string().min(8).max(128), name: z.string().min(1).max(128), role: z.enum(['host', 'client']),
  platform: z.string().max(64).optional(), version: z.string().max(64).optional(), identityKey: z.string().min(16).max(256),
}).passthrough() }).passthrough()

const REFRESH = z.object({ deviceId: z.string().min(8).max(128), refreshToken: z.string().min(16).max(512) }).strict()

interface Context {
  settings: Settings
  store: Store
  gateway: Gateway
  runtime: Runtime
  ice: ReturnType<typeof parseIceConfig>
  userLimiter: ReturnType<typeof perMinute>
  anonLimiter: ReturnType<typeof perMinute>
}

function cookie(name: string, value: string, ageMs: number, secure: boolean): string {
  return name + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(ageMs / 1000) + (secure ? '; Secure' : '')
}
function readCookie(req: IncomingMessage, name: string): string {
  const match = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)').exec(req.headers.cookie ?? '')
  return match ? match[1]! : ''
}
async function body(req: IncomingMessage, limit = 1_048_576): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) throw new ApiError('PAYLOAD_TOO_LARGE', 413)
    chunks.push(chunk as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}
  const type = req.headers['content-type'] ?? ''
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text)) as Record<string, unknown>
  try { return JSON.parse(text) as Record<string, unknown> } catch { throw new ApiError('INVALID_MESSAGE', 400) }
}
function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}
function html(res: ServerResponse, status: number, value: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(value)
}
function normalizeAddress(value: string | undefined): string {
  return (value ?? '').replace(/^::ffff:/, '')
}

/** Loopback, RFC1918, link-local and unique-local IPv6. */
export function isPrivateAddress(ip: string): boolean {
  if (ip === '' ) return false
  if (ip === '::1' || ip === '::') return true
  if (ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (!parts) return false
  const a = Number(parts[1]); const b = Number(parts[2])
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
}

function singleHeader(req: IncomingMessage, name: string): string | undefined {
  let value: string | undefined
  let count = 0
  for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i]!.toLowerCase() !== name) continue
    count += 1
    value = req.rawHeaders[i + 1]
  }
  // Exactly one header; comma-separated lists are rejected rather than guessed.
  if (count !== 1 || value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.includes(',') ? undefined : trimmed
}

/**
 * Client address for rate limiting. Loopback and private peers are trusted by
 * default (that is what a reverse proxy on the same host or LAN looks like);
 * public peers must be listed explicitly.
 */
export function clientAddress(req: IncomingMessage, trusted: ReadonlySet<string>): string {
  const peer = normalizeAddress(req.socket.remoteAddress)
  if (!trusted.has(peer) && !isPrivateAddress(peer)) return peer
  const real = singleHeader(req, 'x-real-ip')
  if (real && isIP(real)) return normalizeAddress(real)
  const forwarded = singleHeader(req, 'x-forwarded-for')
  if (forwarded && isIP(forwarded)) return normalizeAddress(forwarded)
  return peer
}
function loginErrorText(code: string | null): string | undefined {
  if (!code) return undefined
  return ({
    AUTH_INVALID: '邮箱或密码不正确',
    SSO_ONLY: '本站已启用仅 SSO 登录，请使用身份提供方登录',
    EMAIL_UNVERIFIED: '邮箱尚未验证',
    RATE_LIMITED: '尝试过于频繁，请稍后再试',
    ACCOUNT_DISABLED: '账号已被禁用',
    CODE_INVALID: '验证码不正确或已过期',
    INVALID_EMAIL: '邮箱格式不正确',
    SETUP_KEY_INVALID: '初始化密钥无效',
    SETUP_CLOSED: '初始化已完成',
  } as Record<string, string>)[code] ?? code
}

function isForm(req: IncomingMessage): boolean {
  return String(req.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded')
}
function redirect(res: ServerResponse, location: string, headers: Record<string, string> = {}): void {
  res.writeHead(302, { location, 'cache-control': 'no-store', ...headers })
  res.end()
}

function iceFromRuntime(runtime: Runtime) {
  const ice = runtime.current.ice
  return {
    stunUrls: ice.stunUrls, turnUrls: ice.turnUrls,
    turnSecret: ice.turnSecret || undefined, turnUsername: ice.turnUsername || undefined,
    turnPassword: ice.turnPassword || undefined, turnTtlSeconds: 300,
  }
}

export function createApp(settings: Settings, deps: { pool?: Pool; mailer?: Mailer } = {}) {
  const ownsPool = deps.pool === undefined
  const pool = deps.pool ?? new Pool({ connectionString: settings.databaseUrl, max: 10 })
  let listening = false
  const store = new Store(pool)
  const server = createServer({ requestTimeout: 30_000, headersTimeout: 15_000 })
  const gateway = new Gateway(server, store as any, () => runtime.current.server.publicUrl || (settings.publicUrlExplicit ? settings.publicUrl.origin : ''), { turnEnabled: () => Boolean(runtime.current.ice.turnUrls.length) })
  const runtime = new Runtime(store, settings)
  let cachedMailer: { key: string; mailer: Mailer } | undefined
  const mailer = (): Mailer | undefined => {
    if (deps.mailer) return deps.mailer
    const smtp = runtime.current.smtp
    if (!smtpConfigured(smtp)) return undefined
    const key = [smtp.host, smtp.port, smtp.secure, smtp.user, smtp.pass, smtp.from].join('|')
    if (cachedMailer?.key !== key) cachedMailer = { key, mailer: createSmtpMailer(smtp) }
    return cachedMailer.mailer
  }
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
  async function sendCode(email: string, purpose: string, subject: string): Promise<void> {
    const sender = mailer()
    if (!sender) throw new ApiError('SMTP_NOT_CONFIGURED', 503)
    const code = await store.issueEmailCode(email, purpose)
    await sender.send({ to: email, subject, text: '验证码：' + code + '（10 分钟内有效，请勿转发）' })
  }
  const ctx: Context = {
    settings, store, gateway, runtime,
    ice: parseIceConfig(process.env),
    userLimiter: perMinute(settings.userRatePerMinute),
    anonLimiter: perMinute(settings.anonRatePerMinute),
  }
  const membershipOf = (userId: string) => 'user:' + digest(userId).slice(0, 16)
  /** Effective public origin: runtime setting, boot env, or the request itself. */
  const originFor = (req: IncomingMessage): string => {
    const configured = runtime.current.server.publicUrl
    if (configured) return configured
    if (settings.publicUrlExplicit) return settings.publicUrl.origin
    const peer = normalizeAddress(req.socket.remoteAddress)
    const trusted = trustedProxies.has(peer) || isPrivateAddress(peer)
    const proto = trusted ? singleHeader(req, 'x-forwarded-proto') : undefined
    const host = (trusted ? singleHeader(req, 'x-forwarded-host') : undefined) ?? req.headers.host ?? 'localhost'
    return (proto === 'https' ? 'https' : 'http') + '://' + host
  }
  // Emergency escape hatch: DSH_BREAK_GLASS_PASSWORD=1 keeps password login
  // usable even in SSO-only mode. Intended for lockout recovery only.
  const breakGlass = process.env.DSH_BREAK_GLASS_PASSWORD === '1'
  type OidcClaims = { issuer: string; subject: string; email?: string; emailVerified: boolean; name?: string }
  const oidcPending = new Map<string, { claims: OidcClaims; userId: string; expires: number }>()
  const finishOidc = (res: ServerResponse, user: { id: string; username: string }, origin: string) => {
    void store.audit('oidc.success', user.username, user.id)
    const ttl = runtime.limits.sessionTtlMs
    return (async () => {
      const session = await store.createSession(user.id, ttl)
      return redirect(res, '/', { 'set-cookie': cookie('dsh_session', session.token, ttl, origin.startsWith('https:')) })
    })()
  }
  let setupNeeded: boolean | undefined
  const needsSetup = async (): Promise<boolean> => {
    if (setupNeeded === undefined) setupNeeded = (await store.countUsers()) === 0
    return setupNeeded
  }
  const trustedProxies = new Set(settings.trustedProxyIps)
  const syncTrustedProxies = (): void => {
    trustedProxies.clear()
    for (const ip of runtime.current.server.trustedProxyIps) trustedProxies.add(ip)
  }
  /** Device-key logins get a short-lived ticket that may only register a device. */
  const registerTickets = new Map<string, { userId: string; keyId?: string; expires: number }>()
  function takeTicket(value: string): { userId: string; keyId?: string } | undefined {
    const entry = registerTickets.get(value)
    registerTickets.delete(value) // single use: success or failure consumes it
    if (!entry || entry.expires < Date.now()) return undefined
    return { userId: entry.userId, ...(entry.keyId ? { keyId: entry.keyId } : {}) }
  }

  async function sessionUser(req: IncomingMessage) {
    // Cookie first; the same session token is also accepted as a bearer so the
    // original ds-harness clients (which call /auth/me with a token) keep working.
    const token = readCookie(req, 'dsh_session') || bearer(req)
    return store.sessionUser(token)
  }
  async function requireUser(req: IncomingMessage) {
    const user = await sessionUser(req)
    if (!user) throw new ApiError('ACCOUNT_AUTH_REQUIRED', 401)
    return user
  }
  async function requireAdmin(req: IncomingMessage) {
    const user = await requireUser(req)
    if (user.role !== 'admin') throw new ApiError('FORBIDDEN', 403)
    return user
  }
  function bearer(req: IncomingMessage): string {
    const header = req.headers.authorization ?? ''
    return header.startsWith('Bearer ') ? header.slice(7) : ''
  }
  function limitFor(req: IncomingMessage, user: { id: string; role: string }, scope: string): void {
    const key = user.id + ':' + scope
    if (user.role === 'admin') return
    if (!ctx.userLimiter.take(key)) throw new ApiError('RATE_LIMITED', 429)
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = originFor(req)
    const secure = origin.startsWith('https:')
    const url = new URL(req.url ?? '/', origin)
    const path = url.pathname
    const method = req.method ?? 'GET'
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
    res.setHeader('Cache-Control', 'no-store')

    const isCallback = method === 'GET' && path === '/api/v1/auth/oidc/callback'
    if (req.headers.origin && req.headers.origin !== origin) {
      // Until an operator pins the public origin, accept an Origin whose host matches
      // the request host (scheme differs behind a TLS-terminating proxy).
      const derived = runtime.current.server.publicUrl === '' && !settings.publicUrlExplicit
      const header = String(req.headers.origin)
      let sameHost = false
      try { sameHost = new URL(header).host === new URL(origin).host } catch { sameHost = false }
      // Chrome sends "Origin: null" for opaque origins such as plain-http 127.0.0.1.
      // Same-origin form posts are still identifiable by their Referer, which the
      // "same-origin" referrer policy keeps and cross-site requests cannot forge.
      let opaqueSameOrigin = false
      if (header === 'null') {
        try { opaqueSameOrigin = new URL(String(req.headers.referer ?? '')).origin === origin } catch { opaqueSameOrigin = false }
      }
      if (!opaqueSameOrigin && !(derived && sameHost)) throw new ApiError('AUTH_INVALID', 403)
    }
    if (!isCallback && req.headers['sec-fetch-site'] === 'cross-site') throw new ApiError('AUTH_INVALID', 403)

    if (method === 'GET' && path === '/favicon.ico') { res.writeHead(204, { 'cache-control': 'public, max-age=604800' }); res.end(); return }
    if (method === 'GET' && (path === '/healthz' || path === '/health')) return json(res, 200, { status: 'ok' })
    const setupExempt = path === '/setup' || path === '/api/v1/setup' || path === '/ready'
    if (!setupExempt && (await needsSetup())) {
      if (path.startsWith('/api/')) throw new ApiError('SETUP_REQUIRED', 409)
      return redirect(res, '/setup')
    }
    if (method === 'GET' && path === '/ready') {
      try { await pool.query('SELECT 1') } catch { throw new ApiError('NOT_READY', 503) }
      return json(res, 200, { status: 'ready' })
    }

    // ── setup ───────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/setup') {
      return (await store.countUsers()) === 0 ? html(res, 200, setupPage(url.searchParams.get('key') ?? '', origin)) : redirect(res, '/login')
    }
    // Original clients discover OAuth providers here before falling back to the
    // legacy per-provider probes; an empty list keeps that path silent.
    if (method === 'GET' && path === '/api/v1/auth/oauth/providers') return json(res, 200, { items: [] })
    if (method === 'POST' && path === '/api/v1/setup') {
      if (!ctx.anonLimiter.take('setup:' + clientAddress(req, trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
      if ((await store.countUsers()) > 0) throw new ApiError('SETUP_CLOSED', 409)
      const input = await body(req)
      const username = String(input.username ?? '').trim()
      const password = String(input.password ?? '')
      const EMAIL_ONLY = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
      if (!EMAIL_ONLY.test(username) || password.length < 12) throw new ApiError('INVALID_EMAIL', 400)
      const provided = String(input.key ?? url.searchParams.get('key') ?? '')
      if (!(await store.peekSetupKey(provided))) throw new ApiError('SETUP_KEY_INVALID', 403)
      const requestedOrigin = String(input.publicUrl ?? '').trim()
      if (requestedOrigin) {
        try { await runtime.update({ server: { publicUrl: requestedOrigin, trustedProxyIps: runtime.current.server.trustedProxyIps } }) }
        catch (error) { throw new ApiError('INVALID_PUBLIC_URL', 400) }
      }
      const { user, deviceKey } = await store.createFirstAdmin(username, password)
      await store.setEmail(user.id, username, true).catch(() => undefined)
      setupNeeded = false
      await store.consumeSetupKey(provided)
      await store.audit('setup.admin_created', username, user.id)
      const session = await store.createSession(user.id, runtime.limits.sessionTtlMs)
      res.setHeader('Set-Cookie', cookie('dsh_session', session.token, runtime.limits.sessionTtlMs, secure))
      if (isForm(req)) return redirect(res, '/admin')
      return json(res, 201, { user: { id: user.id, username: user.username, role: user.role }, deviceKey, token: session.token, expiresAt: session.expiresAt })
    }

    // ── login ───────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/login') {
      if (await sessionUser(req)) return redirect(res, '/')
      return html(res, 200, loginPage(Boolean(runtime.oidcClient(origin)), loginErrorText(url.searchParams.get('error')), runtime.current.ui.backgroundUrl))
    }
    if (method === 'GET' && path === '/register') return html(res, 200, registerPage(runtime.current.oidc.onlySso, runtime.current.ui.backgroundUrl))
    if (method === 'GET' && path === '/forgot') return html(res, 200, forgotPage(runtime.current.oidc.onlySso, runtime.current.ui.backgroundUrl))
    if (method === 'POST' && path === '/api/v1/auth/login') {
      if (!ctx.anonLimiter.take('login:' + clientAddress(req, trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
      const input = await body(req)
      const login = String(input.username ?? input.email ?? '').trim()
      const secret = String(input.password ?? '')
      const onlySso = runtime.current.oidc.onlySso

      // 1) Device credentials. Verified against device_keys only — the web
      //    password never authenticates a device and vice versa.
      // The account name is always accepted when a real device key is presented;
      // only the password fallback below is gated by SSO-only.
      const device = secret.length >= 16
        ? await store.verifyDeviceCredential(login, secret, true)
        : undefined
      if (device) {
        const ticket = randomUUID() + '.' + randomUUID()
        for (const [key, entry] of registerTickets) if (entry.expires < Date.now()) registerTickets.delete(key)
        registerTickets.set(ticket, { userId: device.user.id, keyId: device.keyId, expires: Date.now() + 300_000 })
        await store.audit('device_key.ticket_issued', login, device.user.id, { keyId: device.keyId })
        return json(res, 200, {
          account: device.user.username, deviceUsername: device.user.device_username,
          token: ticket, expiresAt: Date.now() + 300_000,
        })
      }

      // 2) Web password login, unavailable while SSO-only is on.
      if (onlySso && !breakGlass) {
        await store.audit('login.sso_only_rejected', login)
        throw new ApiError('SSO_ONLY', 403)
      }
      const user = await store.findUserByLogin(login).catch(() => undefined)
      if (!user) await verifyPasswordAsync(secret, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA').catch(() => false)
      if (user && user.email && user.email_verified === false) throw new ApiError('EMAIL_UNVERIFIED', 403)
      if (!user || user.disabled || !(await verifyPasswordAsync(secret, user.password_hash))) {
        await store.audit('login.failure', login)
        throw new ApiError('AUTH_INVALID', 401)
      }
      const session = await store.createSession(user.id, runtime.limits.sessionTtlMs)
      await store.audit('login.success', login, user.id)
      res.setHeader('Set-Cookie', cookie('dsh_session', session.token, runtime.limits.sessionTtlMs, secure))
      if (isForm(req)) return redirect(res, '/')
      return json(res, 200, { account: user.username, isAdmin: user.role === 'admin', token: session.token, expiresAt: session.expiresAt })
    }
    if (method === 'POST' && path === '/api/v1/auth/device-login') {
      if (!ctx.anonLimiter.take('device:' + clientAddress(req, trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
      const input = await body(req)
      const username = String(input.username ?? '').trim()
      const deviceKey = String(input.deviceKey ?? '')
      const onlySso = runtime.current.oidc.onlySso
      const verified = await store.verifyDeviceCredential(username, deviceKey, true)
      let userId: string | undefined = verified?.user.id
      let keyId: string | undefined = verified?.keyId
      if (!userId && !onlySso) {
        // Only when SSO is not mandatory may the login password act as a device secret.
        const user = await store.findUserByLogin(username).catch(() => undefined)
        if (user && !user.disabled && (await verifyPasswordAsync(deviceKey, user.password_hash))) {
          userId = user.id
          keyId = undefined
        }
      }
      if (!userId) { await store.audit('device_login.failure', username); throw new ApiError('AUTH_INVALID', 401) }
      const parsed = REGISTER.parse(input)
      const tokens = await store.register(userId, parsed.device, keyId)
      await store.audit('device_login.success', username, userId, { deviceId: parsed.device.deviceId, keyId: keyId ?? 'password' })
      return json(res, 200, tokens)
    }
    if (path === '/api/v1/auth/logout') {
      if (method !== 'POST') throw new ApiError('METHOD_NOT_ALLOWED', 405)
      await store.deleteSession(readCookie(req, 'dsh_session'))
      res.setHeader('Set-Cookie', cookie('dsh_session', '', 0, secure))
      return json(res, 200, { status: 'ok' })
    }
    if (method === 'GET' && path === '/api/v1/auth/me') {
      const user = await requireUser(req)
      // `account`/`isAdmin` keep the shape the original clients parse.
      return json(res, 200, { account: user.username, isAdmin: user.role === 'admin', deviceUsername: user.device_username, user: { id: user.id, username: user.username, role: user.role }, oidc: Boolean(user.oidc_subject) })
    }

    // ── 自助注册 / 找回密码（P1）────────────────────────────────────────────
    if (method === 'POST' && path === '/api/v1/auth/register/start') {
      if (runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
      if (!mailer()) throw new ApiError('SMTP_NOT_CONFIGURED', 503)
      if (!ctx.anonLimiter.take('reg:' + clientAddress(req, trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
      const input = await body(req)
      const email = String(input.email ?? '').trim().toLowerCase()
      if (!EMAIL_RE.test(email)) throw new ApiError('INVALID_EMAIL', 400)
      // Always answer 202: whether an address exists is not disclosed here.
      if (!(await store.findUserByEmail(email))) {
        await sendCode(email, 'register', 'DSH Remote 注册验证码').catch(() => undefined)
      }
      return json(res, 202, { status: 'sent' })
    }
    if (method === 'POST' && path === '/api/v1/auth/register/complete') {
      if (runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
      if (!ctx.anonLimiter.take('regc:' + clientAddress(req, trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
      const input = await body(req)
      const email = String(input.email ?? '').trim().toLowerCase()
      const code = String(input.code ?? '')
      const password = String(input.password ?? '')
      if (!EMAIL_RE.test(email) || password.length < 12 || !/^\d{6}$/.test(code)) throw new ApiError('INVALID_MESSAGE', 400)
      if (!(await store.consumeEmailCode(email, 'register', code))) {
        await store.audit('auth.code_failure', email, undefined, { purpose: 'register' })
        throw new ApiError('CODE_INVALID', 401)
      }
      if (await store.findUserByEmail(email)) throw new ApiError('EMAIL_TAKEN', 409)
      const { user, deviceKey } = await store.createUser({
        username: email.split('@')[0]!.slice(0, 64), email, emailVerified: true, password, role: 'user',
      }).catch(() => { throw new ApiError('EMAIL_TAKEN', 409) })
      await store.audit('account.registered', email, user.id)
      const session = await store.createSession(user.id, runtime.limits.sessionTtlMs)
      res.setHeader('Set-Cookie', cookie('dsh_session', session.token, runtime.limits.sessionTtlMs, secure))
      return json(res, 201, { account: user.username, email: user.email, token: session.token, expiresAt: session.expiresAt, deviceKey })
    }
    if (method === 'POST' && path === '/api/v1/auth/password/reset/start') {
      if (runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
      if (!mailer()) throw new ApiError('SMTP_NOT_CONFIGURED', 503)
      if (!ctx.anonLimiter.take('reset:' + clientAddress(req, trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
      const input = await body(req)
      const email = String(input.email ?? '').trim().toLowerCase()
      if (!EMAIL_RE.test(email)) throw new ApiError('INVALID_EMAIL', 400)
      if (await store.findUserByEmail(email)) {
        await sendCode(email, 'reset', 'DSH Remote 重置密码验证码').catch(() => undefined)
      }
      return json(res, 202, { status: 'sent' })
    }
    if (method === 'POST' && path === '/api/v1/auth/password/reset/complete') {
      if (runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
      if (!ctx.anonLimiter.take('rspc:' + clientAddress(req, trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
      const input = await body(req)
      const email = String(input.email ?? '').trim().toLowerCase()
      const code = String(input.code ?? '')
      const password = String(input.password ?? '')
      if (!EMAIL_RE.test(email) || password.length < 12 || !/^\d{6}$/.test(code)) throw new ApiError('INVALID_MESSAGE', 400)
      const user = await store.findUserByEmail(email)
      if (!user) throw new ApiError('CODE_INVALID', 401)
      if (!(await store.consumeEmailCode(email, 'reset', code))) {
        await store.audit('auth.code_failure', email, undefined, { purpose: 'reset' })
        throw new ApiError('CODE_INVALID', 401)
      }
      await store.setPassword(user.id, password, { revokeAllDevices: true })
      await store.audit('password.reset', email, user.id)
      return json(res, 200, { status: 'reset' })
    }

    if (method === 'POST' && path === '/api/v1/auth/password/change') {
      const user = await requireUser(req)
      if (runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
      const input = await body(req)
      const currentPassword = String(input.currentPassword ?? '')
      const nextPassword = String(input.newPassword ?? '')
      if (nextPassword.length < 12) throw new ApiError('INVALID_MESSAGE', 400)
      if (!(await verifyPasswordAsync(currentPassword, user.password_hash))) throw new ApiError('AUTH_INVALID', 401)
      await store.setPassword(user.id, nextPassword)
      await store.audit('password.changed', user.username, user.id)
      const session = await store.createSession(user.id, runtime.limits.sessionTtlMs)
      res.setHeader('Set-Cookie', cookie('dsh_session', session.token, runtime.limits.sessionTtlMs, secure))
      return json(res, 200, { status: 'changed' })
    }
    if (method === 'POST' && path === '/api/v1/auth/email/change/start') {
      const user = await requireUser(req)
      if (!mailer()) throw new ApiError('SMTP_NOT_CONFIGURED', 503)
      const input = await body(req)
      const nextEmail = String(input.newEmail ?? '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) throw new ApiError('INVALID_EMAIL', 400)
      if (nextEmail === (user.email ?? '')) throw new ApiError('INVALID_MESSAGE', 400)
      if (user.email) {
        const oldCode = await store.issueEmailCode(user.email, 'email-change-old')
        await mailer()!.send({ to: user.email, subject: 'DSH Remote 换绑确认', text: '原邮箱验证码：' + oldCode + '（10 分钟内有效）' })
      }
      const newCode = await store.issueEmailCode(nextEmail, 'email-change-new')
      await mailer()!.send({ to: nextEmail, subject: 'DSH Remote 换绑确认', text: '新邮箱验证码：' + newCode + '（10 分钟内有效）' })
      await store.audit('email.change_started', user.username, user.id, { from: user.email ?? '', to: nextEmail })
      return json(res, 202, { status: 'sent', requiresOld: Boolean(user.email) })
    }
    if (method === 'POST' && path === '/api/v1/auth/email/change/complete') {
      const user = await requireUser(req)
      const input = await body(req)
      const nextEmail = String(input.newEmail ?? '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) throw new ApiError('INVALID_EMAIL', 400)
      if (await store.findUserByEmail(nextEmail)) throw new ApiError('EMAIL_TAKEN', 409)
      // Verify both before consuming either: one wrong input must not burn the other code.
      if (user.email) {
        const oldCode = String(input.oldCode ?? '')
        if (!(await store.checkEmailCode(user.email, 'email-change-old', oldCode))) {
          await store.audit('auth.code_failure', user.username, user.id, { purpose: 'email-change-old' })
          throw new ApiError('CODE_INVALID', 401)
        }
      }
      const newCode = String(input.newCode ?? '')
      if (!(await store.checkEmailCode(nextEmail, 'email-change-new', newCode))) {
        await store.audit('auth.code_failure', user.username, user.id, { purpose: 'email-change-new' })
        throw new ApiError('CODE_INVALID', 401)
      }
      if (user.email) await store.markEmailCodeConsumed(user.email, 'email-change-old')
      await store.markEmailCodeConsumed(nextEmail, 'email-change-new')
      const previousEmail = user.email ?? ''
      await store.setEmail(user.id, nextEmail, true)
      // Accounts whose login name *is* their email (e.g. the bootstrap admin)
      // must follow the change, otherwise the old address keeps working.
      if (previousEmail && user.username === previousEmail) await store.setUsername(user.id, nextEmail).catch(() => { throw new ApiError('EMAIL_TAKEN', 409) })
      await store.audit('email.changed', user.username, user.id, { from: previousEmail, to: nextEmail })
      const session = await store.createSession(user.id, runtime.limits.sessionTtlMs)
      res.setHeader('Set-Cookie', cookie('dsh_session', session.token, runtime.limits.sessionTtlMs, secure))
      return json(res, 200, { status: 'changed', email: nextEmail })
    }

    // ── OIDC ────────────────────────────────────────────────────────────────
    const oidc = runtime.oidcClient(origin)
    if (oidc && method === 'GET' && path === '/api/v1/auth/oidc/start') {
      const { url: target, state } = await oidc.authorizationUrl()
      res.setHeader('Set-Cookie', 'dsh_oidc_state=' + state + '; Path=/api/v1/auth/oidc; HttpOnly; SameSite=Lax; Max-Age=600' + (secure ? '; Secure' : ''))
      return redirect(res, target)
    }
    if (oidc && isCallback) {
      const code = url.searchParams.get('code') ?? ''
      const state = url.searchParams.get('state') ?? ''
      if (!code || !state) return redirect(res, '/login?error=oidc')
      if (readCookie(req, 'dsh_oidc_state') !== state) return redirect(res, '/login?error=oidc')
      let claims: { issuer: string; subject: string; email?: string; emailVerified: boolean; name?: string }
      try { claims = await oidc.complete(code, state) } catch (error) {
        await store.audit('oidc.failure', undefined, undefined, { code: (error as ApiError).code })
        return redirect(res, '/login?error=oidc')
      }

      // Binding started from the signed-in settings page: attach to that user.
      const current = await sessionUser(req)
      if (current) {
        if (current.oidc_subject) return redirect(res, '/admin?oidc=already-bound')
        if (current.email && claims.email && current.email !== claims.email) return redirect(res, '/admin?oidc=email-mismatch')
        await store.linkOidc(current.id, claims.issuer, claims.subject)
        await store.audit('oidc.bound', current.username, current.id)
        return redirect(res, '/admin?oidc=bound')
      }

      const bySub = await store.findUserByOidc(claims.issuer, claims.subject)
      if (bySub) return finishOidc(res, bySub, origin)

      if (!claims.email || !claims.emailVerified) {
        await store.audit('oidc.rejected', undefined, undefined, { reason: 'email-unverified' })
        return redirect(res, '/login?error=oidc-email')
      }
      const byEmail = await store.findUserByEmail(claims.email)
      if (!byEmail) {
        // Branch A: unknown mailbox → create and bind in one step.
        if (!runtime.current.oidc.autoProvision) return redirect(res, '/login?error=oidc-no-account')
        const created = await store.createUser({
          username: claims.email.split('@')[0]!.slice(0, 64) || 'user',
          email: claims.email, emailVerified: true, role: 'user',
        }).catch(async () => {
          // Concurrent first login for the same mailbox: fall back to that row.
          const existing = await store.findUserByEmail(claims.email!)
          return existing ? { user: existing, deviceKey: '' } : undefined
        })
        if (!created) return redirect(res, '/login?error=oidc')
        await store.linkOidc(created.user.id, claims.issuer, claims.subject)
        await store.audit('oidc.provisioned', claims.email, created.user.id)
        const fresh = await store.findUserById(created.user.id)
        return fresh ? finishOidc(res, fresh, origin) : redirect(res, '/login?error=oidc')
      }

      // Branch D: mailbox already bound to a different subject.
      if (byEmail.oidc_subject && (byEmail.oidc_subject !== claims.subject || byEmail.oidc_issuer !== claims.issuer)) {
        await store.audit('oidc.conflict', byEmail.username, byEmail.id)
        return redirect(res, '/login?error=oidc-conflict')
      }
      // Branch B: known mailbox, unbound. Verification unless disabled.
      if (!runtime.current.oidc.bindRequireVerification) {
        await store.linkOidc(byEmail.id, claims.issuer, claims.subject)
        await store.audit('oidc.auto_bound', byEmail.username, byEmail.id)
        return finishOidc(res, byEmail, origin)
      }
      const ticket = randomUUID() + '.' + randomUUID()
      oidcPending.set(ticket, { claims, userId: byEmail.id, expires: Date.now() + 900_000 })
      for (const [key, value] of oidcPending) if (value.expires < Date.now()) oidcPending.delete(key)
      return redirect(res, '/auth/oidc/bind?ticket=' + encodeURIComponent(ticket))
    }

    if (method === 'GET' && path === '/auth/oidc/bind') {
      const ticket = url.searchParams.get('ticket') ?? ''
      const pending = oidcPending.get(ticket)
      if (!pending || pending.expires < Date.now()) return redirect(res, '/login?error=oidc-expired')
      return html(res, 200, bindPage(pending.claims.email ?? '', runtime.current.oidc.onlySso, runtime.current.ui.backgroundUrl))
    }
    if (method === 'POST' && path === '/api/v1/auth/oidc/bind/complete') {
      const input = await body(req)
      const ticket = String(input.ticket ?? '')
      const pending = oidcPending.get(ticket)
      if (!pending || pending.expires < Date.now()) throw new ApiError('OIDC_EXPIRED', 401)
      const user = await store.findUserById(pending.userId)
      if (!user || user.disabled) throw new ApiError('OIDC_EXPIRED', 401)
      if (user.oidc_subject) throw new ApiError('OIDC_ALREADY_BOUND', 409)
      const mode = String(input.mode ?? 'password')
      if (mode === 'code') {
        const code = String(input.code ?? '')
        if (!/^\d{6}$/.test(code)) throw new ApiError('INVALID_MESSAGE', 400)
        if (!(await store.consumeEmailCode(pending.claims.email!, 'oidc-bind', code))) throw new ApiError('CODE_INVALID', 401)
      } else {
        if (runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
        const password = String(input.password ?? '')
        if (!(await verifyPasswordAsync(password, user.password_hash))) throw new ApiError('AUTH_INVALID', 401)
      }
      oidcPending.delete(ticket)
      await store.linkOidc(user.id, pending.claims.issuer, pending.claims.subject)
      await store.audit('oidc.bound', user.username, user.id)
      const session = await store.createSession(user.id, runtime.limits.sessionTtlMs)
      res.setHeader('Set-Cookie', cookie('dsh_session', session.token, runtime.limits.sessionTtlMs, secure))
      return json(res, 200, { status: 'bound' })
    }
    if (method === 'POST' && path === '/api/v1/auth/oidc/bind/start') {
      const input = await body(req)
      const ticket = String(input.ticket ?? '')
      const pending = oidcPending.get(ticket)
      if (!pending || pending.expires < Date.now()) throw new ApiError('OIDC_EXPIRED', 401)
      if (!mailer()) throw new ApiError('SMTP_NOT_CONFIGURED', 503)
      const code = await store.issueEmailCode(pending.claims.email!, 'oidc-bind')
      await mailer()!.send({ to: pending.claims.email!, subject: 'DSH Remote 绑定验证码', text: '验证码：' + code + '（10 分钟内有效）' })
      return json(res, 202, { status: 'sent' })
    }
    if (method === 'POST' && path === '/api/v1/auth/oidc/unbind') {
      const user = await requireUser(req)
      if (runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
      await store.unlinkOidc(user.id)
      await store.audit('oidc.unbound', user.username, user.id)
      return json(res, 200, { status: 'unbound' })
    }

    // ── web pages ───────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/') {
      const user = await sessionUser(req)
      if (!user) return redirect(res, '/login')
      return html(res, 200, homePage(user.username, user.role, user.device_username ?? ''))
    }
    if (method === 'GET' && (path === '/account' || path === '/account/devices' || path === '/account/keys')) {
      const user = await sessionUser(req)
      if (!user) return redirect(res, '/login')
      const bg = runtime.current.ui.backgroundUrl
      const device = user.device_username ?? ''
      const admin = user.role === 'admin'
      if (path === '/account/devices') return html(res, 200, accountDevicesPage(user.username, bg, device, admin))
      if (path === '/account/keys') return html(res, 200, accountKeysPage(user.username, bg, device, admin))
      return html(res, 200, accountPage(user.username, user.email ?? '', Boolean(user.oidc_subject), runtime.current.oidc.onlySso, bg, device, admin))
    }
    if (method === 'GET' && (path === '/admin' || path === '/admin/settings')) {
      const user = await sessionUser(req)
      if (!user) return redirect(res, '/login')
      if (user.role !== 'admin') return redirect(res, '/')
      if (path === '/admin/settings') return html(res, 200, adminSettingsPage(user.username, runtime.current.ui.backgroundUrl, user.device_username ?? ''))
      return html(res, 200, adminPage(user.username, runtime.current.ui.backgroundUrl, user.device_username ?? ''))
    }

    // ── admin API ───────────────────────────────────────────────────────────
    if (path.startsWith('/api/v1/admin/')) {
      const admin = await requireAdmin(req)
      if (method === 'GET' && path === '/api/v1/admin/settings') return json(res, 200, runtime.redacted())
      if (method === 'PUT' && path === '/api/v1/admin/settings') {
        const input = await body(req) as Record<string, any>
        const patch: Record<string, any> = {}
        if (input.oidc && typeof input.oidc === 'object') {
          const o = input.oidc as Record<string, unknown>
          const has = (key: string) => Object.prototype.hasOwnProperty.call(o, key)
          const current = runtime.current.oidc
          const next: Record<string, unknown> = {}
          // Patch semantics: an absent field keeps its stored value. An empty
          // secret means "unchanged" so a form round-trip cannot wipe it.
          if (has('enabled')) next.enabled = Boolean(o.enabled)
          if (has('onlySso')) next.onlySso = Boolean(o.onlySso)
          if (has('bindRequireVerification')) next.bindRequireVerification = Boolean(o.bindRequireVerification)
          if (has('issuer')) next.issuer = String(o.issuer ?? '').trim()
          if (has('clientId')) next.clientId = String(o.clientId ?? '').trim()
          if (has('clientSecret')) {
            const secret = String(o.clientSecret ?? '')
            next.clientSecret = secret === '' || secret === '••••••' ? current.clientSecret : secret
          }
          if (has('scopes')) next.scopes = String(o.scopes ?? '') || 'openid email profile'
          if (has('allowedDomains')) {
            next.allowedDomains = Array.isArray(o.allowedDomains)
              ? o.allowedDomains.map((v: unknown) => String(v).trim().toLowerCase()).filter(Boolean)
              : String(o.allowedDomains ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
          }
          if (has('autoProvision')) next.autoProvision = Boolean(o.autoProvision)
          patch.oidc = next
        }
        if (input.limits && typeof input.limits === 'object') {
          const l = input.limits
          const current = runtime.limits
          const pick = (key: keyof typeof current) => {
            if (!Object.prototype.hasOwnProperty.call(l, key)) return current[key]
            const value = Number((l as Record<string, unknown>)[key])
            // Reject null/NaN/non-positive instead of silently writing 0.
            return Number.isFinite(value) && value > 0 ? Math.floor(value) : current[key]
          }
          patch.limits = {
            sessionTtlMs: pick('sessionTtlMs'),
            userRatePerMinute: pick('userRatePerMinute'),
            anonRatePerMinute: pick('anonRatePerMinute'),
            userConnectionLimit: pick('userConnectionLimit'),
          }
        }
        if (input.ice && typeof input.ice === 'object') {
          const i = input.ice as Record<string, unknown>
          const has = (key: string) => Object.prototype.hasOwnProperty.call(i, key)
          const list = (value: unknown) => Array.isArray(value) ? value.map(String).map(v => v.trim()).filter(Boolean)
            : String(value ?? '').split(',').map(v => v.trim()).filter(Boolean)
          const current = runtime.current.ice
          const secret = (key: 'turnSecret' | 'turnPassword') => {
            if (!has(key)) return current[key]
            const value = String(i[key] ?? '')
            // '' and the mask both mean "unchanged" so a form round-trip is safe.
            return value === '' || value === '••••••' ? current[key] : value
          }
          patch.ice = {
            stunUrls: list(i.stunUrls), turnUrls: list(i.turnUrls),
            turnUsername: has('turnUsername') ? String(i.turnUsername ?? '') : current.turnUsername,
            turnSecret: secret('turnSecret'), turnPassword: secret('turnPassword'),
          }
        }
        if (input.smtp && typeof input.smtp === 'object') {
          const m = input.smtp as Record<string, unknown>
          const has = (key: string) => Object.prototype.hasOwnProperty.call(m, key)
          const cur = runtime.current.smtp
          const port = Number(m.port)
          const pass = has('pass') ? String(m.pass ?? '') : ''
          patch.smtp = {
            host: has('host') ? String(m.host ?? '').trim() : cur.host,
            port: Number.isFinite(port) && port > 0 && port < 65536 ? Math.floor(port) : cur.port,
            secure: has('secure') ? Boolean(m.secure) : cur.secure,
            user: has('user') ? String(m.user ?? '') : cur.user,
            pass: !has('pass') || pass === '' || pass === '••••••' ? cur.pass : pass,
            from: has('from') ? String(m.from ?? '').trim() : cur.from,
          }
        }
        if (input.server && typeof input.server === 'object') {
          const sv = input.server as Record<string, unknown>
          const has = (key: string) => Object.prototype.hasOwnProperty.call(sv, key)
          const next: Record<string, unknown> = {}
          if (has('publicUrl')) next.publicUrl = String(sv.publicUrl ?? '').trim()
          if (has('trustedProxyIps')) {
            next.trustedProxyIps = (Array.isArray(sv.trustedProxyIps)
              ? sv.trustedProxyIps.map((v: unknown) => String(v).trim()).filter(Boolean)
              : String(sv.trustedProxyIps ?? '').split(',').map(v => v.trim()).filter(Boolean))
          }
          patch.server = next
        }
        if (input.ui && typeof input.ui === 'object') {
          const u = input.ui as Record<string, unknown>
          if (Object.prototype.hasOwnProperty.call(u, 'backgroundUrl')) {
            patch.ui = { backgroundUrl: String(u.backgroundUrl ?? '').trim() }
          }
        }
        const wasOnlySso = runtime.current.oidc.onlySso
        try { await runtime.update(patch) } catch { throw new ApiError('INVALID_SETTINGS', 400) }
        if (!wasOnlySso && runtime.current.oidc.onlySso) {
          // Existing password sessions must not outlive the switch, except the
          // operator's own session (otherwise nobody can turn it back off).
          await store.clearOtherSessions(readCookie(req, 'dsh_session'))
        }
        ctx.userLimiter.setLimit(runtime.limits.userRatePerMinute)
        ctx.anonLimiter.setLimit(runtime.limits.anonRatePerMinute)
        store.connectionLimit = runtime.limits.userConnectionLimit
        syncTrustedProxies()
        await store.audit('settings.updated', admin.username, admin.id)
        return json(res, 200, runtime.redacted())
      }
      if (method === 'GET' && path === '/api/v1/admin/devices') {
        const items = await store.listAllDevices()
        return json(res, 200, { items: items.map(d => ({
          ...d.descriptor, userId: d.userId, username: d.username, revoked: d.revoked,
          membershipId: membershipOf(d.userId), online: gateway.peers.has(d.descriptor.deviceId), lastSeenAt: d.lastSeenAt,
        })) })
      }
      const adminDevice = /^\/api\/v1\/admin\/devices\/([^/]+)$/.exec(path)
      if (method === 'DELETE' && adminDevice) {
        await store.revoke(adminDevice[1]!).catch(() => { throw new ApiError('DEVICE_NOT_FOUND', 404) })
        await store.audit('device.revoked_by_admin', admin.username, undefined, { deviceId: adminDevice[1] })
        return json(res, 200, { status: 'revoked' })
      }
      if (method === 'POST' && path === '/api/v1/admin/smtp/test') {
        const sender = mailer()
        if (!sender) throw new ApiError('SMTP_NOT_CONFIGURED', 503)
        const input = await body(req)
        const to = String(input.to ?? '').trim()
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new ApiError('INVALID_EMAIL', 400)
        try { await sender.send({ to, subject: 'DSH Remote 测试邮件', text: '如果你收到这封邮件，SMTP 配置可用。' }) }
        catch { throw new ApiError('SMTP_SEND_FAILED', 502) }
        return json(res, 200, { status: 'sent' })
      }
      if (method === 'GET' && path === '/api/v1/admin/audit') {
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50))
        return json(res, 200, { items: await store.listAudit(limit) })
      }
      if (method === 'GET' && path === '/api/v1/admin/users') {
        const users = await store.listUsers()
        const keys = await Promise.all(users.map(async u => (await store.listDeviceKeys(u.id)).filter(k => !k.revoked).length))
        return json(res, 200, { users: users.map((u, i) => ({
          id: u.id, username: u.username, deviceUsername: u.device_username, role: u.role,
          disabled: u.disabled, oidc: Boolean(u.oidc_subject), deviceKeys: keys[i], createdAt: u.created_at,
        })) })
      }
      if (method === 'POST' && path === '/api/v1/admin/users') {
        const input = await body(req)
        const raw = String(input.username ?? input.email ?? '').trim()
        const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
        // An email may be used as the account name: it then also becomes the
        // mailbox for verification codes, exactly like the bootstrap admin.
        const isEmailName = EMAIL_RE.test(raw)
        const username = isEmailName ? raw.toLowerCase() : raw
        if (!isEmailName && (username.length < 3 || username.includes('@'))) throw new ApiError('INVALID_MESSAGE', 400)
        const password = typeof input.password === 'string' && input.password.length >= 12 ? input.password : undefined
        const role = input.role === 'admin' ? 'admin' as const : 'user' as const
        const email = isEmailName ? username : (typeof input.email === 'string' && input.email.includes('@') ? String(input.email).trim().toLowerCase() : undefined)
        const created = await store.createUser({ username, role, ...(password ? { password } : {}), ...(email ? { email, emailVerified: true } : {}) }).catch((error: any) => {
          throw new ApiError(String(error?.code) === '23505' ? 'USER_EXISTS' : 'INVALID_MESSAGE', 409)
        })
        await store.audit('user.created', admin.username, created.user.id, { role })
        // The first device key belongs to the user; administrators never see it.
        return json(res, 201, { user: { id: created.user.id, username, role } })
      }
      const match = /^\/api\/v1\/admin\/users\/([0-9a-f-]{36})(\/device-key)?$/.exec(path)
      if (match) {
        const id = match[1]!
        if (method === 'PATCH' && !match[2]) {
          const input = await body(req)
          const target = await store.findUserById(id)
          if (!target) throw new ApiError('USER_NOT_FOUND', 404)
          // Administrators are immutable from the console: no disable, no password
          // reset, no role change. Only their own credentials changes apply.
          if (target.role === 'admin') throw new ApiError('ADMIN_PROTECTED', 409)
          if (input.toggle === true) await store.setDisabled(id, !target.disabled)
          await store.audit('user.updated', admin.username, id, { disabled: !target.disabled })
          return json(res, 200, { status: 'ok' })
        }
        if (method === 'DELETE' && !match[2]) {
          if (id === admin.id) throw new ApiError('CANNOT_DELETE_SELF', 409)
          const target = await store.findUserById(id)
          if (!target) throw new ApiError('USER_NOT_FOUND', 404)
          if (target.role === 'admin') throw new ApiError('ADMIN_PROTECTED', 409)
          await store.deleteUser(id)
          await store.audit('user.deleted', admin.username, id)
          return json(res, 200, { status: 'deleted' })
        }
      }
      throw new ApiError('METHOD_NOT_FOUND', 404)
    }

    // ── device API (bearer) ─────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/v1/auth/refresh') {
      if (!ctx.anonLimiter.take('refresh:' + clientAddress(req, trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
      const input = REFRESH.parse(await body(req))
      return json(res, 200, await store.refresh(input.deviceId, input.refreshToken))
    }
    if (method === 'POST' && path === '/api/v1/devices/register') {
      const input = REGISTER.parse(await body(req))
      // Device enrolment is authorised by a registration ticket only. A web
      // session must never mint device tokens, otherwise "password cannot be
      // exchanged for a device credential" would be false.
      const ticket = takeTicket(bearer(req))
      if (ticket) {
        await store.audit('device.registered', '(device-key)', ticket.userId, { deviceId: input.device.deviceId })
        return json(res, 200, await store.register(ticket.userId, input.device, ticket.keyId))
      }
      // Compatibility: the original protocol lets an account token enrol a
      // device. It stays disallowed under SSO-only, exactly like the password
      // acting as a device secret.
      const session = runtime.current.oidc.onlySso ? undefined : await sessionUser(req)
      if (!session) throw new ApiError('DEVICE_KEY_REQUIRED', 401)
      await store.audit('device.registered_from_account', session.username, session.id, { deviceId: input.device.deviceId })
      return json(res, 200, await store.register(session.id, input.device))
    }
    // Device keys belong to the account owner: only the owner may list, create
    // or revoke them, and the plaintext can be revealed again at any time.
    if (path === '/api/v1/account/device-keys' && (method === 'GET' || method === 'POST')) {
      const user = await requireUser(req)
      if (method === 'GET') return json(res, 200, { keys: await store.listDeviceKeys(user.id) })
      const input = await body(req)
      const key = await store.createDeviceKey(user.id, String(input.label ?? 'device'))
      await store.audit('device_key.created', user.username, user.id, { keyId: key.id })
      return json(res, 201, key)
    }
    const ownKey = /^\/api\/v1\/account\/device-keys\/([0-9a-f-]{36})$/.exec(path)
    if (method === 'DELETE' && ownKey) {
      const user = await requireUser(req)
      const owned = (await store.listDeviceKeys(user.id)).some(k => k.id === ownKey[1])
      if (!owned) throw new ApiError('DEVICE_KEY_NOT_FOUND', 404)
      await store.revokeDeviceKey(ownKey[1]!, user.id)
      await store.audit('device_key.revoked', user.username, user.id, { keyId: ownKey[1] })
      return json(res, 200, { status: 'revoked' })
    }

    // Web sessions read their own device list here; the bearer branch below
    // serves the same shape to enrolled devices.
    if (method === 'GET' && path === '/api/v1/account/devices' && !bearer(req)) {
      const session = await sessionUser(req)
      if (!session) throw new ApiError('AUTH_REQUIRED', 401)
      const items = store.list(session.id).map(d => ({ ...d.descriptor, membershipId: membershipOf(d.userId), online: gateway.peers.has(d.descriptor.deviceId), lastSeenAt: d.lastSeenAt }))
      return json(res, 200, { items, serverUrl: origin, transport: 'webrtc' })
    }
    if (bearer(req) || path.startsWith('/api/v1/devices') || path.startsWith('/api/v1/turn')) {
      const device = store.authenticate(bearer(req))
      const owner = await store.findUserById(device.userId)
      limitFor(req, { id: device.userId, role: owner?.role ?? 'user' }, 'device')
      const target = device.descriptor
      if (method === 'GET' && path === '/api/v1/me') return json(res, 200, { ...target, membershipId: membershipOf(device.userId), user: device.userId })
      if (method === 'GET' && path === '/api/v1/account/devices') {
        const items = store.list(device.userId).map(d => ({ ...d.descriptor, membershipId: membershipOf(d.userId), online: gateway.peers.has(d.descriptor.deviceId), lastSeenAt: d.lastSeenAt }))
        return json(res, 200, { items, serverUrl: origin, transport: 'webrtc' })
      }
      if (method === 'DELETE' && path === '/api/v1/devices/self') {
        await store.revoke(target.deviceId, device.userId)
        return json(res, 200, { status: 'revoked' })
      }
      if (method === 'GET' && path === '/api/v1/devices') {
        const items = store.list(device.userId).filter(d => d.descriptor.role === 'host')
          .map(d => ({ ...d.descriptor, membershipId: membershipOf(d.userId), online: gateway.peers.has(d.descriptor.deviceId), lastSeenAt: d.lastSeenAt }))
        return json(res, 200, { items, nextCursor: null })
      }
      if (method === 'GET' && path === '/api/v1/turn/credentials') {
        const connectionId = url.searchParams.get('connection_id') ?? ''
        if (!connectionId || !gateway.authorizeIce(target.deviceId, connectionId)) throw new ApiError('CONNECTION_NOT_FOUND', 404)
        return json(res, 200, { iceServers: buildIceServers(iceFromRuntime(runtime), target.deviceId) })
      }
      const one = /^\/api\/v1\/devices\/([^/]+)(\/presence)?$/.exec(path)
      if (method === 'GET' && one) {
        const other = (() => { try { return store.get(one[1]!) } catch { return undefined } })()
        if (!other || other.userId !== device.userId) throw new ApiError('DEVICE_NOT_FOUND', 404)
        const view = { ...other.descriptor, membershipId: membershipOf(other.userId), online: gateway.peers.has(one[1]!), lastSeenAt: other.lastSeenAt }
        return json(res, 200, one[2] ? { deviceId: view.deviceId, online: view.online, lastSeenAt: view.lastSeenAt } : view)
      }
      const nameMatch = /^\/api\/v1\/devices\/([^/]+)\/name$/.exec(path)
      if (method === 'POST' && nameMatch) {
        const input = await body(req)
        const name = String(input.name ?? '').trim()
        if (!name || name.length > 80) throw new ApiError('INVALID_MESSAGE', 400)
        try { store.get(nameMatch[1]!) } catch { throw new ApiError('DEVICE_NOT_FOUND', 404) }
        const owned = (() => { try { return store.get(nameMatch[1]!) } catch { return undefined } })()
        if (!owned || owned.userId !== device.userId) throw new ApiError('DEVICE_NOT_FOUND', 404)
        await store.rename(nameMatch[1]!, name)
        return json(res, 200, { ...owned.descriptor, name, membershipId: membershipOf(device.userId) })
      }
      throw new ApiError('METHOD_NOT_FOUND', 404)
    }

    throw new ApiError('METHOD_NOT_FOUND', 404)
  }

  server.on('request', (req, res) => {
    void route(req, res).catch((error: unknown) => {
      if (res.headersSent || res.destroyed) return
      const status = error instanceof ApiError ? error.status : error instanceof z.ZodError ? 400 : 500
      const code = error instanceof ApiError ? error.code : error instanceof z.ZodError ? 'INVALID_MESSAGE' : 'INTERNAL_ERROR'
      if (status === 429) res.setHeader('retry-after', '60')
      // A browser form post must land on a page, not on raw JSON.
      if (isForm(req)) {
        const path = new URL(req.url ?? '/', 'http://x').pathname
        const target = path === '/api/v1/auth/login' ? '/login?error='
          : path === '/api/v1/setup' ? '/setup?error='
            : path === '/api/v1/auth/register/complete' ? '/register?error='
              : path === '/api/v1/auth/password/reset/complete' ? '/forgot?error=' : ''
        if (target) return redirect(res, target + encodeURIComponent(code))
      }
      json(res, status, { error: { code, message: code, requestId: randomUUID(), retryable: status === 429 || status >= 500 } })
    })
  })

  return {
    server, gateway, store, pool,
    async start() {
      await store.migrate()
      await store.hydrate()
      await store.acquireInstanceLease()
      await runtime.init()
      syncTrustedProxies()
      store.connectionLimit = runtime.limits.userConnectionLimit
      let setupKey: string | undefined
      if ((await store.countUsers()) === 0) setupKey = await store.ensureSetupKey(() => process.env.DSH_SETUP_KEY?.trim() || randomToken())
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(settings.port, settings.host, () => { server.off('error', reject); resolve() })
      })
      listening = true
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : settings.port
      return { port, setupKey }
    },
    async close() {
      gateway.close()
      if (listening) {
        listening = false
        await new Promise<void>(resolve => server.close(() => resolve()))
      }
      store.releaseInstanceLease()
      // Only tear down the pool this app created; an injected pool belongs to the caller.
      if (ownsPool) await pool.end()
    },
  }
}
