
import { newDb } from 'pg-mem'
import { Store, ApiError } from './build/store-pg.js'

const db = newDb({ autoCreateForeignKeyIndices: true })
const { Pool } = db.adapters.createPg()
const pool = new Pool()
const store = new Store(pool)
let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')) }
const expectErr = async (name, code, fn) => {
  try { await fn(); check(name, false, 'no error') }
  catch (e) { check(name, e instanceof ApiError && e.code === code, 'got ' + (e && e.code ? e.code : String(e))) }
}

await store.migrate()
await store.migrate()
check('migrate is idempotent', true)

const first = await store.createFirstAdmin('admin', 'admin-password-123')
check('first admin created', first.user.role === 'admin' && typeof first.deviceKey === 'string')
await expectErr('second setup is rejected', 'SETUP_CLOSED', () => store.createFirstAdmin('admin2', 'admin-password-456'))

const alice = await store.createUser({ username: 'alice', password: 'alice-password-123', role: 'user' })
const bob = await store.createUser({ username: 'bob', role: 'user' })
check('device key verifies', (await store.verifyDeviceKey('alice', alice.deviceKey))?.id === alice.user.id)
check('wrong device key rejected', (await store.verifyDeviceKey('alice', 'x'.repeat(43))) === undefined)

// Device keys are echoable by contract: the owner may read a live key again.
const firstKey = await store.createDeviceKey(alice.user.id, 'laptop')
let aliceKeys = await store.listDeviceKeys(alice.user.id)
let firstRow = aliceKeys.find((k) => k.id === firstKey.id)
check('live key echoes back unchanged', firstRow?.revealable === true && firstRow?.key === firstKey.key)
await store.revokeDeviceKey(firstKey.id, alice.user.id)
firstRow = (await store.listDeviceKeys(alice.user.id)).find((k) => k.id === firstKey.id)
check('revoked key refuses to echo', firstRow?.revealable === false && firstRow?.key === undefined)
await pool.query("INSERT INTO device_keys (id, user_id, label, key_hash, secret) VALUES ('legacy-key', $1, 'legacy', 'x', NULL)", [alice.user.id])
firstRow = (await store.listDeviceKeys(alice.user.id)).find((k) => k.id === 'legacy-key')
check('legacy key is flagged, never blank', firstRow?.revealable === false && firstRow?.key === undefined)

// D10: rotation re-keys one owned key in place, without changing its bindings.
const rotating = await store.createDeviceKey(alice.user.id, 'rotate-me')
const rotated = await store.rotateDeviceKeyById(alice.user.id, rotating.id)
check('rotation keeps the key id and label', rotated.id === rotating.id && rotated.label === 'rotate-me')
check('rotation issues a new secret', rotated.key !== rotating.key && (await store.verifyDeviceCredential('alice', rotated.key, true))?.keyId === rotating.id)
check('the rotated-away secret stops working', (await store.verifyDeviceCredential('alice', rotating.key, true)) === undefined)
check('rotated key is revealable again', (await store.listDeviceKeys(alice.user.id)).find((k) => k.id === rotating.id)?.key === rotated.key)
await expectErr('another account cannot rotate this key', 'DEVICE_KEY_NOT_FOUND', () => store.rotateDeviceKeyById(bob.user.id, rotating.id))
const legacyRotated = await store.rotateDeviceKeyById(alice.user.id, 'legacy-key')
const legacyRow = (await store.listDeviceKeys(alice.user.id)).find((k) => k.id === 'legacy-key')
check('rotating a legacy key makes it revealable', legacyRow?.revealable === true && legacyRow?.key === legacyRotated.key)

// Rotation must not touch devices.device_key_id: existing devices stay bound.
const boundKey = await store.createDeviceKey(alice.user.id, 'bound')
await store.register(alice.user.id, { v: 1, deviceId: 'device-rotate', name: 'rotate-host', role: 'host', identityKey: 'r'.repeat(32) }, boundKey.id)
await store.rotateDeviceKeyById(alice.user.id, boundKey.id)
const boundDevice = store.list(alice.user.id).find((d) => d.descriptor.deviceId === 'device-rotate')
check('rotation keeps the device binding', boundDevice?.deviceKeyId === boundKey.id, String(boundDevice?.deviceKeyId))

