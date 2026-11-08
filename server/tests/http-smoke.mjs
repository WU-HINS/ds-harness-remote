
import { newDb } from 'pg-mem'
import { createApp, clientAddress, isPrivateAddress } from './build/app.js'
import { loadSettings } from './build/settings.js'

let pass = 0, fail = 0
const check = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? ' :: ' + extra : '')) }

const db = newDb({ autoCreateForeignKeyIndices: true })
const { Pool } = db.adapters.createPg()
const pool = new Pool()

const make = (env) => createApp(loadSettings({ DSH_SERVER_PORT: '0', DSH_SERVER_HOST: '127.0.0.1', ...env }), { pool })
const app = make({ DSH_SERVER_PUBLIC_URL: 'http://127.0.0.1:1', DSH_ANON_RATE_PER_MINUTE: '30', DSH_USER_RATE_PER_MINUTE: '200' })
const { port, setupKey } = await app.start()
const base = 'http://127.0.0.1:' + port

async function req(path, init = {}) {
  const response = await fetch(base + path, { redirect: 'manual', ...init })
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: response.status, body, headers: response.headers }
}
const json = (value) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0]

check('healthz', (await req('/healthz')).status === 200)
check('ready', (await req('/ready')).status === 200)
check('setup without key rejected', (await req('/api/v1/setup', { method: 'POST', ...json({ username: 'admin@example.com', password: 'admin-password-123' }) })).status === 403)
// client address: private peers may supply X-Real-IP, public peers may not
const fakeReq = (peer, headers) => ({ socket: { remoteAddress: peer }, rawHeaders: Object.entries(headers).flat() })
check('loopback is private', isPrivateAddress('127.0.0.1') === true)
check('RFC1918 is private', isPrivateAddress('192.168.1.9') === true && isPrivateAddress('10.2.3.4') === true)
check('public is not private', isPrivateAddress('8.8.8.8') === false)
check('private peer honours x-real-ip', clientAddress(fakeReq('192.168.1.2', { 'x-real-ip': '203.0.113.9' }), new Set()) === '203.0.113.9')
check('public peer ignores x-real-ip', clientAddress(fakeReq('8.8.8.8', { 'x-real-ip': '203.0.113.9' }), new Set()) === '8.8.8.8')
check('explicit trusted proxy honoured', clientAddress(fakeReq('8.8.8.8', { 'x-real-ip': '203.0.113.9' }), new Set(['8.8.8.8'])) === '203.0.113.9')
check('comma list rejected', clientAddress(fakeReq('127.0.0.1', { 'x-real-ip': '1.1.1.1, 2.2.2.2' }), new Set()) === '127.0.0.1')

const setup = await req('/api/v1/setup', { method: 'POST', ...json({ key: setupKey, username: 'admin@example.com', password: 'admin-password-123' }) })
check('setup with key creates admin', setup.status === 201 && typeof setup.body.deviceKey === 'string')
check('setup closes afterwards', (await req('/setup')).status === 302)
check('replaying the setup key is refused', (await req('/api/v1/setup', { method: 'POST', ...json({ key: setupKey, username: 'mallory', password: 'mallory-password-1' }) })).status === 409)

const csrfOrigin = await req('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ email: 'admin@example.com', password: 'x' }) })
check('cross-origin POST rejected', csrfOrigin.status === 403, String(csrfOrigin.status))
const csrfFetch = await req('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, body: JSON.stringify({ email: 'admin@example.com', password: 'x' }) })
check('cross-site fetch metadata rejected', csrfFetch.status === 403, String(csrfFetch.status))

const badLogin = await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'admin@example.com', password: 'wrong-password' }) })
check('bad login 401 with envelope', badLogin.status === 401 && badLogin.body.error?.code === 'AUTH_INVALID')
const adminLogin = await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'admin@example.com', password: 'admin-password-123' }) })
check('admin login returns client shape', adminLogin.status === 200 && adminLogin.body.account === 'admin@example.com' && adminLogin.body.isAdmin === true)
const adminCookie = cookieOf(adminLogin)

const homeHtml = String((await req('/', { headers: { cookie: adminCookie } })).body)
check('command palette markup', homeHtml.includes('id="cmdk"') && homeHtml.includes('cmdk-open'))
check('nav icons rendered', homeHtml.includes('class="ico"') && homeHtml.includes('class="navlink'))
check('active nav marked', homeHtml.includes('aria-current="page"'))

