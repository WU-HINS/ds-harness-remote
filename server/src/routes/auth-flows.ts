import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { bindPage } from '../pages.js'
import { ApiError, type Store, type UserRow } from '../store-pg.js'
import type { Runtime } from '../runtime.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
type OidcClaims = { issuer: string; subject: string; email?: string; emailVerified: boolean; name?: string }

/** Everything the account-credential and OIDC flows need from app.ts. */
export interface AuthFlowDeps {
  store: Store
  runtime: Runtime
  anonLimiter: { take(key: string): boolean }
  body: (req: IncomingMessage) => Promise<Record<string, unknown>>
  json: (res: ServerResponse, status: number, value: unknown) => void
  html: (res: ServerResponse, status: number, value: string) => void
  redirect: (res: ServerResponse, location: string, headers?: Record<string, string>) => void
  readCookie: (req: IncomingMessage, name: string) => string
  sessionUser: (req: IncomingMessage) => Promise<UserRow | undefined>
  requireUser: (req: IncomingMessage) => Promise<UserRow>
  cookie: (name: string, value: string, ageMs: number, secure: boolean) => string
  isForm: (req: IncomingMessage) => boolean
  mailer: () => { send(message: { to: string; subject: string; text: string }): Promise<void> } | undefined
  sendCode: (email: string, purpose: string, subject: string) => Promise<void>
  verifyPasswordAsync: (password: string, stored: string | null) => Promise<boolean>
  clientAddress: (req: IncomingMessage, trusted: ReadonlySet<string>) => string
  trustedProxies: ReadonlySet<string>
  finishOidc: (res: ServerResponse, user: { id: string; username: string }, origin: string) => void | Promise<void>
  oidcPending: Map<string, { claims: OidcClaims; userId: string; expires: number }>
}

/**
 * Self-registration, password reset/change, e-mail change and the OIDC flows.
 * app.ts decides which paths belong here; anything unmatched is still a 404.
 */
