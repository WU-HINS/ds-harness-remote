
import { newDb } from 'pg-mem'
import { createApp } from './build/app.js'
import { loadSettings } from './build/settings.js'

let pass = 0, fail = 0
const check = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? ' :: ' + extra : '')) }

const sent = []
const mailer = { async send(message) { sent.push(message) } }
const db = newDb({ autoCreateForeignKeyIndices: true })
const { Pool } = db.adapters.createPg()
const pool = new Pool()
const app = createApp(loadSettings({ DSH_SERVER_PUBLIC_URL: 'http://127.0.0.1:1', DSH_SERVER_PORT: '0', DSH_SERVER_HOST: '127.0.0.1', DSH_ANON_RATE_PER_MINUTE: '500' }), { pool, mailer })
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
const codeFor = (to) => { const m = [...sent].reverse().find(x => x.to === to); return m ? (m.text.match(/\d{6}/) || [])[0] : undefined }

const setup = await req('/api/v1/setup', { method: 'POST', ...json({ key: setupKey, username: 'admin', password: 'admin-password-123' }) })
check('1 setup', setup.status === 201)
const admin = cookieOf(setup)

check('2 register page renders', (await req('/register')).status === 200)
const badBg = await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ ui: { backgroundUrl: 'http://insecure.example/x.png' } }) })
check('2a background must be https', badBg.status === 400, String(badBg.status))
const goodBg = await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ ui: { backgroundUrl: 'https://cdn.example/bg.jpg' } }) })
const loginHtml = (await req('/login')).body
check('2b https background applied to login page', goodBg.status === 200 && String(loginHtml).includes('https://cdn.example/bg.jpg'))
check('3 forgot page renders', (await req('/forgot')).status === 200)

const startRes = await req('/api/v1/auth/register/start', { method: 'POST', ...json({ email: 'u1@example.com' }) })
check('4 register code sent', startRes.status === 202 && sent.length === 1 && sent[0].to === 'u1@example.com')
const code = codeFor('u1@example.com')
check('5 code is 6 digits', /^\d{6}$/.test(code || ''), String(code))

const wrong = await req('/api/v1/auth/register/complete', { method: 'POST', ...json({ email: 'u1@example.com', code: '000000', password: 'u1-password-123' }) })
check('6 wrong code rejected', wrong.status === 401, String(wrong.status))

const done = await req('/api/v1/auth/register/complete', { method: 'POST', ...json({ email: 'u1@example.com', code, password: 'u1-password-123' }) })
check('7 account created', done.status === 201 && done.body.email === 'u1@example.com')
check('8 session issued', (await req('/api/v1/auth/me', { headers: { cookie: cookieOf(done) } })).status === 200)

check('9 login by email', (await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'u1@example.com', password: 'u1-password-123' }) })).status === 200)
check('10 duplicate registration start stays silent', (await req('/api/v1/auth/register/start', { method: 'POST', ...json({ email: 'u1@example.com' }) })).status === 202)

const resetStart = await req('/api/v1/auth/password/reset/start', { method: 'POST', ...json({ email: 'u1@example.com' }) })
await new Promise(r => setTimeout(r, 1100))
check('11 reset code sent', resetStart.status === 202)
const resetCode = codeFor('u1@example.com')
const reset = await req('/api/v1/auth/password/reset/complete', { method: 'POST', ...json({ email: 'u1@example.com', code: resetCode, password: 'u1-password-456' }) })
check('12 password reset', reset.status === 200)
check('13 old password rejected', (await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'u1@example.com', password: 'u1-password-123' }) })).status === 401)
check('14 new password accepted', (await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'u1@example.com', password: 'u1-password-456' }) })).status === 200)

// onlySso 关闭注册与找回
const sso = await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ oidc: { enabled: true, onlySso: true, issuer: 'https://idp.example.com', clientId: 'cid' } }) })
check('15 onlySso enabled', sso.status === 200)
check('16 register closed under onlySso', (await req('/api/v1/auth/register/start', { method: 'POST', ...json({ email: 'x@example.com' }) })).status === 403)
check('17 reset closed under onlySso', (await req('/api/v1/auth/password/reset/start', { method: 'POST', ...json({ email: 'u1@example.com' }) })).status === 403)
check('18 password login closed under onlySso', (await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'u1@example.com', password: 'u1-password-456' }) })).status === 403)
check('19 register page shows closed state', (await req('/register')).body.includes('注册已关闭'))

await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ oidc: { onlySso: false } }) })
check('20 registration restored', (await req('/api/v1/auth/register/start', { method: 'POST', ...json({ email: 'u2@example.com' }) })).status === 202)

await app.close()

// 没有 SMTP 也没有注入 mailer 时，自助注册应关闭
const db2 = newDb({ autoCreateForeignKeyIndices: true })
const pool2 = db2.adapters.createPg().Pool
const app2 = createApp(loadSettings({ DSH_SERVER_PUBLIC_URL: 'http://127.0.0.1:1', DSH_SERVER_PORT: '0', DSH_SERVER_HOST: '127.0.0.1', DSH_ANON_RATE_PER_MINUTE: '500' }), { pool: new pool2() })
const started2 = await app2.start()
const res2 = await fetch('http://127.0.0.1:' + started2.port + '/api/v1/auth/register/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'z@example.com' }) })
check('21 registration disabled without SMTP', res2.status === 503, String(res2.status))
await app2.close()

console.log(String.fromCharCode(10) + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1