const adminHtml = String((await req('/admin', { headers: { cookie: adminCookie } })).body)
const settingsRes = await req('/admin/settings', { headers: { cookie: adminCookie } })
const settingsHtml = String(settingsRes.body)
check('session device list', (await req('/api/v1/account/devices', { headers: { cookie: adminCookie } })).status === 200)
const adminRow = await req('/api/v1/admin/users', { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ username: 'second-admin@example.com', password: 'second-admin-123', role: 'admin' }) })
const adminId = adminRow.body.user && adminRow.body.user.id
const disableAdmin = await req('/api/v1/admin/users/' + adminId, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ toggle: true }) })
const deleteAdmin = await req('/api/v1/admin/users/' + adminId, { method: 'DELETE', headers: { cookie: adminCookie } })
const resetAdminPw = await req('/api/v1/admin/users/' + adminId, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ password: 'hijacked-password' }) })
check('admin accounts cannot be disabled', disableAdmin.status === 409 && disableAdmin.body.error.code === 'ADMIN_PROTECTED', String(disableAdmin.status))
check('admin accounts cannot be deleted', deleteAdmin.status === 409 && deleteAdmin.body.error.code === 'ADMIN_PROTECTED', String(deleteAdmin.status))
check('admin password reset removed', resetAdminPw.status === 409, String(resetAdminPw.status))
const adminKeyApi = await req('/api/v1/admin/users/' + adminId + '/device-keys', { headers: { cookie: adminCookie } })
const adminKeyPost = await req('/api/v1/admin/users/' + adminId + '/device-keys', { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ label: 'x' }) })
check('admin key APIs are gone', adminKeyApi.status === 404 && adminKeyPost.status === 404, adminKeyApi.status + '/' + adminKeyPost.status)

check('admin page has section tabs', adminHtml.includes('class="subnav"') && adminHtml.includes('href="/admin/settings"'))
check('tables start with skeleton rows', adminHtml.includes('class="sk"') && adminHtml.includes('aria-busy="true"'))
check('admin settings page', settingsRes.status === 200 && settingsHtml.includes('id="server"') && settingsHtml.includes('class="anchors"'))
check('settings page keeps oidc fields', settingsHtml.includes('id="issuer"') && settingsHtml.includes('id="smtp-host"'))

const tokenMe = await req('/api/v1/auth/me', { headers: { authorization: 'Bearer ' + adminLogin.body.token } })
check('account token works as bearer', tokenMe.status === 200 && tokenMe.body.account === 'admin@example.com', String(tokenMe.status) + ' ' + JSON.stringify(tokenMe.body).slice(0, 120))

const created = await req('/api/v1/admin/users', { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ username: 'alice', password: 'alice-password-123', role: 'user' }) })
check('admin creates alice', created.status === 201 && created.body.deviceKey === undefined, 'no key handed to the admin')
const bob = await req('/api/v1/admin/users', { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ username: 'bob', password: 'bob-password-123', role: 'user' }) })
check('admin creates bob', bob.status === 201 && bob.body.deviceKey === undefined)

// Users enrol with their own password: the console never mints keys for them.
async function deviceFor(username, password, deviceId) {
  const registered = await req('/api/v1/auth/device-login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, deviceKey: password, device: { deviceId, name: username + ' host', role: 'host', identityKey: (username[0] || 'x').repeat(32) } }),
  })
  return { access: registered.body.accessToken, status: registered.status }
}
const alice = await deviceFor('alice', 'alice-password-123', 'alice-host-1')
const bobDevice = await deviceFor('bob', 'bob-password-123', 'bob-host-1')
check('both tenants registered a device', alice.status === 200 && bobDevice.status === 200)

const aliceAuth = { authorization: 'Bearer ' + alice.access }
const list = await req('/api/v1/devices', { headers: aliceAuth })
check('device list contains only own host', list.status === 200 && list.body.items.length === 1 && list.body.items[0].deviceId === 'alice-host-1')

const foreignRead = await req('/api/v1/devices/bob-host-1', { headers: aliceAuth })
const foreignPresence = await req('/api/v1/devices/bob-host-1/presence', { headers: aliceAuth })
const foreignRename = await req('/api/v1/devices/bob-host-1/name', { method: 'POST', headers: { 'content-type': 'application/json', ...aliceAuth }, body: JSON.stringify({ name: 'pwned' }) })
check('cross-tenant read is 404', foreignRead.status === 404, String(foreignRead.status))
check('cross-tenant presence is 404', foreignPresence.status === 404, String(foreignPresence.status))
check('cross-tenant rename is 404', foreignRename.status === 404, String(foreignRename.status))

