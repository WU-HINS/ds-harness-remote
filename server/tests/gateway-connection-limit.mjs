import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import { Gateway } from './build/gateway.js'

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')) }

const devices = new Map([
  ['host-1', { descriptor: { deviceId: 'host-1', name: 'one', role: 'host', identityKey: 'h'.repeat(32) }, userId: 'user-1', revoked: false, lastSeenAt: 0 }],
  ['host-2', { descriptor: { deviceId: 'host-2', name: 'two', role: 'host', identityKey: 'i'.repeat(32) }, userId: 'user-1', revoked: false, lastSeenAt: 0 }],
])
const tokens = new Map([['tok-1', 'host-1'], ['tok-2', 'host-2']])
const store = {
  onInvalidate: () => {},
  connectionLimit: 1,
  authenticate(token) {
    const id = tokens.get(token)
    if (!id) throw new Error('AUTH_INVALID')
    return devices.get(id)
  },
  get(id) {
    const device = devices.get(id)
    if (!device) throw new Error('DEVICE_NOT_FOUND')
    return device
  },
  findUserById() { return { id: 'user-1', role: 'user' } },
  touch() {},
}

const server = createServer()
const gateway = new Gateway(server, store, '', { relayBytesPerSecond: 0 })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

function hello(deviceId, accessToken) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws/v1/connect')
    const timer = setTimeout(() => resolve({ ws, timeout: true }), 5_000)
    ws.on('open', () => ws.send(JSON.stringify({
      v: 1, id: randomUUID(), type: 'hello', timestamp: Date.now(),
      payload: { role: 'host', deviceId, accessToken, protocols: [1], capabilities: ['transport.relay'], clientVersion: '0.6.4' },
    })))
    ws.on('message', (raw) => {
      const frame = JSON.parse(String(raw))
      if (frame.type === 'hello.ack' || frame.type === 'error') { clearTimeout(timer); resolve({ ws, frame }) }
    })
    ws.on('close', () => { clearTimeout(timer); resolve({ ws, closed: true }) })
    ws.on('error', () => {})
  })
}

const first = await hello('host-1', 'tok-1')
check('[M4] the first connection is admitted', first.frame?.type === 'hello.ack', JSON.stringify(first.frame))
const second = await hello('host-2', 'tok-2')
const rejected = second.frame?.type === 'error' && second.frame.payload?.code === 'RATE_LIMITED'
check('[M4] a second connection over the per-user cap is refused', rejected || second.closed === true,
  JSON.stringify(second.frame ?? { closed: second.closed }))

first.ws.close()
second.ws.close()
gateway.close()
await new Promise(resolve => server.close(resolve))
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1
