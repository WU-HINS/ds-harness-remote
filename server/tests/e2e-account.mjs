
import { newDb } from 'pg-mem'
import { createApp } from './build/app.js'
import { loadSettings } from './build/settings.js'

let pass = 0, fail = 0
const check = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? ' :: ' + extra : '')) }

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

const setup = await req('/api/v1/setup', { method: 'POST', ...json({ key: setupKey, username: 'admin@example.com', password: 'admin-password-123' }) })
const admin = cookieOf(setup)
await req('/api/v1/admin/users', { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin },
  body: JSON.stringify({ username: 'erin', password: 'erin-password-123', email: 'erin@example.com', role: 'user' }) })

const login = await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'erin@example.com', password: 'erin-password-123' }) })
check('1 email login', login.status === 200)
let cookie = cookieOf(login)

check('2 account page renders', (await req('/account', { headers: { cookie } })).status === 200)
check('3 wrong current password rejected', (await req('/api/v1/auth/password/change', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ currentPassword: 'nope', newPassword: 'erin-password-456' }) })).status === 401)
const changed = await req('/api/v1/auth/password/change', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ currentPassword: 'erin-password-123', newPassword: 'erin-password-456' }) })
check('4 password changed', changed.status === 200)
cookie = cookieOf(changed)
check('5 old password rejected', (await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'erin@example.com', password: 'erin-password-123' }) })).status === 401)
check('6 new password accepted', (await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'erin@example.com', password: 'erin-password-456' }) })).status === 200)

// 换绑邮箱：新旧双验证
const startChange = await req('/api/v1/auth/email/change/start', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ newEmail: 'erin2@example.com' }) })
check('7 change sends two codes', startChange.status === 202 && Boolean(codeTo('erin@example.com')) && Boolean(codeTo('erin2@example.com')))
const oldCode = codeTo('erin@example.com')
const newCode = codeTo('erin2@example.com')
const badChange = await req('/api/v1/auth/email/change/complete', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ newEmail: 'erin2@example.com', newCode, oldCode: '000000' }) })
check('8 wrong old code rejected', badChange.status === 401)
const done = await req('/api/v1/auth/email/change/complete', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ newEmail: 'erin2@example.com', newCode, oldCode }) })
check('9 email changed with both codes', done.status === 200)
check('10 login with new email', (await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'erin2@example.com', password: 'erin-password-456' }) })).status === 200)
check('11 old email no longer logs in', (await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'erin@example.com', password: 'erin-password-456' }) })).status === 401)

// 设备用登录密码（onlySso 关）
const devLogin = await req('/api/v1/auth/device-login', { method: 'POST', ...json({ username: 'erin2@example.com', deviceKey: 'erin-password-456', v: 1, device: { deviceId: 'erin-phone', name: 'phone', role: 'client', identityKey: 'p'.repeat(32) } }) })
check('12 password works as device secret when SSO optional', devLogin.status === 200 && typeof devLogin.body.accessToken === 'string')
check('13 device token works', (await req('/api/v1/me', { headers: { authorization: 'Bearer ' + devLogin.body.accessToken } })).status === 200)

// onlySso 开启后
await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ oidc: { enabled: true, issuer: 'https://idp.example.com', clientId: 'cid', onlySso: true } }) })
const changeUnderSso = await req('/api/v1/auth/password/change', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ currentPassword: 'erin-password-456', newPassword: 'erin-password-789' }) })
// Switching to SSO-only drops the user's password session, so 401 and 403 are both correct.
check('14 password change blocked under onlySso', [401, 403].includes(changeUnderSso.status), String(changeUnderSso.status))
const devSso = await req('/api/v1/auth/device-login', { method: 'POST', ...json({ username: 'erin2@example.com', deviceKey: 'erin-password-456', v: 1, device: { deviceId: 'erin-tablet', name: 'tablet', role: 'client', identityKey: 'q'.repeat(32) } }) })
check('15 password device login refused under onlySso', devSso.status === 401, String(devSso.status))

await app.close()
console.log(String.fromCharCode(10) + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1