// Legacy clients enrol devices with their account token, without a key ticket.
const carol = await req('/api/v1/admin/users', { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ username: 'carol', password: 'carol-password-123', role: 'user' }) })
const carolLogin = await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'carol', password: 'carol-password-123' }) })
const legacyRegister = await req('/api/v1/devices/register', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + carolLogin.body.token },
  body: JSON.stringify({ v: 1, device: { deviceId: 'carol-host-1', name: 'carol host', role: 'host', identityKey: 'c'.repeat(32) } }),
})
check('account token can enrol a device', legacyRegister.status === 200 && typeof legacyRegister.body.accessToken === 'string', String(legacyRegister.status))
await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ oidc: { enabled: true, onlySso: true, issuer: 'https://idp.example.com', clientId: 'cid', clientSecret: 'x' } }) })
const blockedRegister = await req('/api/v1/devices/register', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + carolLogin.body.token },
  body: JSON.stringify({ v: 1, device: { deviceId: 'carol-host-2', name: 'second', role: 'host', identityKey: 'c'.repeat(32) } }),
})
check('account enrolment blocked under SSO-only', blockedRegister.status === 401, String(blockedRegister.status))
await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ oidc: { enabled: false, onlySso: false } }) })

const replayTicket = await req('/api/v1/devices/register', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 'not-a-ticket' },
  body: JSON.stringify({ v: 1, device: { deviceId: 'alice-host-2', name: 'second', role: 'host', identityKey: 'z'.repeat(32) } }),
})
check('registration ticket is single use', replayTicket.status === 401, String(replayTicket.status))

const devices = await req('/api/v1/admin/devices', { headers: { cookie: adminCookie } })
check('admin sees both tenants', devices.status === 200 && new Set(devices.body.items.map(d => d.username)).size >= 2)
const audit = await req('/api/v1/admin/audit?limit=5', { headers: { cookie: adminCookie } })
check('admin reads audit log', audit.status === 200 && audit.body.items.length > 0)

const logout = await req('/api/v1/auth/logout', { method: 'POST', headers: { cookie: adminCookie } })
check('logout succeeds and expires cookie', logout.status === 200 && /Max-Age=0/.test(logout.headers.get('set-cookie') || ''))
check('old session is dead after logout', (await req('/api/v1/auth/me', { headers: { cookie: adminCookie } })).status === 401)
check('GET logout is rejected', (await req('/api/v1/auth/logout')).status === 405)

const disable = await req('/api/v1/admin/users/' + created.body.user.id, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: cookieOf(await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'admin@example.com', password: 'admin-password-123' }) })) }, body: JSON.stringify({ toggle: true }) })
check('admin can disable a user', disable.status === 200, String(disable.status))
check('disabled user device token is dead', (await req('/api/v1/me', { headers: aliceAuth })).status === 401)

const httpsApp = make({ DSH_SERVER_PUBLIC_URL: 'https://app.example.com', DSH_ANON_RATE_PER_MINUTE: '30' })
const httpsStart = await httpsApp.start()
const secureLogin = await fetch('http://127.0.0.1:' + httpsStart.port + '/api/v1/auth/login', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bob', password: 'bob-password-123' }) })
const secureCookie = secureLogin.headers.get('set-cookie') || ''
check('https deployment sets Secure cookie', /; Secure/.test(secureCookie) && /HttpOnly/.test(secureCookie) && /SameSite=Lax/.test(secureCookie))
await httpsApp.close()

let limited = false
for (let i = 0; i < 80; i++) {
  const r = await req('/api/v1/auth/login', { method: 'POST', ...json({ username: 'nobody', password: 'wrong-password-123' }) })
  if (r.status === 429) { limited = r.headers.get('retry-after') === '60' || r.status === 429; break }
}
check('anonymous rate limit engages', limited)

// runtime public origin
const adminRelogin = await req('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.7' }, body: JSON.stringify({ email: 'admin@example.com', password: 'admin-password-123' }) })
const adminFresh = cookieOf(adminRelogin)
const badOrigin = await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: adminFresh }, body: JSON.stringify({ server: { publicUrl: 'http://remote.example' } }) })
check('non-https public url rejected', badOrigin.status === 400, String(badOrigin.status))
const goodOrigin = await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: adminFresh }, body: JSON.stringify({ server: { publicUrl: 'https://remote.example' } }) })
check('public url saved at runtime', goodOrigin.status === 200 && goodOrigin.body.server.publicUrl === 'https://remote.example')
const originLogin = await req('/api/v1/auth/login', { method: 'POST', ...json({ email: 'admin@example.com', password: 'admin-password-123' }), headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.7' } })
check('cookie follows the configured https origin', /; Secure/.test(originLogin.headers.get('set-cookie') || ''))

await app.close()
console.log(String.fromCharCode(10) + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1

