import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import { Gateway } from './build/gateway.js'

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')) }
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64url')

const devices = new Map([
  ['host-1', { descriptor: { deviceId: 'host-1', name: 'host', role: 'host', identityKey: 'h'.repeat(32) }, userId: 'user-1', revoked: false, lastSeenAt: 0 }],
  ['client-1', { descriptor: { deviceId: 'client-1', name: 'client', role: 'client', identityKey: 'c'.repeat(32) }, userId: 'user-1', revoked: false, lastSeenAt: 0 }],
])
const tokens = new Map([['tok-host', 'host-1'], ['tok-client', 'client-1']])
const store = {
  onInvalidate: () => {},
  connectionLimit: 16,
  authenticate(token) { const id = tokens.get(token); if (!id) throw new Error('AUTH_INVALID'); return devices.get(id) },
  get(id) { const device = devices.get(id); if (!device) throw new Error('DEVICE_NOT_FOUND'); return device },
  findUserById() { return { id: 'user-1', role: 'user' } },
  touch() {},
}

const server = createServer()
const gateway = new Gateway(server, store, '', { relayBytesPerSecond: 0 })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

function peer(deviceId, accessToken) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws/v1/connect')
    const frames = []
    ws.on('message', (raw) => frames.push(JSON.parse(String(raw))))
    const next = async (type) => {
      for (let i = 0; i < 500; i += 1) {
        const index = frames.findIndex((frame) => frame.type === type)
        if (index >= 0) return frames.splice(index, 1)[0]
        await new Promise((r) => setTimeout(r, 10))
      }
      throw new Error('timeout waiting for ' + type)
    }
    const send = (type, payload) => ws.send(JSON.stringify({ v: 1, id: randomUUID(), type, timestamp: Date.now(), payload }))
    ws.on('open', () => resolve({ ws, next, send }))
  })
}

const host = await peer('host-1', 'tok-host')
const client = await peer('client-1', 'tok-client')
host.send('hello', { role: 'host', deviceId: 'host-1', accessToken: 'tok-host', protocols: [1], capabilities: ['transport.relay'], clientVersion: '0.6.4' })
client.send('hello', { role: 'client', deviceId: 'client-1', accessToken: 'tok-client', protocols: [1], capabilities: ['transport.relay'], clientVersion: '0.6.4' })
check('host hello acknowledged', (await host.next('hello.ack')).payload.protocol === 1)
check('client hello acknowledged', (await client.next('hello.ack')).payload.protocol === 1)

client.send('connect.request', { hostDeviceId: 'host-1', preferredTransports: ['relay'] })
const incoming = await host.next('connect.incoming')
const linkId = incoming.payload.connectionId
check('connect.request reaches the host', incoming.payload.authorization === 'account' && incoming.payload.clientDeviceId === 'client-1', String(linkId))
check('ICE is refused while the link is pending', gateway.authorizeIce('client-1', linkId) === false)

host.send('connect.accepted', { connectionId: linkId })
check('accept is forwarded', (await client.next('connect.accepted')).payload.connectionId === linkId)
check('ICE is allowed once accepted', gateway.authorizeIce('client-1', linkId) === true)

client.send('secure.handshake', { connectionId: linkId, targetDeviceId: 'host-1', step: 1, data: b64('e') })
check('handshake step 1 reaches the host', (await host.next('secure.handshake')).payload.step === 1)
host.send('secure.handshake', { connectionId: linkId, targetDeviceId: 'client-1', step: 2, data: b64('ee') })
check('handshake step 2 reaches the client', (await client.next('secure.handshake')).payload.step === 2)

client.send('relay', { connectionId: linkId, targetDeviceId: 'host-1', counter: 1, ciphertext: b64('payload') })
check('relay reaches the host', (await host.next('relay')).payload.ciphertext === b64('payload'))

client.send('relay', { connectionId: linkId, targetDeviceId: 'host-1', counter: 1, ciphertext: b64('replay') })
const error = await client.next('error')
check('a replayed counter closes the link', error.payload.code === 'INVALID_MESSAGE', String(error.payload.code))
check('ICE is refused after the link is dropped', gateway.authorizeIce('client-1', linkId) === false)

host.ws.close()
client.ws.close()
gateway.close()
await new Promise(resolve => server.close(resolve))
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1
