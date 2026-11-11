
import { newTestDb } from './lib/pg-mem.mjs'
import { Store } from './build/store-pg.js'
import { Runtime } from './build/runtime.js'
import { loadSettings } from './build/settings.js'

let pass = 0, fail = 0
const check = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? ' :: ' + extra : '')) }

const db = newTestDb({ autoCreateForeignKeyIndices: true })
const { Pool } = db.adapters.createPg()
const pool = new Pool()
const store = new Store(pool)
await store.migrate()

const base = loadSettings({
  DSH_SERVER_PUBLIC_URL: 'https://app.example.com',
  DSH_SESSION_TTL_MS: '3600000',
  DSH_USER_RATE_PER_MINUTE: '120',
  DSH_ANON_RATE_PER_MINUTE: '20',
  DSH_USER_CONNECTION_LIMIT: '8',
  DSH_SERVER_TRUSTED_PROXY_IPS: '172.30.0.2, 172.30.0.3',
})

check('limits come from environment', base.userRatePerMinute === 120 && base.userConnectionLimit === 8 && base.sessionTtlMs === 3600000)
check('trusted proxies parsed', base.trustedProxyIps.length === 2 && base.trustedProxyIps[0] === '172.30.0.2')

const rt = new Runtime(store, base)
await rt.init()
check('oidc disabled by default', rt.current.oidc.enabled === false)
check('no oidc client when disabled', rt.oidcClient() === undefined)

await rt.update({ oidc: { enabled: true, issuer: 'https://idp.example.com', clientId: 'cid', clientSecret: 's3cret', scopes: 'openid email', allowedDomains: ['example.com'], autoProvision: false } })
const client1 = rt.oidcClient()
check('oidc client created when enabled', client1 !== undefined && typeof client1.authorizationUrl === 'function')
check('client is memoised', rt.oidcClient() === client1)

const shown = rt.redacted()
check('client secret redacted', shown.oidc.clientSecret === '••••••', String(shown.oidc.clientSecret))
check('scopes persisted', rt.current.oidc.scopes === 'openid email')
check('domains persisted', rt.current.oidc.allowedDomains.length === 1 && rt.current.oidc.allowedDomains[0] === 'example.com')

await rt.update({ oidc: { issuer: 'https://idp2.example.com' } })
const client2 = rt.oidcClient()
check('changing issuer rebuilds client', client2 !== client1)
check('secret preserved across partial update', rt.current.oidc.clientSecret === 's3cret')

let threw = false
try { await rt.update({ oidc: { enabled: true, issuer: '', clientId: '' } }) } catch { threw = true }
check('enabling without issuer/clientId is rejected', threw)

await rt.update({ limits: { userRatePerMinute: 300, anonRatePerMinute: 60, userConnectionLimit: 32, sessionTtlMs: 7200000 } })
check('limits updated at runtime', rt.limits.userRatePerMinute === 300 && rt.limits.userConnectionLimit === 32)

const rt2 = new Runtime(store, base)
await rt2.init()
check('config survives a fresh instance', rt2.current.oidc.issuer === 'https://idp2.example.com' && rt2.limits.userRatePerMinute === 300)

await rt.update({ ice: { stunUrls: ['stun:stun.example.com:3478'], turnUrls: ['turns:turn.example.com:443?transport=tcp'], turnUsername: 'u', turnPassword: 'p' } })
const redactedIce = rt.redacted().ice
check('ice secret redacted', redactedIce.turnPassword === '••••••' && redactedIce.turnUrls.length === 1)

let badUrl = false
try { loadSettings({ DSH_SERVER_PUBLIC_URL: 'https://app.example.com/path' }) } catch { badUrl = true }
check('public url must be a bare origin', badUrl)

console.log(String.fromCharCode(10) + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1

