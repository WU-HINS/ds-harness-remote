import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Mailer } from '../mailer.js'
import { ApiError, type Store, type UserRow } from '../store-pg.js'
import type { Runtime } from '../runtime.js'
import type { Gateway } from '../gateway.js'

/** Everything the admin API needs; the route predicates stay in app.ts. */
export interface AdminApiDeps {
  store: Store
  runtime: Runtime
  gateway: Gateway
  requireAdmin: (req: IncomingMessage) => Promise<UserRow>
  body: (req: IncomingMessage) => Promise<Record<string, unknown>>
  json: (res: ServerResponse, status: number, value: unknown) => void
  readCookie: (req: IncomingMessage, name: string) => string
  mailer: () => Mailer | undefined
  membershipOf: (userId: string) => string
  syncTrustedProxies: () => void
  userLimiter: { setLimit(limit: number): void }
  anonLimiter: { setLimit(limit: number): void }
}

/**
 * Admin API handlers. Called only after app.ts has matched the path prefix;
 * an unmatched admin path still ends in METHOD_NOT_FOUND, never a silent 200.
 */
export async function handleAdminApi(
  req: IncomingMessage, res: ServerResponse, url: URL, path: string, method: string, deps: AdminApiDeps,
): Promise<void> {
  const admin = await deps.requireAdmin(req)
  if (method === 'GET' && path === '/api/v1/admin/settings') return deps.json(res, 200, deps.runtime.redacted())
  if (method === 'PUT' && path === '/api/v1/admin/settings') {
    const input = await deps.body(req) as Record<string, any>
    const patch: Record<string, any> = {}
    if (input.oidc && typeof input.oidc === 'object') {
      const o = input.oidc as Record<string, unknown>
      const has = (key: string) => Object.prototype.hasOwnProperty.call(o, key)
      const current = deps.runtime.current.oidc
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
      const current = deps.runtime.limits
      const pick = (key: keyof typeof current) => {
        if (!Object.prototype.hasOwnProperty.call(l, key)) return current[key]
        const value = Number((l as Record<string, unknown>)[key])
        // Refuse nonsense instead of quietly keeping the previous value: a
        // silent fallback looks like a successful save.
        if (!Number.isFinite(value)) throw new ApiError('INVALID_SETTINGS', 400, '限额必须是数字')
        return value
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
      const current = deps.runtime.current.ice
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
      const cur = deps.runtime.current.smtp
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
    const wasOnlySso = deps.runtime.current.oidc.onlySso
    try { await deps.runtime.update(patch) } catch (error) { throw new ApiError('INVALID_SETTINGS', 400, error instanceof Error ? error.message : '设置不合法') }
    if (!wasOnlySso && deps.runtime.current.oidc.onlySso) {
      // Existing password sessions must not outlive the switch, except the
      // operator's own session (otherwise nobody can turn it back off).
      await deps.store.clearOtherSessions(deps.readCookie(req, 'dsh_session'))
    }
    deps.userLimiter.setLimit(deps.runtime.limits.userRatePerMinute)
    deps.anonLimiter.setLimit(deps.runtime.limits.anonRatePerMinute)
    deps.store.connectionLimit = deps.runtime.limits.userConnectionLimit
    deps.syncTrustedProxies()
    await deps.store.audit('settings.updated', admin.username, admin.id)
    return deps.json(res, 200, deps.runtime.redacted())
  }
  if (method === 'GET' && path === '/api/v1/admin/devices') {
    const items = await deps.store.listAllDevices()
    return deps.json(res, 200, { items: items.map(d => ({
      ...d.descriptor, userId: d.userId, username: d.username, revoked: d.revoked,
      membershipId: deps.membershipOf(d.userId), online: deps.gateway.peers.has(d.descriptor.deviceId), lastSeenAt: d.lastSeenAt,
    })) })
  }
  const adminDevice = /^\/api\/v1\/admin\/devices\/([^/]+)$/.exec(path)
  if (method === 'DELETE' && adminDevice) {
    await deps.store.revoke(adminDevice[1]!).catch(() => { throw new ApiError('DEVICE_NOT_FOUND', 404) })
    await deps.store.audit('device.revoked_by_admin', admin.username, undefined, { deviceId: adminDevice[1] })
    return deps.json(res, 200, { status: 'revoked' })
  }
  if (method === 'POST' && path === '/api/v1/admin/smtp/test') {
    const sender = deps.mailer()
    if (!sender) throw new ApiError('SMTP_NOT_CONFIGURED', 503)
    const input = await deps.body(req)
    const to = String(input.to ?? '').trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new ApiError('INVALID_EMAIL', 400)
    try { await sender.send({ to, subject: 'DSH Remote 测试邮件', text: '如果你收到这封邮件，SMTP 配置可用。' }) }
    catch { throw new ApiError('SMTP_SEND_FAILED', 502) }
    return deps.json(res, 200, { status: 'sent' })
  }
  if (method === 'GET' && path === '/api/v1/admin/audit') {
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50))
    return deps.json(res, 200, { items: await deps.store.listAudit(limit) })
  }
  if (method === 'GET' && path === '/api/v1/admin/users') {
    const users = await deps.store.listUsers()
    const keys = await Promise.all(users.map(async u => (await deps.store.listDeviceKeys(u.id)).filter(k => !k.revoked).length))
    return deps.json(res, 200, { users: users.map((u, i) => ({
      id: u.id, username: u.username, deviceUsername: u.device_username, role: u.role,
      disabled: u.disabled, oidc: Boolean(u.oidc_subject), deviceKeys: keys[i], createdAt: u.created_at,
    })) })
  }
  if (method === 'POST' && path === '/api/v1/admin/users') {
    const input = await deps.body(req)
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
    const created = await deps.store.createUser({ username, role, ...(password ? { password } : {}), ...(email ? { email, emailVerified: true } : {}) }).catch((error: any) => {
      throw new ApiError(String(error?.code) === '23505' ? 'USER_EXISTS' : 'INVALID_MESSAGE', 409, String(error?.code) === '23505' ? '该邮箱或用户名已被使用' : '账号格式不正确')
    })
    await deps.store.audit('user.created', admin.username, created.user.id, { role })
    // The first device key belongs to the user; administrators never see it.
    return deps.json(res, 201, { user: { id: created.user.id, username, role } })
  }
  const match = /^\/api\/v1\/admin\/users\/([0-9a-f-]{36})(\/device-key)?$/.exec(path)
  if (match) {
    const id = match[1]!
    if (method === 'PATCH' && !match[2]) {
      const input = await deps.body(req)
      const target = await deps.store.findUserById(id)
      if (!target) throw new ApiError('USER_NOT_FOUND', 404)
      // Administrators are immutable from the console: no disable, no password
      // reset, no role change. Only their own credentials changes apply.
      if (target.role === 'admin') throw new ApiError('ADMIN_PROTECTED', 409, '管理员账号不可禁用或删除')
      if (input.toggle === true) {
        await deps.store.setDisabled(id, !target.disabled)
        await deps.store.audit('user.updated', admin.username, id, { disabled: !target.disabled })
      }
      return deps.json(res, 200, { status: 'ok' })
    }
    if (method === 'DELETE' && !match[2]) {
      if (id === admin.id) throw new ApiError('CANNOT_DELETE_SELF', 409)
      const target = await deps.store.findUserById(id)
      if (!target) throw new ApiError('USER_NOT_FOUND', 404)
      if (target.role === 'admin') throw new ApiError('ADMIN_PROTECTED', 409, '管理员账号不可禁用或删除')
      await deps.store.deleteUser(id)
      await deps.store.audit('user.deleted', admin.username, id)
      return deps.json(res, 200, { status: 'deleted' })
    }
  }
  throw new ApiError('METHOD_NOT_FOUND', 404)
}
