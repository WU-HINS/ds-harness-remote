#!/usr/bin/env node
// Full protocol walkthrough: two simulated peers drive the real WebSocket
// control plane (hello, ping, connect, signalling, handshake, relay, revocation).
//
//   pnpm build
//   DATABASE_URL=postgres://dsh:dsh@127.0.0.1:5432/dshproto node server/scripts/protocol-walkthrough.mjs

import { WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PORT = process.env.PORT ?? '4610'
const BASE = 'http://127.0.0.1:' + PORT
const SETUP_KEY = process.env.SETUP_KEY ?? 'walkthrough-key'

if (!process.env.DATABASE_URL) throw new Error('set DATABASE_URL to a disposable database')
process.env.DSH_SERVER_PORT = PORT
process.env.DSH_SERVER_HOST = '127.0.0.1'
process.env.DSH_SERVER_PUBLIC_URL = BASE
process.env.DSH_SETUP_KEY = SETUP_KEY
process.env.DSH_SERVER_LOG_LEVEL = 'error'
const here = dirname(fileURLToPath(import.meta.url))
await import(pathToFileURL(join(here, '..', 'dist', 'main.js')).href)

for (let i = 0; i < 80; i++) {
  try { const r = await fetch(BASE + '/healthz'); if (r.ok) break } catch {}
  await new Promise(r => setTimeout(r, 200))
}

let pass = 0, fail = 0
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64url')
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')) }

const api = async (path, opts = {}) => {
  const res = await fetch(BASE + path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) } })
  const text = await res.text()
  let body; try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body, headers: res.headers }
}

class Peer {
  constructor(label) { this.label = label; this.frames = []; this.waiters = [] }
  async open() {
    this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws/v1/connect')
    this.ws.on('message', d => { let f; try { f = JSON.parse(String(d)) } catch { return } this.frames.push(f); this.flush() })
    this.closedPromise = new Promise(res => this.ws.on('close', (code, reason) => res({ code, reason: String(reason) })))
    await new Promise((res, rej) => { this.ws.once('open', res); this.ws.once('error', rej) })
  }
  flush() {
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i]
      const idx = this.frames.findIndex(f => f.type === w.type)
      if (idx >= 0) { const [f] = this.frames.splice(idx, 1); clearTimeout(w.timer); this.waiters.splice(i, 1); w.resolve(f) }
    }
  }
  // Control frames are strict: v, id, type, timestamp and payload are all required.
  send(type, payload) { this.ws.send(JSON.stringify({ v: 1, id: randomUUID(), type, timestamp: Date.now(), payload })) }
  next(type, ms = 4000) {
    const idx = this.frames.findIndex(f => f.type === type)
    if (idx >= 0) return Promise.resolve(this.frames.splice(idx, 1)[0])
    return new Promise((resolve, reject) => {
      const w = { type, resolve }
      w.timer = setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) this.waiters.splice(i, 1); reject(new Error('timeout waiting for ' + type + ' on ' + this.label)) }, ms)
      this.waiters.push(w)
    })
  }
  async silent(type, ms = 400) {
    try { await this.next(type, ms); return false } catch { return true }
  }
  close() { try { this.ws.close() } catch {} }
}

const setup = await api('/api/v1/setup', { method: 'POST', body: JSON.stringify({ key: SETUP_KEY, username: 'boss@example.com', password: 'boss-password-123' }) })
check('setup admin', setup.status === 201, String(setup.status))
const session = (setup.headers.get('set-cookie') ?? '').split(';')[0]
const hostKey = setup.body.deviceKey

const users = await api('/api/v1/admin/users', { headers: { cookie: session } })
const adminUser = users.body.users.find(u => u.username === 'boss@example.com')
check('admin has a device username', Boolean(adminUser?.deviceUsername), adminUser?.deviceUsername)

const bob = await api('/api/v1/admin/users', { method: 'POST', headers: { cookie: session }, body: JSON.stringify({ username: 'bob@example.com', password: 'bob-password-123', role: 'user' }) })
check('second user created', bob.status === 201, String(bob.status))
const bobKey = bob.body.deviceKey
const bobId = bob.body.user.id
const bobDeviceName = (await api('/api/v1/admin/users', { headers: { cookie: session } })).body.users.find(u => u.id === bobId).deviceUsername

// Device enrolment: the device key is verified and the device registered in one step.
const enrol = async (deviceUsername, key, device) => {
  const res = await api('/api/v1/auth/device-login', { method: 'POST', body: JSON.stringify({ username: deviceUsername, deviceKey: key, device }) })
  if (res.status !== 200) throw new Error('device-login failed ' + res.status + ' ' + JSON.stringify(res.body))
  return res.body
}

