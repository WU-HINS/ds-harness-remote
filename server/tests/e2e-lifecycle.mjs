
import { newDb } from 'pg-mem'
import { createApp } from './build/app.js'
import { loadSettings } from './build/settings.js'

let pass = 0, fail = 0
const check = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? ' :: ' + extra : '')) }

const db = newDb({ autoCreateForeignKeyIndices: true })
const { Pool } = db.adapters.createPg()
const pool = new Pool()
const app = createApp(loadSettings({ DSH_SERVER_PUBLIC_URL: 'http://127.0.0.1:1', DSH_SERVER_PORT: '0', DSH_SERVER_HOST: '127.0.0.1', DSH_ANON_RATE_PER_MINUTE: '500' }), { pool })
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

const setup = await req('/api/v1/setup', { method: 'POST', ...json({ key: setupKey, username: 'admin@example.com', password: 'admin-password-123' }) })
check('1 setup', setup.status === 201)
const admin = cookieOf(setup)
const adminToken = setup.body.token

const created = await req('/api/v1/admin/users', { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ username: 'alice', password: 'alice-password-123', role: 'user' }) })
check('2 create user', created.status === 201)
const aliceId = created.body.user.id
let users = await req('/api/v1/admin/users', { headers: { cookie: admin } })
const aliceRow = users.body.users.find(u => u.username === 'alice')
// The suffix is base64url with non-alphanumerics stripped, so its length varies.
check('[M3] 3 virtual device username', /^dev-[a-z0-9]{4,10}$/.test(aliceRow.deviceUsername), aliceRow.deviceUsername)
check('4 exactly one initial key', aliceRow.deviceKeys === 1)

// Keys belong to the owner: the console never sees or mints them.
const aliceLogin = await req('/api/v1/auth/login', { method: 'POST', ...json({ username: 'alice', password: 'alice-password-123' }) })
const aliceCookie = cookieOf(aliceLogin)
const firstKeys = await req('/api/v1/account/device-keys', { headers: { cookie: aliceCookie } })
check('4b owner lists own keys', firstKeys.status === 200 && firstKeys.body.keys.length === 1)
const defaultKey = firstKeys.body.keys[0]
check('[K2] 4c owner can reveal the key', typeof defaultKey.key === 'string' && defaultKey.key.length >= 20, String(defaultKey.key || '').slice(0, 6))
const adminKeys = await req('/api/v1/admin/users/' + aliceId + '/device-keys', { headers: { cookie: admin } })
check('[K4] 4d admin cannot read user keys', adminKeys.status === 404, String(adminKeys.status))

const t1 = await req('/api/v1/auth/login', { method: 'POST', ...json({ username: 'alice', password: defaultKey.key }) })
check('5 standard username works for devices by default', t1.status === 200 && typeof t1.body.token === 'string')
const regA = await req('/api/v1/devices/register', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t1.body.token }, body: JSON.stringify({ v: 1, device: { deviceId: 'alice-laptop', name: 'laptop', role: 'host', identityKey: 'a'.repeat(32) } }) })
check('6 device A registered', regA.status === 200)

const key2 = await req('/api/v1/account/device-keys', { method: 'POST', headers: { 'content-type': 'application/json', cookie: aliceCookie }, body: JSON.stringify({ label: 'iPad' }) })
check('7 second key issued', key2.status === 201 && typeof key2.body.id === 'string')
const t2 = await req('/api/v1/auth/login', { method: 'POST', ...json({ username: aliceRow.deviceUsername, password: key2.body.key }) })
check('8 virtual device username works', t2.status === 200)
const keyAudit = await req('/api/v1/admin/audit?limit=50', { headers: { cookie: admin } })
const keyAuditRow = keyAudit.body.items.find((a) => a.action === 'device_key.created' && a.detail?.keyId === key2.body.id)
check('[M5] key creation writes an audit row with actor and target', keyAuditRow?.actor === 'alice' && keyAuditRow?.userId === aliceId, JSON.stringify(keyAuditRow))
const regB = await req('/api/v1/devices/register', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t2.body.token }, body: JSON.stringify({ v: 1, device: { deviceId: 'alice-tablet', name: 'tablet', role: 'host', identityKey: 'b'.repeat(32) } }) })
check('9 device B registered', regB.status === 200)

