
import { createServer } from 'node:http'
import { newDb } from 'pg-mem'
import { SignJWT, generateKeyPair, exportJWK } from 'jose'
import { createApp } from './build/app.js'
import { loadSettings } from './build/settings.js'

let pass = 0, fail = 0
const check = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? ' :: ' + extra : '')) }

const rsa = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(rsa.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
const codes = new Map()
let issuer = ''
const idp = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const send = (s, v) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)) }
  if (url.pathname === '/.well-known/openid-configuration') return send(200, { issuer, authorization_endpoint: issuer + '/a', token_endpoint: issuer + '/t', jwks_uri: issuer + '/j' })
  if (url.pathname === '/j') return send(200, { keys: [jwk] })
  if (url.pathname === '/t') {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', async () => {
      const entry = codes.get(new URLSearchParams(body).get('code') || '')
      if (!entry) return send(400, {})
      const idToken = await new SignJWT({ nonce: entry.nonce, email: entry.email, email_verified: true })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(issuer).setAudience('cid').setSubject(entry.sub)
        .setIssuedAt().setExpirationTime('5m').sign(rsa.privateKey)
      send(200, { id_token: idToken })
    })
    return
  }
  send(404, {})
})
await new Promise(r => idp.listen(0, '127.0.0.1', r))
issuer = 'http://127.0.0.1:' + idp.address().port

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
const codeTo = (to) => { const m = [...sent].reverse().find(x => x.to === to); return m ? (m.text.match(/\d{6}/) || [])[0] : undefined }

// 1. 初始化
const setup = await req('/api/v1/setup', { method: 'POST', ...json({ key: setupKey, username: 'admin', password: 'admin-password-123' }) })
check('1 setup', setup.status === 201)
const admin = cookieOf(setup)

// 2. 自助注册（邮箱验证码）
await req('/api/v1/auth/register/start', { method: 'POST', ...json({ email: 'a@example.com' }) })
const reg = await req('/api/v1/auth/register/complete', { method: 'POST', ...json({ email: 'a@example.com', code: codeTo('a@example.com'), password: 'first-password-123' }) })
check('2 registered with email code', reg.status === 201 && typeof reg.body.deviceKey === 'string')
let cookie = cookieOf(reg)

// 3. 登录
check('3 login', (await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'a@example.com', password: 'first-password-123' }) })).status === 200)

// 4. 后台绑定 OIDC（已登录态）
await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ oidc: { enabled: true, issuer, clientId: 'cid', clientSecret: 's' } }) })
const start = await req('/api/v1/auth/oidc/start', { headers: { cookie } })
const authUrl = new URL(start.headers.get('location'))
const state = authUrl.searchParams.get('state')
const code = 'c1'
codes.set(code, { nonce: authUrl.searchParams.get('nonce'), sub: 'sub-a', email: 'a@example.com' })
const bound = await req('/api/v1/auth/oidc/callback?code=' + code + '&state=' + state, { headers: { cookie: cookie + '; dsh_oidc_state=' + state } })
check('4 oidc bound from settings', bound.status === 302 && bound.headers.get('location') === '/admin?oidc=bound', bound.headers.get('location') || '')

// 5. 换绑邮箱（新旧双验证）
await req('/api/v1/auth/email/change/start', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ newEmail: 'b@example.com' }) })
const oldCode = codeTo('a@example.com')
const newCode = codeTo('b@example.com')
const changedEmail = await req('/api/v1/auth/email/change/complete', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ newEmail: 'b@example.com', oldCode, newCode }) })
check('5 email changed with both codes', changedEmail.status === 200)
cookie = cookieOf(changedEmail)

// 6. 找回密码（新邮箱）
await new Promise(r => setTimeout(r, 1100))
await req('/api/v1/auth/password/reset/start', { method: 'POST', ...json({ email: 'b@example.com' }) })
const reset = await req('/api/v1/auth/password/reset/complete', { method: 'POST', ...json({ email: 'b@example.com', code: codeTo('b@example.com'), password: 'second-password-123' }) })
check('6 password reset by emailed code', reset.status === 200)

// 7. 新凭据登录
check('7 login with new email and password', (await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'b@example.com', password: 'second-password-123' }) })).status === 200)
check('8 old password rejected', (await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'b@example.com', password: 'first-password-123' }) })).status === 401)

// 8. 设备用密码（onlySso 关）
const dev = await req('/api/v1/auth/device-login', { method: 'POST', ...json({ username: 'b@example.com', deviceKey: 'second-password-123', v: 1, device: { deviceId: 'journey-phone', name: 'phone', role: 'client', identityKey: 'j'.repeat(32) } }) })
check('9 password acts as device secret', dev.status === 200 && typeof dev.body.accessToken === 'string')

// 9. onlySso 后：密码设备登录拒绝，设备密钥仍可用
await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ oidc: { onlySso: true } }) })
check('10 password device login refused under onlySso', (await req('/api/v1/auth/device-login', { method: 'POST', ...json({ username: 'b@example.com', deviceKey: 'second-password-123', v: 1, device: { deviceId: 'x1-phone', name: 'x', role: 'client', identityKey: 'x'.repeat(32) } }) })).status === 401)
const users = await req('/api/v1/admin/users', { headers: { cookie: admin } })
const deviceUsername = users.body.users.find(u => u.username === 'a').deviceUsername
const byKey = await req('/api/v1/auth/device-login', { method: 'POST', ...json({ username: deviceUsername, deviceKey: reg.body.deviceKey, v: 1, device: { deviceId: 'x2-phone', name: 'x', role: 'client', identityKey: 'y'.repeat(32) } }) })
check('11 device key still works under onlySso', byKey.status === 200, String(byKey.status))

await app.close()
idp.close()
console.log(String.fromCharCode(10) + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1

