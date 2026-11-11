import { newDb } from 'pg-mem'
import { Store } from './build/store-pg.js'

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')) }

const db = newDb({ autoCreateForeignKeyIndices: true })
const { Pool } = db.adapters.createPg()
const store = new Store(new Pool())
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

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1
