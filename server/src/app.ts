import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readAsset, webAssetsMissing } from './assets.js'
import { THEME_BOOT_HASH } from './pages.js'
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
import { accountDevicesPage, accountKeysPage, accountPage, adminPage, adminSettingsPage, forgotPage, homePage, loginPage, registerPage, setupPage } from './pages.js'
import { buildIceServers, parseIceConfig } from './ice.js'
import { handleAdminApi } from './routes/admin.js'
import { handleAuthFlows } from './routes/auth-flows.js'

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
    'oidc-unavailable': '本站未启用 SSO 登录',
    oidc: '单点登录失败，请重试或联系管理员',
    'oidc-conflict': '该邮箱已绑定其他 SSO 账号，请联系管理员',
    'oidc-expired': '单点登录会话已过期，请重新登录',
    'oidc-email': '身份提供方未返回已验证的邮箱',
    'oidc-no-account': '该邮箱尚未注册，请联系管理员开通',
    INVALID_SETTINGS: '设置有误，请检查填写内容',
    SETUP_CLOSED: '初始化已完成',
  } as Record<string, string>)[code] ?? '操作未能完成，请重试'
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
  const gateway = new Gateway(server, store as any, () => runtime.current.server.publicUrl || (settings.publicUrlExplicit ? settings.publicUrl.origin : ''), { turnEnabled: () => Boolean(runtime.current.ice.turnUrls.length), relayBytesPerSecond: settings.relayBytesPerSecond })
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
  // Emergency: DSH_BREAK_GLASS_PASSWORD=1 keeps password login usable in SSO-only.
  const breakGlass = process.env.DSH_BREAK_GLASS_PASSWORD === '1'
  type OidcClaims = { issuer: string; subject: string; email?: string; emailVerified: boolean; name?: string }
  const oidcPending = new Map<string, { claims: OidcClaims; userId: string; expires: number }>()
  const finishOidc = (res: ServerResponse, user: { id: string; username: string }, origin: string) => {
    const ttl = runtime.limits.sessionTtlMs
    return (async () => {
      await store.audit('oidc.success', user.username, user.id)
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
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'sha256-" + THEME_BOOT_HASH + "'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
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
    // Documents may legitimately arrive cross-site (identity provider redirects,
    // external links). Only state-changing requests need the CSRF-style refusal.
    const safeMethod = method === 'GET' || method === 'HEAD'
    if (!isCallback && !safeMethod && req.headers['sec-fetch-site'] === 'cross-site') {
      throw new ApiError('AUTH_INVALID', 403, '跨站请求被拒绝')
    }

    if (path.startsWith('/assets/')) {
      const found = readAsset(path.slice('/assets/'.length))
      if (!found) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('asset not found'); return }
      res.writeHead(200, { 'content-type': found.type, 'cache-control': 'public, max-age=31536000, immutable' })
      res.end(found.body)
      return
    }
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
      if ((await store.countUsers()) > 0) return redirect(res, '/login')
      return html(res, 200, setupPage(url.searchParams.get('key') ?? '', origin, loginErrorText(url.searchParams.get('error'))))
    }
    // Original clients discover OAuth providers here before falling back to the
    // legacy per-provider probes; an empty list keeps that path silent.
    if (method === 'GET' && path === '/api/v1/auth/oauth/providers') return json(res, 200, { items: [] })
    // Legacy OAuth (zhihu / github) is not implemented: answer "not configured"
    // so old clients skip it instead of surfacing METHOD_NOT_FOUND.
    if (method === 'GET' && (path === '/api/v1/auth/oauth/status' || path === '/api/v1/auth/oauth/github/status')) {
      return json(res, 200, { configured: false })
    }
    if (method === 'GET' && /^\/api\/v1\/auth\/oauth\/(start|github\/start|qr\/start|qr\/[^/]+)$/.test(path)) {
      throw new ApiError('OAUTH_NOT_CONFIGURED', 404)
    }
    if (method === 'POST' && path === '/api/v1/setup') {
      if (!ctx.anonLimiter.take('setup:' + clientAddress(req, trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
      if ((await store.countUsers()) > 0) throw new ApiError('SETUP_CLOSED', 409)
      const input = await body(req)
      const username = String(input.username ?? '').trim()
      const password = String(input.password ?? '')
      const EMAIL_ONLY = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
      if (!EMAIL_ONLY.test(username) || password.length < 12) throw new ApiError('INVALID_EMAIL', 400, '管理员必须使用邮箱，密码至少 12 位')
      const provided = String(input.key ?? url.searchParams.get('key') ?? '')
      if (!(await store.peekSetupKey(provided))) throw new ApiError('SETUP_KEY_INVALID', 403, '初始化密钥无效，请核对启动日志里的密钥')
      const requestedOrigin = String(input.publicUrl ?? '').trim()
      if (requestedOrigin) {
        try { await runtime.update({ server: { publicUrl: requestedOrigin, trustedProxyIps: runtime.current.server.trustedProxyIps } }) }
        catch (error) { throw new ApiError('INVALID_PUBLIC_URL', 400, error instanceof Error ? error.message : '公网地址不合法') }
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
    if (method === 'GET' && path === '/register') return html(res, 200, registerPage(runtime.current.oidc.onlySso, runtime.current.ui.backgroundUrl, loginErrorText(url.searchParams.get('error'))))
    if (method === 'GET' && path === '/forgot') return html(res, 200, forgotPage(runtime.current.oidc.onlySso, runtime.current.ui.backgroundUrl, loginErrorText(url.searchParams.get('error'))))
    if (method === 'POST' && path === '/api/v1/auth/login') {
      if (!ctx.anonLimiter.take('login:' + clientAddress(req, trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
      const input = await body(req)
      const login = String(input.username ?? input.email ?? '').trim()
      const secret = String(input.password ?? '')
      const onlySso = runtime.current.oidc.onlySso

      // Device key first; the password fallback below is the only SSO-gated path,
      // and a web password never authenticates a device (or vice versa).
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
      if (user && user.email && user.email_verified === false) throw new ApiError('EMAIL_UNVERIFIED', 403, '邮箱尚未验证')
      if (!user) {
        // Same work as a real verification so a missing account is not faster.
        await verifyPasswordAsync(secret, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA').catch(() => false)
        await store.audit('login.failure', login)
        throw new ApiError('AUTH_INVALID', 401, '邮箱或密码不正确')
      }
      if (!(await verifyPasswordAsync(secret, user.password_hash))) {
        await store.audit('login.failure', login)
        throw new ApiError('AUTH_INVALID', 401, '邮箱或密码不正确')
      }
      if (user.disabled) {
        await store.audit('login.disabled', login, user.id)
        throw new ApiError('ACCOUNT_DISABLED', 403, '账号已被禁用，请联系管理员')
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
      const verified = await store.verifyDeviceCredential(username, deviceKey, true)
      let userId: string | undefined = verified?.user.id
      let keyId: string | undefined = verified?.keyId
      if (!userId) {
        // SSO-only blocks the *web* password login; a device may still enrol with
        // the account password, which is a device credential like any other.
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
      if (isForm(req)) return redirect(res, '/login')
      return json(res, 200, { status: 'ok' })
    }
    if (method === 'GET' && path === '/api/v1/auth/me') {
      const user = await requireUser(req)
      // `account`/`isAdmin` keep the shape the original clients parse.
      return json(res, 200, { account: user.username, isAdmin: user.role === 'admin', deviceUsername: user.device_username, user: { id: user.id, username: user.username, role: user.role }, oidc: Boolean(user.oidc_subject) })
    }

    // Grouped route table: page/device/setup/login predicates stay here; the
    // moved routes keep exact `path ===` guards in routes/*. First match wins.
    const groupedRoutes: Array<{ match: (path: string) => boolean; handle: () => Promise<void> }> = [
      {
        match: p => p.startsWith('/api/v1/auth/register/') || p.startsWith('/api/v1/auth/password/')
          || p.startsWith('/api/v1/auth/email/') || p.startsWith('/api/v1/auth/oidc/') || p === '/auth/oidc/bind',
        handle: () => handleAuthFlows(req, res, url, path, method, secure, origin, {
          store, runtime, anonLimiter: ctx.anonLimiter, body, json, html, redirect, readCookie,
          sessionUser, requireUser, cookie, isForm, mailer, sendCode, verifyPasswordAsync,
          clientAddress, trustedProxies, finishOidc, oidcPending,
        }),
      },
      {
        match: p => p.startsWith('/api/v1/admin/'),
        handle: () => handleAdminApi(req, res, url, path, method, {
          store, runtime, gateway, requireAdmin, body, json, readCookie, mailer, membershipOf, syncTrustedProxies,
          userLimiter: ctx.userLimiter, anonLimiter: ctx.anonLimiter,
        }),
      },
    ]
    for (const grouped of groupedRoutes) {
      if (!grouped.match(path)) continue
      await grouped.handle()
      return
    }
    // ── web pages ───────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/') {
      const user = await sessionUser(req)
      if (!user) return redirect(res, '/login')
      return html(res, 200, homePage(user.username, user.role, user.device_username ?? '', runtime.current.server.publicUrl || origin))
    }
    if (method === 'GET' && (path === '/account' || path === '/account/devices' || path === '/account/keys')) {
      const user = await sessionUser(req)
      if (!user) return redirect(res, '/login')
      const bg = runtime.current.ui.backgroundUrl
      const device = user.device_username ?? ''
      const admin = user.role === 'admin'
      if (path === '/account/devices') return html(res, 200, accountDevicesPage(user.username, bg, device, admin))
      if (path === '/account/keys') return html(res, 200, accountKeysPage(user.username, bg, device, admin))
      return html(res, 200, accountPage(user.username, user.email ?? '', Boolean(user.oidc_subject), runtime.current.oidc.onlySso, bg, device, admin, url.searchParams.get('oidc') === 'error'))
    }
    if (method === 'GET' && (path === '/admin' || path === '/admin/settings')) {
      const user = await sessionUser(req)
      if (!user) return redirect(res, '/login')
      if (user.role !== 'admin') return redirect(res, '/')
      if (path === '/admin/settings') return html(res, 200, adminSettingsPage(user.username, runtime.current.ui.backgroundUrl, user.device_username ?? ''))
      return html(res, 200, adminPage(user.username, runtime.current.ui.backgroundUrl, user.device_username ?? ''))
    }

    // ── device API (bearer) ─────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/v1/auth/refresh') {
      if (!ctx.anonLimiter.take('refresh:' + clientAddress(req, trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
      const input = REFRESH.parse(await body(req))
      return json(res, 200, await store.refresh(input.deviceId, input.refreshToken))
    }
    if (method === 'POST' && path === '/api/v1/devices/register') {
      const input = REGISTER.parse(await body(req))
      // A registration ticket is the only path; a web session must not mint tokens.
      const ticket = takeTicket(bearer(req))
      if (ticket) {
        await store.audit('device.registered', '(device-key)', ticket.userId, { deviceId: input.device.deviceId })
        return json(res, 200, await store.register(ticket.userId, input.device, ticket.keyId))
      }
      // Compatibility: an account token may enrol, except under SSO-only.
      const session = runtime.current.oidc.onlySso ? undefined : await sessionUser(req)
      if (!session) throw new ApiError('DEVICE_KEY_REQUIRED', 401)
      await store.audit('device.registered_from_account', session.username, session.id, { deviceId: input.device.deviceId })
      return json(res, 200, await store.register(session.id, input.device))
    }
    const ownDevice = /^\/api\/v1\/account\/devices\/([A-Za-z0-9._-]{1,64})$/.exec(path)
    if (ownDevice && (method === 'PATCH' || method === 'DELETE')) {
      const user = await requireUser(req)
      if (method === 'PATCH') {
        const input = await body(req)
        const name = String(input.name ?? '').trim().slice(0, 80)
        if (name.length < 1) throw new ApiError('INVALID_MESSAGE', 400, '设备名称不能为空')
        await store.renameDevice(user.id, ownDevice[1]!, name)
        await store.audit('device.renamed', user.username, user.id, { deviceId: ownDevice[1] })
        return json(res, 200, { status: 'renamed', name })
      }
      await store.revokeOwnDevice(user.id, ownDevice[1]!)
      await store.audit('device.removed', user.username, user.id, { deviceId: ownDevice[1] })
      return json(res, 200, { status: 'removed' })
    }
    // Owner-only: list, create, rotate or revoke; a live key can be echoed again.
    if (path === '/api/v1/account/device-keys' && (method === 'GET' || method === 'POST')) {
      const user = await requireUser(req)
      if (method === 'GET') return json(res, 200, { keys: await store.listDeviceKeys(user.id) })
      const input = await body(req)
      const key = await store.createDeviceKey(user.id, String(input.label ?? 'device'))
      await store.audit('device_key.created', user.username, user.id, { keyId: key.id })
      return json(res, 201, key)
    }
    const keyRotate = /^\/api\/v1\/account\/device-keys\/([0-9a-f-]{36})\/rotate$/.exec(path)
    if (method === 'POST' && keyRotate) {
      const user = await requireUser(req), rotated = await store.rotateDeviceKeyById(user.id, keyRotate[1]!)
      await store.audit('device_key.rotated', user.username, user.id, { keyId: rotated.id })
      return json(res, 200, { ...rotated, revealable: true })
    }
    const ownKey = /^\/api\/v1\/account\/device-keys\/([0-9a-f-]{36})$/.exec(path)
    if (method === 'DELETE' && ownKey) {
      const user = await requireUser(req)
      const owned = (await store.listDeviceKeys(user.id)).some(k => k.id === ownKey[1])
      if (!owned) throw new ApiError('DEVICE_KEY_NOT_FOUND', 404)
      const disconnected = await store.revokeDeviceKey(ownKey[1]!, user.id)
      await store.audit('device_key.revoked', user.username, user.id, { keyId: ownKey[1], disconnected })
      return json(res, 200, { status: 'revoked', disconnected })
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
        await store.audit('device.removed', owner?.username ?? target.deviceId, device.userId, { deviceId: target.deviceId, self: true })
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
        await store.audit('device.renamed', owner?.username ?? target.deviceId, device.userId, { deviceId: nameMatch[1], via: 'device' })
        return json(res, 200, { ...owned.descriptor, name, membershipId: membershipOf(device.userId) })
      }
      throw new ApiError('METHOD_NOT_FOUND', 404)
    }

    console.warn(JSON.stringify({ level: 'warn', event: 'route_not_found', method, path: path.slice(0, 120) }))
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
      if (req.headers['sec-fetch-dest'] === 'document') {
        const heading = code === 'METHOD_NOT_FOUND' ? '页面不存在' : code === 'AUTH_INVALID' ? '请重新登录' : '出错了'
        res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>' + heading + ' · DSH Remote</title>' +
          '<style>body{margin:0;font:16px/1.6 system-ui,sans-serif;background:#0b0f16;color:#e7eef8;display:grid;place-items:center;min-height:100vh}' +
          'main{max-width:34rem;padding:0 1.4rem}main a{color:#8fb0ff}</style>' +
          '<main><h1 style="font-size:22px;margin:0 0 8px">' + heading + '</h1><p style="color:#8b98ab;margin:0 0 16px">' + (error instanceof ApiError && error.detail ? error.detail : '请求未能完成') + '</p>' +
          '<p><a href="/">返回首页</a> · <a href="/login">重新登录</a></p></main>')
        return
      }
      json(res, status, { error: { code, message: error instanceof ApiError && error.detail ? error.detail : code, requestId: randomUUID(), retryable: status === 429 || status >= 500 } })
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