export async function handleAuthFlows(
  req: IncomingMessage, res: ServerResponse, url: URL, path: string, method: string,
  secure: boolean, origin: string, deps: AuthFlowDeps,
): Promise<void> {
  const isCallback = method === 'GET' && path === '/api/v1/auth/oidc/callback'
  if (method === 'POST' && path === '/api/v1/auth/register/start') {
    if (deps.runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
    if (!deps.mailer()) throw new ApiError('SMTP_NOT_CONFIGURED', 503)
    if (!deps.anonLimiter.take('reg:' + deps.clientAddress(req, deps.trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
    const input = await deps.body(req)
    const email = String(input.email ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) throw new ApiError('INVALID_EMAIL', 400)
    // Always answer 202: whether an address exists is not disclosed here.
    if (!(await deps.store.findUserByEmail(email))) {
      await deps.sendCode(email, 'register', 'DSH Remote 注册验证码').catch(() => undefined)
    }
    return deps.json(res, 202, { status: 'sent' })
  }
  if (method === 'POST' && path === '/api/v1/auth/register/complete') {
    if (deps.runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
    if (!deps.anonLimiter.take('regc:' + deps.clientAddress(req, deps.trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
    const input = await deps.body(req)
    const email = String(input.email ?? '').trim().toLowerCase()
    const code = String(input.code ?? '')
    const password = String(input.password ?? '')
    if (!EMAIL_RE.test(email) || password.length < 12 || !/^\d{6}$/.test(code)) throw new ApiError('INVALID_MESSAGE', 400)
    if (!(await deps.store.consumeEmailCode(email, 'register', code))) {
      await deps.store.audit('auth.code_failure', email, undefined, { purpose: 'register' })
      throw new ApiError('CODE_INVALID', 401)
    }
    if (await deps.store.findUserByEmail(email)) throw new ApiError('EMAIL_TAKEN', 409)
    const { user, deviceKey } = await deps.store.createUser({
      username: email.split('@')[0]!.slice(0, 64), email, emailVerified: true, password, role: 'user',
    }).catch(() => { throw new ApiError('EMAIL_TAKEN', 409) })
    await deps.store.audit('account.registered', email, user.id)
    const session = await deps.store.createSession(user.id, deps.runtime.limits.sessionTtlMs)
    res.setHeader('Set-Cookie', deps.cookie('dsh_session', session.token, deps.runtime.limits.sessionTtlMs, secure))
    if (deps.isForm(req)) return deps.redirect(res, '/')
    return deps.json(res, 201, { account: user.username, email: user.email, token: session.token, expiresAt: session.expiresAt, deviceKey })
  }
  if (method === 'POST' && path === '/api/v1/auth/password/reset/start') {
    if (deps.runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
    if (!deps.mailer()) throw new ApiError('SMTP_NOT_CONFIGURED', 503)
    if (!deps.anonLimiter.take('reset:' + deps.clientAddress(req, deps.trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
    const input = await deps.body(req)
    const email = String(input.email ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) throw new ApiError('INVALID_EMAIL', 400)
    if (await deps.store.findUserByEmail(email)) {
      await deps.sendCode(email, 'reset', 'DSH Remote 重置密码验证码').catch(() => undefined)
    }
    return deps.json(res, 202, { status: 'sent' })
  }
  if (method === 'POST' && path === '/api/v1/auth/password/reset/complete') {
    if (deps.runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
    if (!deps.anonLimiter.take('rspc:' + deps.clientAddress(req, deps.trustedProxies))) throw new ApiError('RATE_LIMITED', 429)
    const input = await deps.body(req)
    const email = String(input.email ?? '').trim().toLowerCase()
    const code = String(input.code ?? '')
    const password = String(input.password ?? '')
    if (!EMAIL_RE.test(email) || password.length < 12 || !/^\d{6}$/.test(code)) throw new ApiError('INVALID_MESSAGE', 400)
    const user = await deps.store.findUserByEmail(email)
    if (!user) throw new ApiError('CODE_INVALID', 401)
    if (!(await deps.store.consumeEmailCode(email, 'reset', code))) {
      await deps.store.audit('auth.code_failure', email, undefined, { purpose: 'reset' })
      throw new ApiError('CODE_INVALID', 401)
    }
    await deps.store.setPassword(user.id, password, { revokeAllDevices: true })
    await deps.store.audit('password.reset', email, user.id)
    if (deps.isForm(req)) return deps.redirect(res, '/login?reset=1')
    return deps.json(res, 200, { status: 'reset' })
  }

  if (method === 'POST' && path === '/api/v1/auth/password/change') {
    const user = await deps.requireUser(req)
    if (deps.runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
    const input = await deps.body(req)
    const currentPassword = String(input.currentPassword ?? '')
    const nextPassword = String(input.newPassword ?? '')
    if (nextPassword.length < 12) throw new ApiError('INVALID_MESSAGE', 400)
    if (!(await deps.verifyPasswordAsync(currentPassword, user.password_hash))) throw new ApiError('PASSWORD_INVALID', 401, '当前密码不正确')
    await deps.store.setPassword(user.id, nextPassword)
    await deps.store.audit('password.changed', user.username, user.id)
    const session = await deps.store.createSession(user.id, deps.runtime.limits.sessionTtlMs)
    res.setHeader('Set-Cookie', deps.cookie('dsh_session', session.token, deps.runtime.limits.sessionTtlMs, secure))
    return deps.json(res, 200, { status: 'changed' })
  }
  if (method === 'POST' && path === '/api/v1/auth/email/change/start') {
    const user = await deps.requireUser(req)
    if (!deps.mailer()) throw new ApiError('SMTP_NOT_CONFIGURED', 503)
    const input = await deps.body(req)
    const nextEmail = String(input.newEmail ?? '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) throw new ApiError('INVALID_EMAIL', 400)
    if (nextEmail === (user.email ?? '')) throw new ApiError('INVALID_MESSAGE', 400)
    if (user.email) {
      const oldCode = await deps.store.issueEmailCode(user.email, 'email-change-old')
      await deps.mailer()!.send({ to: user.email, subject: 'DSH Remote 换绑确认', text: '原邮箱验证码：' + oldCode + '（10 分钟内有效）' })
    }
    const newCode = await deps.store.issueEmailCode(nextEmail, 'email-change-new')
    await deps.mailer()!.send({ to: nextEmail, subject: 'DSH Remote 换绑确认', text: '新邮箱验证码：' + newCode + '（10 分钟内有效）' })
    await deps.store.audit('email.change_started', user.username, user.id, { from: user.email ?? '', to: nextEmail })
    return deps.json(res, 202, { status: 'sent', requiresOld: Boolean(user.email) })
  }
  if (method === 'POST' && path === '/api/v1/auth/email/change/complete') {
    const user = await deps.requireUser(req)
    const input = await deps.body(req)
    const nextEmail = String(input.newEmail ?? '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) throw new ApiError('INVALID_EMAIL', 400)
    if (await deps.store.findUserByEmail(nextEmail)) throw new ApiError('EMAIL_TAKEN', 409)
    // Verify both before consuming either: one wrong input must not burn the other code.
    if (user.email) {
      const oldCode = String(input.oldCode ?? '')
      if (!(await deps.store.checkEmailCode(user.email, 'email-change-old', oldCode))) {
        await deps.store.audit('auth.code_failure', user.username, user.id, { purpose: 'email-change-old' })
        throw new ApiError('CODE_INVALID', 401)
      }
    }
    const newCode = String(input.newCode ?? '')
    if (!(await deps.store.checkEmailCode(nextEmail, 'email-change-new', newCode))) {
      await deps.store.audit('auth.code_failure', user.username, user.id, { purpose: 'email-change-new' })
      throw new ApiError('CODE_INVALID', 401)
    }
    if (user.email) await deps.store.markEmailCodeConsumed(user.email, 'email-change-old')
    await deps.store.markEmailCodeConsumed(nextEmail, 'email-change-new')
    const previousEmail = user.email ?? ''
    await deps.store.setEmail(user.id, nextEmail, true)
    // Accounts whose login name *is* their email (e.g. the bootstrap admin)
    // must follow the change, otherwise the old address keeps working.
    if (previousEmail && user.username === previousEmail) await deps.store.setUsername(user.id, nextEmail).catch(() => { throw new ApiError('EMAIL_TAKEN', 409) })
    await deps.store.audit('email.changed', user.username, user.id, { from: previousEmail, to: nextEmail })
    const session = await deps.store.createSession(user.id, deps.runtime.limits.sessionTtlMs)
    res.setHeader('Set-Cookie', deps.cookie('dsh_session', session.token, deps.runtime.limits.sessionTtlMs, secure))
    return deps.json(res, 200, { status: 'changed', email: nextEmail })
  }

  // ── OIDC ────────────────────────────────────────────────────────────────
  const oidc = deps.runtime.oidcClient(origin)
  if (method === 'GET' && path === '/api/v1/auth/oidc/start') {
    // A browser navigation, never JSON: send the reader back to a page.
    if (!oidc) {
      const current = await deps.sessionUser(req)
      return deps.redirect(res, current ? '/account?oidc=error' : '/login?error=oidc-unavailable')
    }
    const { url: target, state } = await oidc.authorizationUrl()
    res.setHeader('Set-Cookie', 'dsh_oidc_state=' + state + '; Path=/api/v1/auth/oidc; HttpOnly; SameSite=Lax; Max-Age=600' + (secure ? '; Secure' : ''))
    return deps.redirect(res, target)
  }
  if (oidc && isCallback) {
    const code = url.searchParams.get('code') ?? ''
    const state = url.searchParams.get('state') ?? ''
    if (!code || !state) return deps.redirect(res, '/login?error=oidc')
    if (deps.readCookie(req, 'dsh_oidc_state') !== state) return deps.redirect(res, '/login?error=oidc')
    let claims: { issuer: string; subject: string; email?: string; emailVerified: boolean; name?: string }
    try { claims = await oidc.complete(code, state) } catch (error) {
      await deps.store.audit('oidc.failure', undefined, undefined, { code: (error as ApiError).code })
      return deps.redirect(res, '/login?error=oidc')
    }

    // Binding started from the signed-in settings page: attach to that user.
    const current = await deps.sessionUser(req)
    if (current) {
      if (current.oidc_subject) return deps.redirect(res, '/admin?oidc=already-bound')
      if (current.email && claims.email && current.email !== claims.email) return deps.redirect(res, '/admin?oidc=email-mismatch')
      await deps.store.linkOidc(current.id, claims.issuer, claims.subject)
      await deps.store.audit('oidc.bound', current.username, current.id)
      return deps.redirect(res, current.role === 'admin' ? '/admin?oidc=bound' : '/account?oidc=bound')
    }

    const bySub = await deps.store.findUserByOidc(claims.issuer, claims.subject)
    if (bySub) return deps.finishOidc(res, bySub, origin)

    if (!claims.email || !claims.emailVerified) {
      await deps.store.audit('oidc.rejected', undefined, undefined, { reason: 'email-unverified' })
      return deps.redirect(res, '/login?error=oidc-email')
    }
    const byEmail = await deps.store.findUserByEmail(claims.email)
    if (!byEmail) {
      // Branch A: unknown mailbox → create and bind in one step.
      if (!deps.runtime.current.oidc.autoProvision) return deps.redirect(res, '/login?error=oidc-no-account')
      const created = await deps.store.createUser({
        username: claims.email.split('@')[0]!.slice(0, 64) || 'user',
        email: claims.email, emailVerified: true, role: 'user',
      }).catch(async () => {
        // Concurrent first login for the same mailbox: fall back to that row.
        const existing = await deps.store.findUserByEmail(claims.email!)
        return existing ? { user: existing, deviceKey: '' } : undefined
      })
      if (!created) return deps.redirect(res, '/login?error=oidc')
      await deps.store.linkOidc(created.user.id, claims.issuer, claims.subject)
      await deps.store.audit('oidc.provisioned', claims.email, created.user.id)
      const fresh = await deps.store.findUserById(created.user.id)
      return fresh ? deps.finishOidc(res, fresh, origin) : deps.redirect(res, '/login?error=oidc')
    }

    // Branch D: mailbox already bound to a different subject.
    if (byEmail.oidc_subject && (byEmail.oidc_subject !== claims.subject || byEmail.oidc_issuer !== claims.issuer)) {
      await deps.store.audit('oidc.conflict', byEmail.username, byEmail.id)
      return deps.redirect(res, '/login?error=oidc-conflict')
    }
    // Branch B: known mailbox, unbound. Verification unless disabled.
    if (!deps.runtime.current.oidc.bindRequireVerification) {
      await deps.store.linkOidc(byEmail.id, claims.issuer, claims.subject)
      await deps.store.audit('oidc.auto_bound', byEmail.username, byEmail.id)
      return deps.finishOidc(res, byEmail, origin)
    }
    const ticket = randomUUID() + '.' + randomUUID()
    deps.oidcPending.set(ticket, { claims, userId: byEmail.id, expires: Date.now() + 900_000 })
    for (const [key, value] of deps.oidcPending) if (value.expires < Date.now()) deps.oidcPending.delete(key)
    return deps.redirect(res, '/auth/oidc/bind?ticket=' + encodeURIComponent(ticket))
  }

  if (method === 'GET' && path === '/auth/oidc/bind') {
    const ticket = url.searchParams.get('ticket') ?? ''
    const pending = deps.oidcPending.get(ticket)
    if (!pending || pending.expires < Date.now()) return deps.redirect(res, '/login?error=oidc-expired')
    return deps.html(res, 200, bindPage(pending.claims.email ?? '', deps.runtime.current.oidc.onlySso, deps.runtime.current.ui.backgroundUrl))
  }
  if (method === 'POST' && path === '/api/v1/auth/oidc/bind/complete') {
    const input = await deps.body(req)
    const ticket = String(input.ticket ?? '')
    const pending = deps.oidcPending.get(ticket)
    if (!pending || pending.expires < Date.now()) throw new ApiError('OIDC_EXPIRED', 401)
    const user = await deps.store.findUserById(pending.userId)
    if (!user || user.disabled) throw new ApiError('OIDC_EXPIRED', 401)
    if (user.oidc_subject) throw new ApiError('OIDC_ALREADY_BOUND', 409)
    const mode = String(input.mode ?? 'password')
    if (mode === 'code') {
      const code = String(input.code ?? '')
      if (!/^\d{6}$/.test(code)) throw new ApiError('INVALID_MESSAGE', 400)
      if (!(await deps.store.consumeEmailCode(pending.claims.email!, 'oidc-bind', code))) throw new ApiError('CODE_INVALID', 401)
    } else {
      if (deps.runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
      const password = String(input.password ?? '')
      if (!(await deps.verifyPasswordAsync(password, user.password_hash))) throw new ApiError('AUTH_INVALID', 401)
    }
    deps.oidcPending.delete(ticket)
    await deps.store.linkOidc(user.id, pending.claims.issuer, pending.claims.subject)
    await deps.store.audit('oidc.bound', user.username, user.id)
    const session = await deps.store.createSession(user.id, deps.runtime.limits.sessionTtlMs)
    res.setHeader('Set-Cookie', deps.cookie('dsh_session', session.token, deps.runtime.limits.sessionTtlMs, secure))
    return deps.json(res, 200, { status: 'bound' })
  }
  if (method === 'POST' && path === '/api/v1/auth/oidc/bind/start') {
    const input = await deps.body(req)
    const ticket = String(input.ticket ?? '')
    const pending = deps.oidcPending.get(ticket)
    if (!pending || pending.expires < Date.now()) throw new ApiError('OIDC_EXPIRED', 401)
    if (!deps.mailer()) throw new ApiError('SMTP_NOT_CONFIGURED', 503)
    const code = await deps.store.issueEmailCode(pending.claims.email!, 'oidc-bind')
    await deps.mailer()!.send({ to: pending.claims.email!, subject: 'DSH Remote 绑定验证码', text: '验证码：' + code + '（10 分钟内有效）' })
    return deps.json(res, 202, { status: 'sent' })
  }
  if (method === 'POST' && path === '/api/v1/auth/oidc/unbind') {
    const user = await deps.requireUser(req)
    if (deps.runtime.current.oidc.onlySso) throw new ApiError('SSO_ONLY', 403)
    await deps.store.unlinkOidc(user.id)
    await deps.store.audit('oidc.unbound', user.username, user.id)
    return deps.json(res, 200, { status: 'unbound' })
  }

  throw new ApiError('METHOD_NOT_FOUND', 404)
}