// Both peers belong to the same account: a host and a client are two devices
// of one user, each bound to its own device key.
const secondKey = await api('/api/v1/admin/users/' + bobId + '/device-keys', { method: 'POST', headers: { cookie: session }, body: JSON.stringify({ label: 'Pixel' }) })
check('second device key issued', secondKey.status === 201 && Boolean(secondKey.body.key), String(secondKey.status))

const hostDevice = { deviceId: 'host-device-0001', name: 'DSH Desktop', role: 'host', platform: 'linux', version: '0.6.4', identityKey: 'host-identity-key-0001' }
const clientDevice = { deviceId: 'client-device-0001', name: 'Pixel', role: 'client', platform: 'android', version: '0.6.4', identityKey: 'client-identity-key-0001' }

const hostTokens = await enrol(bobDeviceName, bobKey, hostDevice)
const clientTokens = await enrol(bobDeviceName, secondKey.body.key, clientDevice)
check('host enrolled', Boolean(hostTokens.accessToken))
check('client enrolled', Boolean(clientTokens.accessToken))

const host = new Peer('host'); await host.open()
const client = new Peer('client'); await client.open()

host.send('hello', { role: 'host', deviceId: hostDevice.deviceId, accessToken: hostTokens.accessToken, protocols: [1], capabilities: ['transport.relay', 'transport.p2p'], clientVersion: '0.6.4', harnessVersion: '0.6.4' })
const hostAck = await host.next('hello.ack')
check('host hello acknowledged', hostAck.payload.protocol === 1 && hostAck.payload.maxRelayFrameBytes > 0, 'protocol=' + hostAck.payload.protocol)

client.send('hello', { role: 'client', deviceId: clientDevice.deviceId, accessToken: clientTokens.accessToken, protocols: [1], capabilities: ['transport.relay', 'transport.p2p'], clientVersion: '0.6.4' })
const clientAck = await client.next('hello.ack')
check('client hello acknowledged', clientAck.payload.webrtcEnabled === true, 'webrtc=' + clientAck.payload.webrtcEnabled)

client.send('ping', { nonce: 'n-1' })
const pong = await client.next('pong')
check('ping answered with matching nonce', pong.payload.nonce === 'n-1')

client.send('connect.request', { hostDeviceId: hostDevice.deviceId, preferredTransports: ['relay'] })
const incoming = await host.next('connect.incoming')
check('host receives connect.incoming', incoming.payload.authorization === 'account' && incoming.payload.clientDeviceId === clientDevice.deviceId)
const linkId = incoming.payload.connectionId

host.send('connect.accepted', { connectionId: linkId })
const accepted = await client.next('connect.accepted')
check('client receives connect.accepted', accepted.payload.connectionId === linkId)

client.send('signal.offer', { connectionId: linkId, targetDeviceId: hostDevice.deviceId, sdp: 'v=0 relay-only' })
check('signalling dropped on a relay-only link', await host.silent('signal.offer'))

client.send('secure.handshake', { connectionId: linkId, targetDeviceId: hostDevice.deviceId, step: 1, data: b64('noise-e') })
const step1 = await host.next('secure.handshake')
check('handshake step 1 forwarded', step1.payload.step === 1 && step1.payload.data === b64('noise-e'))

host.send('secure.handshake', { connectionId: linkId, targetDeviceId: clientDevice.deviceId, step: 2, data: b64('noise-ee') })
const step2 = await client.next('secure.handshake')
check('handshake step 2 forwarded', step2.payload.step === 2)

client.send('relay', { connectionId: linkId, targetDeviceId: hostDevice.deviceId, counter: 1, ciphertext: b64('client-to-host') })
const relayIn = await host.next('relay')
check('relay client→host', relayIn.payload.ciphertext === b64('client-to-host') && relayIn.payload.counter === 1)

host.send('relay', { connectionId: linkId, targetDeviceId: clientDevice.deviceId, counter: 1, ciphertext: b64('host-to-client') })
const relayOut = await client.next('relay')
check('relay host→client', relayOut.payload.ciphertext === b64('host-to-client'))

client.send('relay', { connectionId: linkId, targetDeviceId: hostDevice.deviceId, counter: 1, ciphertext: b64('replay') })
const clientErr = await client.next('error')
const hostErr = await host.next('error')
check('replayed counter rejected', clientErr.payload.code === 'INVALID_MESSAGE' && hostErr.payload.code === 'INVALID_MESSAGE', clientErr.payload.code)

