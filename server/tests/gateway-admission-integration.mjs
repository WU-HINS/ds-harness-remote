import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { Gateway } from './build/gateway.js'

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')) }

const server = createServer()
const gateway = new Gateway(server, { onInvalidate: () => {}, connectionLimit: 16 }, 'http://127.0.0.1:1', { relayBytesPerSecond: 10 })
const peer = { id: 'dev-1', ownerId: 'user-1', accountRole: 'user' }
gateway.peers.set(peer.id, peer)
const frame = (counter) => ({ type: 'relay', payload: { connectionId: 'c1', counter, data: '' } })

// Exhaust the account's bucket, then wait for a refill: a later frame must still
// queue behind the first one instead of overtaking it (the old take-then-enqueue bug).
// Stop the 25ms drain timer so the queue is observed before it replays.
clearInterval(gateway.admission.relay.timer)
gateway.admission.relay.take(peer.ownerId, 64 * 1024)
gateway.processAuthenticatedFrame(peer, frame(0), 2)
check('the first over-budget relay frame is queued', gateway.admission.relay.queues.get(peer.id)?.queue.frames === 1)
await new Promise(resolve => setTimeout(resolve, 1_100))
gateway.processAuthenticatedFrame(peer, frame(1), 2)
check('a later frame cannot overtake the queued one', gateway.admission.relay.queues.get(peer.id)?.queue.frames === 2)
const queue = gateway.admission.relay.queues.get(peer.id)?.queue
const counters = queue?.items.map((item) => item.frame.payload.counter)
check('both frames wait in order', JSON.stringify(counters) === '[0,1]', JSON.stringify(counters))

const source = readFileSync(new URL('./src/gateway.ts', import.meta.url), 'utf8')
check('the websocket listener calls the frame path', source.includes('this.processAuthenticatedFrame(peer, frame, frameBytes)'))

gateway.close()
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1