const open = await store.createSession(alice.user.id, 3600_000)
check('session resolves user', (await store.sessionUser(open.token))?.id === alice.user.id)

const descriptor = { v: 1, deviceId: 'device-alice-1', name: 'laptop', role: 'host', identityKey: 'k'.repeat(32) }
const tokens = await store.register(alice.user.id, descriptor)
check('register issues tokens', typeof tokens.accessToken === 'string' && typeof tokens.refreshToken === 'string')
check('authenticate returns owner', store.authenticate(tokens.accessToken).userId === alice.user.id)

await expectErr('cross-user device reuse rejected', 'PEER_IDENTITY_MISMATCH', () =>
  store.register(bob.user.id, { ...descriptor, deviceId: 'device-alice-1' }))

// replay / rotation
const r1 = await store.refresh('device-alice-1', tokens.refreshToken)
check('refresh rotates tokens', r1.refreshToken !== tokens.refreshToken)
const r1again = await store.refresh('device-alice-1', tokens.refreshToken)
check('recovery replay returns same successor', r1again.refreshToken === r1.refreshToken)
const r2 = await store.refresh('device-alice-1', r1.refreshToken)
check('successor rotates again', r2.refreshToken !== r1.refreshToken)
await expectErr('stale replay after successor use is rejected', 'AUTH_INVALID', () => store.refresh('device-alice-1', tokens.refreshToken))
let revoked = false
try { store.get('device-alice-1') } catch (e) { revoked = e.code === 'DEVICE_REVOKED' }
check('replay revoked the device', revoked, revoked ? 'revoked' : 'still active')

// disabled user loses device access immediately
const carol = await store.createUser({ username: 'carol', role: 'user' })
const cTok = await store.register(carol.user.id, { v: 1, deviceId: 'device-carol-1', name: 'phone', role: 'client', identityKey: 'c'.repeat(32) })
check('carol device authenticates', store.authenticate(cTok.accessToken).userId === carol.user.id)
await store.setDisabled(carol.user.id, true)
try { store.authenticate(cTok.accessToken); check('disabled owner blocked', false) } catch (e) { check('disabled owner blocked', ['AUTH_INVALID','DEVICE_REVOKED'].includes(e.code), e.code) }
await expectErr('disabled owner cannot refresh', 'AUTH_INVALID', () => store.refresh('device-carol-1', cTok.refreshToken))
check('session invalidated on disable', (await store.sessionUser((await store.createSession(carol.user.id, 3600_000)).token)) === undefined)

// settings round-trip
await store.setSetting('runtime_config', { oidc: { enabled: true } })
check('settings round-trip', (await store.getSetting('runtime_config')).oidc.enabled === true)

await store.setSetting('setup_key', { key: 'one-time-key' })
check('setup key peek', (await store.peekSetupKey('one-time-key')) === true)
check('setup key consumes', (await store.consumeSetupKey('one-time-key')) === true)
check('setup key is single use', (await store.peekSetupKey('one-time-key')) === false)

const audit = await store.listAudit(10)
check('audit rows readable', Array.isArray(audit))

// per-mailbox quota: five codes per hour across purposes
let quotaHit = false
for (const purpose of ['register', 'reset', 'email-change-old', 'email-change-new', 'oidc-bind']) {
  await store.issueEmailCode('quota@example.com', purpose).catch(() => undefined)
}
try { await store.issueEmailCode('quota@example.com', 'sixth') } catch (e) { quotaHit = e.code === 'EMAIL_QUOTA_EXCEEDED' }
check('sixth code in an hour is refused', quotaHit)

// expired rows are swept on the next issue
await pool.query('INSERT INTO email_codes (id, email, purpose, code_hash, expires_at, created_at) VALUES ($1,$2,$3,$4, now() - interval \'3 days\', now() - interval \'3 days\')',
  ['stale-1', 'sweep@example.com', 'register', 'x'])
// The sweep throttle lives in the e-mail domain now; the seam is intentional.
store['emailCodes'].resetSweep()
await store.issueEmailCode('sweep@example.com', 'register')
const left = await pool.query("SELECT count(*)::int AS n FROM email_codes WHERE id = 'stale-1'")
check('expired codes are swept', left.rows[0].n === 0, String(left.rows[0].n))

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1

