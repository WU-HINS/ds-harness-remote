
import { createServer } from 'node:http'
import { newDb } from 'pg-mem'
import { SignJWT, generateKeyPair, exportJWK } from 'jose'
import { createApp } from './build/app.js'
import { loadSettings } from './build/settings.js'

let pass = 0, fail = 0
const check = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? ' :: ' + extra : '')) }

// ── fake IdP ────────────────────────────────────────────────────────────────
const rsa = await generateKeyPair('RS256')
const ec = await generateKeyPair('ES256')
const rsaJwk = { ...(await exportJWK(rsa.publicKey)), kid: 'rsa1', alg: 'RS256', use: 'sig' }
const ecJwk = { ...(await exportJWK(ec.publicKey)), kid: 'ec1', alg: 'ES256', use: 'sig' }
const codes = new Map()
let issuer = ''
const idp = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)) }
  if (url.pathname === '/.well-known/openid-configuration') {
    return send(200, {
      issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token', jwks_uri: issuer + '/jwks',
    })
  }
  if (url.pathname === '/jwks') return send(200, { keys: [rsaJwk, ecJwk] })
  if (url.pathname === '/token') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      const params = new URLSearchParams(body)
      const entry = codes.get(params.get('code') || '')
      if (!entry) return send(400, { error: 'invalid_grant' })
      const key = entry.alg === 'ES256' ? ec : rsa
      const token = await new SignJWT({ nonce: entry.nonce, email: entry.email, email_verified: entry.emailVerified })
        .setProtectedHeader({ alg: entry.alg, kid: entry.alg === 'ES256' ? 'ec1' : 'rsa1' })
        .setIssuer(issuer).setAudience('cid').setSubject(entry.sub)
        .setIssuedAt().setExpirationTime('5m').sign(key.privateKey)
      send(200, { id_token: token })
    })
    return
  }
  send(404, {})
})
await new Promise(resolve => idp.listen(0, '127.0.0.1', resolve))
issuer = 'http://127.0.0.1:' + idp.address().port

// ── app ─────────────────────────────────────────────────────────────────────
const sent = []
const db = newDb({ autoCreateForeignKeyIndices: true })
const pool = db.adapters.createPg().Pool
const app = createApp(loadSettings({ DSH_SERVER_PUBLIC_URL: 'http://127.0.0.1:1', DSH_SERVER_PORT: '0', DSH_SERVER_HOST: '127.0.0.1', DSH_ANON_RATE_PER_MINUTE: '500' }), {
  pool: new pool(), mailer: { async send(m) { sent.push(m) } },
})
const { port, setupKey } = await app.start()
const base = 'http://127.0.0.1:' + port
const req = async (path, init = {}) => {
  const r = await fetch(base + path, { redirect: 'manual', ...init })
  const text = await r.text()
  let body; try { body = JSON.parse(text) } catch { body = text }
  return { status: r.status, body, headers: r.headers }
}
const json = (v) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) })
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0]

const setup = await req('/api/v1/setup', { method: 'POST', ...json({ key: setupKey, username: 'admin', password: 'admin-password-123' }) })
const admin = cookieOf(setup)
await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin },
  body: JSON.stringify({ oidc: { enabled: true, issuer, clientId: 'cid', clientSecret: 'sekret' } }) })

async function oidcFlow(entry) {
  const start = await req('/api/v1/auth/oidc/start')
  const location = new URL(start.headers.get('location'))
  const state = location.searchParams.get('state')
  const nonce = location.searchParams.get('nonce')
  const code = 'c-' + Math.random().toString(36).slice(2)
  codes.set(code, { ...entry, nonce })
  const cookie = cookieOf(start)
  return req('/api/v1/auth/oidc/callback?code=' + code + '&state=' + encodeURIComponent(state), { headers: { cookie } })
}

// A: 未注册邮箱 → 直接建号并登录（RS256）
const a = await oidcFlow({ sub: 'sub-a', email: 'a@example.com', emailVerified: true, alg: 'RS256' })
check('1 A: unknown mailbox is provisioned', a.status === 302 && a.headers.get('location') === '/' && /dsh_session=/.test(a.headers.get('set-cookie') || ''))
check('2 A: idempotent second login', (await oidcFlow({ sub: 'sub-a', email: 'a@example.com', emailVerified: true, alg: 'ES256' })).status === 302)

// D: 邮箱已绑到另一个 sub → 409 语义
const d = await oidcFlow({ sub: 'sub-other', email: 'a@example.com', emailVerified: true, alg: 'RS256' })
check('3 D: different sub for same mailbox rejected', d.headers.get('location') === '/login?error=oidc-conflict', d.headers.get('location'))