client.send('connect.request', { hostDeviceId: hostDevice.deviceId, preferredTransports: ['relay'] })
const secondIncoming = await host.next('connect.incoming')
const link2 = secondIncoming.payload.connectionId
host.send('connect.accepted', { connectionId: link2 })
await client.next('connect.accepted')
client.send('transport.selected', { connectionId: link2, targetDeviceId: hostDevice.deviceId, transport: 'relay' })
const selected = await host.next('transport.selected')
check('transport.selected forwarded to host', selected.payload.transport === 'relay')

const presence = await api('/api/v1/devices/' + hostDevice.deviceId + '/presence', { headers: { authorization: 'Bearer ' + clientTokens.accessToken } })
check('presence reports the host online', presence.status === 200 && presence.body.online === true, JSON.stringify(presence.body))

const other = await api('/api/v1/admin/users', { method: 'POST', headers: { cookie: session }, body: JSON.stringify({ username: 'carol@example.com', password: 'carol-password-123', role: 'user' }) })
const carolName = (await api('/api/v1/admin/users', { headers: { cookie: session } })).body.users.find(u => u.id === other.body.user.id).deviceUsername
const carolTokens = await enrol(carolName, other.body.deviceKey, { deviceId: 'client-device-0002', name: 'iPad', role: 'client', identityKey: 'carol-identity-key-0001' })
const carol = new Peer('carol'); await carol.open()
carol.send('hello', { role: 'client', deviceId: 'client-device-0002', accessToken: carolTokens.accessToken, protocols: [1], capabilities: ['transport.relay'], clientVersion: '0.6.4' })
await carol.next('hello.ack')
carol.send('connect.request', { hostDeviceId: hostDevice.deviceId, preferredTransports: ['relay'] })
const foreign = await carol.next('error')
check('cross-tenant host looks offline', foreign.payload.code === 'HOST_OFFLINE', foreign.payload.code)
carol.send('connect.request', { hostDeviceId: 'no-such-host-0000', preferredTransports: ['relay'] })
const unknown = await carol.next('error')
check('unknown host reported offline', unknown.payload.code === 'HOST_OFFLINE')

const refreshed = await api('/api/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ deviceId: clientDevice.deviceId, refreshToken: clientTokens.refreshToken }) })
check('refresh rotates tokens', refreshed.status === 200 && refreshed.body.accessToken !== clientTokens.accessToken, String(refreshed.status))
// Within the 120 s recovery window a replay returns the same successor pair,
// so a response lost in transit is recoverable without revoking the device.
const replay = await api('/api/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ deviceId: clientDevice.deviceId, refreshToken: clientTokens.refreshToken }) })
check('refresh replay recovers the same successor', replay.status === 200 && replay.body.refreshToken === refreshed.body.refreshToken, String(replay.status))
const bogus = await api('/api/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ deviceId: clientDevice.deviceId, refreshToken: 'not-a-real-refresh-token' }) })
check('unknown refresh token rejected', bogus.status === 401, String(bogus.status))

const keys = await api('/api/v1/admin/users/' + bobId + '/device-keys', { headers: { cookie: session } })
const clientKeyId = keys.body.keys.find(k => k.label === 'Pixel' && !k.revoked)?.id
check('client key identified by label', Boolean(clientKeyId))
const revoke = await api('/api/v1/admin/device-keys/' + clientKeyId, { method: 'DELETE', headers: { cookie: session } })
check('device key revoked', revoke.status === 200, String(revoke.status))
const clientClosed = await Promise.race([client.closedPromise, new Promise(r => setTimeout(() => r(null), 5000))])
check('revoked client socket closed', clientClosed !== null && clientClosed.code === 4001, clientClosed ? String(clientClosed.code) : 'still open')

const staleHello = new Peer('stale'); await staleHello.open()
staleHello.send('hello', { role: 'client', deviceId: clientDevice.deviceId, accessToken: clientTokens.accessToken, protocols: [1], capabilities: ['transport.relay'] })
const staleClose = await Promise.race([staleHello.closedPromise, new Promise(r => setTimeout(() => r(null), 5000))])
check('revoked token cannot reconnect', staleClose !== null, staleClose ? String(staleClose.code) : 'still open')

host.close()
console.log('\n' + pass + '/' + (pass + fail) + ' checks passed')
process.exit(fail ? 1 : 0)
