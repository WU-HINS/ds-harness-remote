#!/usr/bin/env node
// Client compatibility walkthrough: replays exactly the REST sequence the
// original ds-harness clients (dsh_remote / dsh go) perform against a Server.
//
//   pnpm build
//   DATABASE_URL=postgres://dsh:dsh@127.0.0.1:5432/dshcompat node server/scripts/client-compat-walkthrough.mjs

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PORT = process.env.PORT ?? '4630'
const BASE = 'http://127.0.0.1:' + PORT
const SETUP_KEY = process.env.SETUP_KEY ?? 'compat-key'
if (!process.env.DATABASE_URL) throw new Error('set DATABASE_URL to a disposable database')
process.env.DSH_SERVER_PORT = PORT
process.env.DSH_SERVER_HOST = '127.0.0.1'
process.env.DSH_SERVER_PUBLIC_URL = BASE
process.env.DSH_SETUP_KEY = SETUP_KEY
process.env.DSH_SERVER_LOG_LEVEL = 'error'
const here = dirname(fileURLToPath(import.meta.url))
await import(pathToFileURL(join(here, '..', 'dist', 'main.js')).href)
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break } catch {} await new Promise(r => setTimeout(r, 200)) }

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' :: ' + d : '')) }
const api = async (path, opts = {}) => {
  const res = await fetch(BASE + path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) } })
  const text = await res.text(); let body; try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body, headers: res.headers }
}

const setup = await api('/api/v1/setup', { method: 'POST', body: JSON.stringify({ key: SETUP_KEY, username: 'go@example.com', password: 'go-password-123' }) })
check('setup', setup.status === 201, String(setup.status))

// 1. loginWithPassword: needs { token >= 16, account }
const login = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'go@example.com', password: 'go-password-123' }) })
check('login returns token + account', login.status === 200 && typeof login.body.token === 'string' && login.body.token.length >= 16 && login.body.account === 'go@example.com')
const accountToken = login.body.token

// 1b. oauthProviders: discovery endpoint must answer instead of 404
const providers = await api('/api/v1/auth/oauth/providers')
check('oauth providers discovery answers', providers.status === 200 && Array.isArray(providers.body.items), String(providers.status))

// 2. accountMe: GET /auth/me with the token as bearer
const me = await api('/api/v1/auth/me', { headers: { authorization: 'Bearer ' + accountToken } })
check('account token authenticates /auth/me', me.status === 200 && me.body.account === 'go@example.com', String(me.status))

// 3. registerDevice: POST /devices/register under the account token
const device = { deviceId: 'go-device-0001', name: 'dsh go', role: 'host', platform: 'android', version: '0.6.4', identityKey: 'go-identity-key-0001' }
const reg = await api('/api/v1/devices/register', { method: 'POST', headers: { authorization: 'Bearer ' + accountToken }, body: JSON.stringify({ v: 1, device }) })
check('account token enrols a device', reg.status === 200 && typeof reg.body.accessToken === 'string' && typeof reg.body.refreshToken === 'string', String(reg.status))

// 4. refresh rotates the pair
const refreshed = await api('/api/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ deviceId: device.deviceId, refreshToken: reg.body.refreshToken }) })
check('refresh rotates tokens', refreshed.status === 200 && refreshed.body.accessToken !== reg.body.accessToken, String(refreshed.status))

// 5. listHosts: GET /devices with the device access token
const hosts = await api('/api/v1/devices', { headers: { authorization: 'Bearer ' + refreshed.body.accessToken } })
check('device token lists hosts', hosts.status === 200 && Array.isArray(hosts.body.items) && hosts.body.items.length === 1, String(hosts.status))

// 6. presence + descriptor lookups the client performs on connect
const presence = await api('/api/v1/devices/' + device.deviceId + '/presence', { headers: { authorization: 'Bearer ' + refreshed.body.accessToken } })
check('presence of own host', presence.status === 200, String(presence.status))

// 7. redeeming the same account token twice must not mint a second identity
const again = await api('/api/v1/devices/register', { method: 'POST', headers: { authorization: 'Bearer ' + accountToken }, body: JSON.stringify({ v: 1, device }) })
check('re-enrol with the same device id is idempotent', again.status === 200, String(again.status))

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed')
process.exit(fail ? 1 : 0)