const listKeys = async () => (await req('/api/v1/account/device-keys', { headers: { cookie: aliceCookie } })).body.keys
let keys = await listKeys()
const byId = (id) => keys.find(k => k.id === id)
const firstKeyId = keys.filter(k => k.id !== key2.body.id)[0].id
check('[K1] 10 counts are per key', byId(firstKeyId).deviceCount === 1 && byId(key2.body.id).deviceCount === 1,
  JSON.stringify(keys.map(k => [k.label, k.deviceCount])))

// 会话令牌不得换设备令牌
const sessionReg = await req('/api/v1/devices/register', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + adminToken }, body: JSON.stringify({ v: 1, device: { deviceId: 'sneaky-device', name: 'sneaky', role: 'host', identityKey: 's'.repeat(32) } }) })
// Compatibility with the original protocol: an account (web) token may enrol a
// device, exactly like a password acting as a device secret. SSO-only forbids it.
check('11 account token enrols a device (legacy compat)', sessionReg.status === 200, String(sessionReg.status))

const adminRevoke = await req('/api/v1/account/device-keys/' + firstKeyId, { method: 'DELETE', headers: { cookie: admin } })
check('[M1] 11b other accounts cannot revoke this key', adminRevoke.status === 404, String(adminRevoke.status))
const revoked = await req('/api/v1/account/device-keys/' + firstKeyId, { method: 'DELETE', headers: { cookie: aliceCookie } })
check('12 revoke by key id', revoked.status === 200)
check('13 device A loses access', (await req('/api/v1/me', { headers: { authorization: 'Bearer ' + regA.body.accessToken } })).status === 401)
check('14 device B keeps access', (await req('/api/v1/me', { headers: { authorization: 'Bearer ' + regB.body.accessToken } })).status === 200)

// 重新注册被吊销的设备
const t3 = await req('/api/v1/auth/login', { method: 'POST', ...json({ username: aliceRow.deviceUsername, password: key2.body.key }) })
const revive = await req('/api/v1/devices/register', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t3.body.token }, body: JSON.stringify({ v: 1, device: { deviceId: 'alice-laptop', name: 'laptop', role: 'host', identityKey: 'a'.repeat(32) } }) })
check('15 revoked deviceId cannot re-enrol', revive.status === 409, String(revive.status))
check('16 revoked device stays dead', (await req('/api/v1/me', { headers: { authorization: 'Bearer ' + regA.body.accessToken } })).status === 401)
const t4 = await req('/api/v1/auth/login', { method: 'POST', ...json({ username: aliceRow.deviceUsername, password: key2.body.key }) })
const fresh = await req('/api/v1/devices/register', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t4.body.token }, body: JSON.stringify({ v: 1, device: { deviceId: 'alice-laptop-2', name: 'laptop', role: 'host', identityKey: 'a'.repeat(32) } }) })
check('[K1] 17 new deviceId enrols with the surviving key', fresh.status === 200)
keys = await listKeys()
check('18 surviving key counts both devices', byId(key2.body.id).deviceCount === 2, String(byId(key2.body.id).deviceCount))
check('28 revoked key still reports zero', byId(firstKeyId).deviceCount === 0)

// 仅 SSO
const ssoOn = await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ oidc: { enabled: true, onlySso: true, issuer: 'https://idp.example.com', clientId: 'cid', clientSecret: 'sekret' } }) })
check('28 only-SSO enabled', ssoOn.status === 200 && ssoOn.body.oidc.onlySso === true)
check('28 password login blocked', (await req('/api/v1/auth/login', { method: 'POST', ...json({ username: 'alice', password: 'alice-password-123' }) })).status === 403)
// SSO-only no longer narrows the *username*: the device key is the credential.
check('28 standard username works with a device key under onlySso', (await req('/api/v1/auth/login', { method: 'POST', ...json({ username: 'alice', password: key2.body.key }) })).status === 200)
check('28 device username still works', (await req('/api/v1/auth/login', { method: 'POST', ...json({ username: aliceRow.deviceUsername, password: key2.body.key }) })).status === 200)

