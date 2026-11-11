import { readFileSync } from 'node:fs'
import { newTestDb } from './lib/pg-mem.mjs'
import { Store, ApiError, digest } from './build/store-pg.js'
import { redactSensitive } from './build/logger.js'

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')) }

const db = newTestDb({ autoCreateForeignKeyIndices: true })
const { Pool } = db.adapters.createPg()
const pool = new Pool()
const store = new Store(pool)
await store.migrate()
const alice = await store.createUser({ username: 'alice', password: 'alice-password-123' })

// K5: a device enrolled before keys existed has no binding and must be surfaced.
await store.register(alice.user.id, { v: 1, deviceId: 'legacy-device', name: 'legacy', role: 'host', identityKey: 'l'.repeat(32) })
const unbound = (await store.listDeviceKeys(alice.user.id)).find(key => key.id === 'unbound')
check('[K5] unbound devices surface as (未绑定密钥)', unbound?.label === '(未绑定密钥)' && unbound?.deviceCount === 1 && unbound?.revealable === false,
  JSON.stringify(unbound))

// K6: credential changes must not silently add/remove keys.
const first = await store.createDeviceKey(alice.user.id, 'keep-me')
const ids = async () => (await store.listDeviceKeys(alice.user.id)).filter(key => key.id !== 'unbound').map(key => key.id).sort()
const before = await ids()
await store.setPassword(alice.user.id, 'new-password-123')
await store.setEmail(alice.user.id, 'alice@example.com', true)
const after = await ids()
check('[K6] password/email changes keep the key set', JSON.stringify(after) === JSON.stringify(before) && after.includes(first.id),
  JSON.stringify({ before, after }))

// M5's whitelist is a closed set, and a failed audit insert must not be silent.
let refused = false
try { await store.audit('ghost.action', 'test') } catch (error) { refused = error instanceof ApiError && error.code === 'INTERNAL_ERROR' }
check('[M5] unregistered audit actions are refused', refused)
const broken = new Store({ query: async () => { throw new Error('db down') } })
let surfaced = false
try { await broken.audit('device.removed') } catch (error) { surfaced = error instanceof ApiError && error.code === 'AUDIT_UNAVAILABLE' && error.status === 503 }
check('[M5] audit failures are not swallowed', surfaced)
const appSource = readFileSync(new URL('./src/app.ts', import.meta.url), 'utf8')
check('[M5] OIDC success audit is awaited', /await store\.audit\('oidc\.success'/.test(appSource) && !/void store\.audit/.test(appSource))
const noConnect = new Store({ connect: async () => { throw new Error('connect refused') } })
let leaseFailed = false
try { await noConnect.acquireInstanceLease() } catch { leaseFailed = true }
check('lease acquisition failure is fatal', leaseFailed)
const lockedStore = new Store({ connect: async () => ({ query: async () => ({ rows: [{ ok: false }] }), release: () => {} }) })
let locked = false
try { await lockedStore.acquireInstanceLease() } catch (error) { locked = error instanceof ApiError && error.code === 'INSTANCE_LOCKED' }
check('a second writer is refused', locked)

// S1: relay handling must not persist or log payloads.
const gatewaySource = readFileSync(new URL('./src/gateway.ts', import.meta.url), 'utf8')
check('[S1] gateway never persists or audits relay payloads', !/INSERT INTO|store\.audit|logger\.[A-Za-z]+\([^)]*(?:frame|next)\.payload/.test(gatewaySource))

// S2: password hashing and session-token storage.
const storedUser = (await pool.query('SELECT password_hash FROM users WHERE id = $1', [alice.user.id])).rows[0]
const session = await store.createSession(alice.user.id, 60_000)
const sessionRow = (await pool.query('SELECT id FROM sessions WHERE user_id = $1', [alice.user.id])).rows[0]
check('[S2] passwords use scrypt and session tokens are digests', storedUser?.password_hash?.startsWith('scrypt$') === true
  && sessionRow?.id === digest(session.token) && sessionRow?.id !== session.token)

// S11: redaction applies to keys and values at depth.
const redacted = redactSensitive({ authorization: 'Bearer abc', password: 'pw', nested: { accessToken: 'tok' } })
const redactedJson = JSON.stringify(redacted)
check('[S11] sensitive fields are redacted at depth', redactedJson.includes('REDACTED')
  && !redactedJson.includes('abc') && !redactedJson.includes('"pw"') && !redactedJson.includes('tok'), redactedJson)

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1