// 已注册未绑定（管理员建号）→ 分支 B 校验页
const bob = await req('/api/v1/admin/users', { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin },
  body: JSON.stringify({ username: 'bob', password: 'bob-password-123', email: 'bob@example.com' }) })
check('4 admin created account', bob.status === 201)
const b = await oidcFlow({ sub: 'sub-bob', email: 'bob@example.com', emailVerified: true, alg: 'ES256' })
const ticket = b.headers.get('location') && new URL(b.headers.get('location'), base).searchParams.get('ticket')
check('5 B: known mailbox requires verification', b.status === 302 && /\/auth\/oidc\/bind\?ticket=/.test(b.headers.get('location') || ''), b.headers.get('location') || '')

const bindPage = await req('/auth/oidc/bind?ticket=' + encodeURIComponent(ticket))
check('6 bind page renders', bindPage.status === 200 && String(bindPage.body).includes('绑定已有账户'))
const wrongPw = await req('/api/v1/auth/oidc/bind/complete', { method: 'POST', ...json({ ticket, mode: 'password', password: 'nope' }) })
check('7 wrong password rejected', wrongPw.status === 401)
const bound = await req('/api/v1/auth/oidc/bind/complete', { method: 'POST', ...json({ ticket, mode: 'password', password: 'bob-password-123' }) })
check('8 bind with password succeeds', bound.status === 200)
check('9 bound session works', (await req('/api/v1/auth/me', { headers: { cookie: cookieOf(bound) } })).status === 200)

// 关闭二次校验 → 直接绑定
await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ oidc: { bindRequireVerification: false } }) })
const carol = await req('/api/v1/admin/users', { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin },
  body: JSON.stringify({ username: 'carol', password: 'carol-password-123', email: 'carol@example.com' }) })
const c = await oidcFlow({ sub: 'sub-carol', email: 'carol@example.com', emailVerified: true, alg: 'RS256' })
check('10 bindRequireVerification=false binds directly', c.headers.get('location') === '/', c.headers.get('location'))

// 未验证邮箱 / 关闭自动开通
const uv = await oidcFlow({ sub: 'sub-x', email: 'x@example.com', emailVerified: false, alg: 'RS256' })
check('11 unverified email rejected', uv.headers.get('location') === '/login?error=oidc-email', uv.headers.get('location'))
await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ oidc: { autoProvision: false } }) })
const na = await oidcFlow({ sub: 'sub-y', email: 'y@example.com', emailVerified: true, alg: 'ES256' })
check('12 autoProvision=false refuses new mailbox', na.headers.get('location') === '/login?error=oidc-no-account', na.headers.get('location'))

// onlySso：禁止解绑、绑定只能用验证码
await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ oidc: { onlySso: true, autoProvision: true, bindRequireVerification: true } }) })
const unbindUnder = await req('/api/v1/auth/oidc/unbind', { method: 'POST', headers: { cookie: cookieOf(bound) } })
check('13 unbind blocked under onlySso', [401, 403].includes(unbindUnder.status), String(unbindUnder.status))

await new Promise(r => setTimeout(r, 1100))
const dave = await req('/api/v1/admin/users', { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin },
  body: JSON.stringify({ username: 'dave', password: 'dave-password-123', email: 'dave@example.com' }) })
const d2 = await oidcFlow({ sub: 'sub-dave', email: 'dave@example.com', emailVerified: true, alg: 'RS256' })
const ticket2 = new URL(d2.headers.get('location'), base).searchParams.get('ticket')
const pwUnderSso = await req('/api/v1/auth/oidc/bind/complete', { method: 'POST', ...json({ ticket: ticket2, mode: 'password', password: 'dave-password-123' }) })
check('14 password binding blocked under onlySso', pwUnderSso.status === 403)
await req('/api/v1/auth/oidc/bind/start', { method: 'POST', ...json({ ticket: ticket2 }) })
const code = (sent[sent.length - 1].text.match(/\d{6}/) || [])[0]
const codeBind = await req('/api/v1/auth/oidc/bind/complete', { method: 'POST', ...json({ ticket: ticket2, mode: 'code', code }) })
check('15 code binding works under onlySso', codeBind.status === 200, String(codeBind.status))

await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ oidc: { onlySso: false } }) })
const relogin = await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'bob@example.com', password: 'bob-password-123' }) })
const unbindAfter = await req('/api/v1/auth/oidc/unbind', { method: 'POST', headers: { cookie: cookieOf(relogin) } })
check('16 unbind allowed again', unbindAfter.status === 200, String(unbindAfter.status))

await app.close()
idp.close()
console.log(String.fromCharCode(10) + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1