// 部分更新不应清空配置
const patchOff = await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ oidc: { onlySso: false } }) })
const after = (await req('/api/v1/admin/settings', { headers: { cookie: admin } })).body.oidc
check('28 partial patch keeps other fields', patchOff.status === 200 && after.enabled === true && after.issuer === 'https://idp.example.com' && after.clientId === 'cid', JSON.stringify(after))
check('28 secret survives an empty round-trip', after.clientSecret === '••••••')
check('28 password login restored', (await req('/api/v1/auth/login', { method: 'POST', ...json({ username: 'alice', password: 'alice-password-123' }) })).status === 200)

// 显式空串不应清空密钥，非法限额不应写成 0
const emptySecret = await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ oidc: { clientSecret: '' } }) })
const afterEmpty = (await req('/api/v1/admin/settings', { headers: { cookie: admin } })).body.oidc
check('28 empty secret keeps the stored one', emptySecret.status === 200 && afterEmpty.clientSecret === '••••••')
const beforeLimit = (await req('/api/v1/admin/settings', { headers: { cookie: admin } })).body.limits.userRatePerMinute
const badLimit = await req('/api/v1/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ limits: { userRatePerMinute: null } }) })
const afterLimit = (await req('/api/v1/admin/settings', { headers: { cookie: admin } })).body.limits.userRatePerMinute
check('28 invalid limit is rejected, not zeroed', badLimit.status === 400 && afterLimit === beforeLimit, badLimit.status + ' | ' + afterLimit)

// D10: rotation keeps the key id/bindings, changes the secret, and is audited.
// Enabling SSO-only cleared every non-admin session, so log alice in again.
const aliceAgain = await req('/api/v1/auth/login', { method: 'POST', ...json({ username: 'alice', password: 'alice-password-123' }) })
const aliceCookie2 = cookieOf(aliceAgain)
check('29 alice can sign in again after SSO-only is lifted', aliceAgain.status === 200 && aliceCookie2.length > 0)
const key3 = await req('/api/v1/account/device-keys', { method: 'POST', headers: { 'content-type': 'application/json', cookie: aliceCookie2 }, body: JSON.stringify({ label: 'rotate-me' }) })
check('29 rotation fixture key issued', key3.status === 201 && typeof key3.body.key === 'string', key3.status + ' | ' + JSON.stringify(key3.body))
const rotated = await req('/api/v1/account/device-keys/' + key3.body.id + '/rotate', { method: 'POST', headers: { cookie: aliceCookie2 } })
check('29 owner rotates a key', rotated.status === 200 && rotated.body.id === key3.body.id && rotated.body.label === 'rotate-me'
  && rotated.body.revealable === true && typeof rotated.body.key === 'string' && rotated.body.key !== key3.body.key,
  rotated.status + ' | ' + String(rotated.body.key || '').slice(0, 6))
check('29 rotated key works for devices', (await req('/api/v1/auth/login', { method: 'POST', ...json({ username: 'alice', password: rotated.body.key }) })).status === 200)
check('29 old secret stops working', (await req('/api/v1/auth/login', { method: 'POST', ...json({ username: 'alice', password: key3.body.key }) })).status === 401)
const afterKeys = (await req('/api/v1/account/device-keys', { headers: { cookie: aliceCookie2 } })).body.keys
const rotatedRow = afterKeys.find((k) => k.id === key3.body.id)
check('[K7] 29 rotated key stays revealable', rotatedRow?.revealable === true && rotatedRow?.key === rotated.body.key)
const foreignRotate = await req('/api/v1/account/device-keys/' + key3.body.id + '/rotate', { method: 'POST', headers: { cookie: admin } })
check('29 other accounts cannot rotate this key', foreignRotate.status === 404, String(foreignRotate.status))
const audit = await req('/api/v1/admin/audit?limit=50', { headers: { cookie: admin } })
check('29 rotation is audited', Array.isArray(audit.body.items) && audit.body.items.some((a) => a.action === 'device_key.rotated'), JSON.stringify(audit.body.items?.slice(0, 2)))
await req('/api/v1/account/device-keys/' + key3.body.id, { method: 'DELETE', headers: { cookie: aliceCookie2 } })
const revokedRotate = await req('/api/v1/account/device-keys/' + key3.body.id + '/rotate', { method: 'POST', headers: { cookie: aliceCookie2 } })
check('29 revoked keys cannot rotate', revokedRotate.status === 404, String(revokedRotate.status))

await app.close()
console.log(String.fromCharCode(10) + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1

