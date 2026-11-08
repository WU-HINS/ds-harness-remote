/**
 * Store smoke against a real PostgreSQL (set DATABASE_URL).
 * Covers what pg-mem cannot: DDL idempotency, advisory locks, transactions,
 * interval arithmetic and unique-constraint behaviour.
 */
import { Pool } from 'pg'
import { Store } from './build/store-pg.js'

const url = process.env.DATABASE_URL
if (!url) { console.log('SKIP pg-smoke: DATABASE_URL not set'); process.exit(0) }

let pass = 0, fail = 0
const check = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? ' :: ' + extra : '')) }

const pool = new Pool({ connectionString: url, max: 4 })
await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
const store = new Store(pool)

await store.migrate()
await store.migrate()
check('schema converges twice on a real database', true)

await store.acquireInstanceLease()
let second = true
try { await new Store(pool).acquireInstanceLease() } catch { second = false }
check('second writer is refused', second === false)

const admin = await store.createFirstAdmin('admin', 'admin-password-123')
check('first admin created', admin.user.role === 'admin')
let closed = false
try { await store.createFirstAdmin('admin2', 'admin-password-123') } catch (e) { closed = e.code === 'SETUP_CLOSED' }
check('second setup refused', closed)

const user = await store.createUser({ username: 'alice', email: 'alice@example.com', emailVerified: true, password: 'alice-password-123' })
const tokens = await store.register(user.user.id, { v: 1, deviceId: 'pg-device-1', name: 'laptop', role: 'host', identityKey: 'k'.repeat(32) })
check('device enrolled', typeof tokens.accessToken === 'string')

let revived = false
await store.revoke('pg-device-1')
try { await store.register(user.user.id, { v: 1, deviceId: 'pg-device-1', name: 'laptop', role: 'host', identityKey: 'k'.repeat(32) }) }
catch (e) { revived = e.code === 'DEVICE_REVOKED' }
check('revoked device cannot re-enrol', revived)

const code = await store.issueEmailCode('quota@example.com', 'register')
check('code verifies', await store.consumeEmailCode('quota@example.com', 'register', code) === true)
for (const purpose of ['a', 'b', 'c', 'd']) await store.issueEmailCode('quota@example.com', purpose).catch(() => undefined)
let quota = false
try { await store.issueEmailCode('quota@example.com', 'e') } catch (e) { quota = e.code === 'EMAIL_QUOTA_EXCEEDED' }
check('hourly quota enforced on real intervals', quota)

// Two accounts, two devices, one flush window: each row must keep its own
// versions. A batched UPDATE used to copy the first device's values to all.
const userB = await store.createUser({ username: 'bob', email: 'bob@example.com', emailVerified: true, password: 'bob-password-123' })
await store.register(user.user.id, { v: 1, deviceId: 'pg-touch-a', name: 'A', role: 'host', identityKey: 'a'.repeat(32) })
await store.register(userB.user.id, { v: 1, deviceId: 'pg-touch-b', name: 'B', role: 'client', platform: 'android', identityKey: 'b'.repeat(32) })
store.touch('pg-touch-a', 'plugin-a', 'harness-a')
store.touch('pg-touch-b', 'plugin-b', 'harness-b')
await store.flushTouchNow()
const rows = await pool.query("SELECT id, version, harness_version FROM devices WHERE id IN ('pg-touch-a','pg-touch-b') ORDER BY id")
const byId = Object.fromEntries(rows.rows.map(r => [r.id, r]))
check('per-device versions survive a batched touch',
  byId['pg-touch-a']?.version === 'plugin-a' && byId['pg-touch-a']?.harness_version === 'harness-a' &&
  byId['pg-touch-b']?.version === 'plugin-b' && byId['pg-touch-b']?.harness_version === 'harness-b',
  JSON.stringify(rows.rows))

store.releaseInstanceLease()
await pool.end()
console.log(String.fromCharCode(10) + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1
