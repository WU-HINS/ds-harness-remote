import { FrameAdmission, DroppedLinkRegistry, RelayAdmission, GatewayAdmission } from './build/gateway-admission.js'

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')) }

let clock = 0
const now = () => clock
const relayFrame = (connectionId, counter) => ({ type: 'relay', payload: { connectionId, counter, data: 'x' } })

// ── frame window ────────────────────────────────────────────────────────────
const frames = new FrameAdmission(3, now)
check('the first frames fit the window', frames.begin(10) && frames.count(10) && frames.begin(10) && frames.count(10) && frames.begin(10) && frames.count(10))
check('one frame past the cap is refused', frames.begin(10) === true && frames.count(10) === false)
clock += 1_000
check('a new second resets the window', frames.begin(10) && frames.count(10))

const bytes = new FrameAdmission(100_000, now)
check('a frame above the byte cap is refused', bytes.begin(17 * 1024 * 1024) && bytes.count(17 * 1024 * 1024) === false)

const dropped = new FrameAdmission(2, now)
check('dropped-link frames have their own allowance', dropped.begin(1) && dropped.countDropped(1) && dropped.countDropped(1))
let droppedOk = true
for (let i = 0; i < 1_100; i += 1) droppedOk = dropped.countDropped(1) && droppedOk
check('the dropped-link allowance is bounded', droppedOk === false)

// ── dropped-link tombstones ──────────────────────────────────────────────────
const evicted = []
const tombstones = new DroppedLinkRegistry({ isLive: () => false, now, ttlMs: 1_000, maxPerHost: 1, onEvict: (id, until) => evicted.push([id, until]) })
tombstones.remember({ id: 'c1', host: 'h1', client: 'cl1' })
check('a frame from either end of the dead link is swallowed', tombstones.matches({ id: 'h1' }, relayFrame('c1', 0)) && tombstones.matches({ id: 'cl1' }, relayFrame('c1', 1)))
check('an unrelated peer is not swallowed', tombstones.matches({ id: 'other' }, relayFrame('c1', 2)) === false)
check('the tombstone counts what it swallowed', tombstones.countFor('c1') === 2)
check('ping and connect.request bypass tombstones', tombstones.matches({ id: 'h1' }, { type: 'ping', payload: { nonce: 'n' } }) === false)
tombstones.remember({ id: 'c2', host: 'h1', client: 'cl2' })
check('a per-host overflow evicts the oldest and reports it', tombstones.size === 1 && evicted.length === 2 && evicted[0][0] === 'h1' && evicted[1][0] === 'cl1')
clock += 2_000
check('an expired tombstone stops swallowing', tombstones.matches({ id: 'h1' }, relayFrame('c2', 0)) === false && tombstones.countFor('c2') === 0)

const live = new DroppedLinkRegistry({ isLive: id => id === 'live-1', now })
live.remember({ id: 'live-1', host: 'h', client: 'c' })
check('a live link is never mistaken for a tombstone', live.matches({ id: 'h' }, relayFrame('live-1', 0)) === false)

// ── weighted relay admission (budget + ordered queues) ───────────────────────
clock = 0
const delivered = []
const stalled = []
const relay = new RelayAdmission({ relayBytesPerSecond: 1_000, now, onStalled: (peerId, info) => stalled.push([peerId, info]) })
relay.take('u1', 0)
relay.take('u1', 64 * 1024)
const replay = (frame) => delivered.push(frame.payload.counter)
check('over-budget frames are queued, not dropped', relay.enqueue('d1', 'u1', relayFrame('c1', 0), 10, replay) && relay.enqueue('d1', 'u1', relayFrame('c1', 1), 10, replay))
relay.drain()
check('an empty budget delivers nothing yet', delivered.length === 0 && relay.queuedPeers === 1)
clock += 1_000
relay.drain()
check('queued frames drain when credit returns', JSON.stringify(delivered) === '[0,1]', JSON.stringify(delivered))

// A frame that arrives after a queue formed must not overtake the queued one.
clock = 0
const order = new RelayAdmission({ relayBytesPerSecond: 1_000, now, onStalled: () => {} })
order.take('u5', 0)
order.take('u5', 64 * 1024)
const orderDelivered = []
order.enqueue('d5', 'u5', relayFrame('c5', 0), 10, f => orderDelivered.push(f.payload.counter))
clock += 1_000
check('a device with a pending frame keeps queueing after credit returns', order.shouldQueue('d5', 'u5', 10) === true)
order.enqueue('d5', 'u5', relayFrame('c5', 1), 10, f => orderDelivered.push(f.payload.counter))
order.drain()
check('a later frame cannot overtake the queued one', JSON.stringify(orderDelivered) === '[0,1]', JSON.stringify(orderDelivered))
order.close()

// Overflow is a refusal, never unbounded memory.
clock = 0
const tight = new RelayAdmission({ relayBytesPerSecond: 1, now, onStalled: () => {} })
tight.take('u2', 0)
tight.take('u2', 64 * 1024)
let fits = 0
for (let i = 0; i < 40; i += 1) if (tight.enqueue('d2', 'u2', relayFrame('c2', i), 1, () => {})) fits += 1
check('a queue overflow is refused at 32 frames', fits === 32, String(fits))

// A queue that cannot move is reported, not grown forever.
clock = 0
const stuck = new RelayAdmission({ relayBytesPerSecond: 1, now, onStalled: (peerId, info) => stalled.push([peerId, info]) })
stuck.take('u3', 0)
stuck.take('u3', 64 * 1024)
stuck.enqueue('d3', 'u3', relayFrame('c3', 0), 64 * 1024, () => {})
clock += 16_000
stuck.drain()
check('a stalled queue reports and is dropped', stalled.some(([id, info]) => id === 'd3' && info.waitMs >= 15_000) && stuck.queuedPeers === 0)

// Lifecycle: a queue belongs to the peer instance, so a disconnect must drop it
// rather than replay old frames into a replacement socket.
clock = 0
const gone = new RelayAdmission({ relayBytesPerSecond: 1, now, onStalled: () => {} })
gone.take('u4', 0)
gone.take('u4', 64 * 1024)
let replayed = 0
gone.enqueue('d4', 'u4', relayFrame('c4', 0), 1, () => { replayed += 1 })
gone.forget('d4')
clock += 10_000
gone.drain()
check('forget drops queued frames instead of replaying them', replayed === 0 && gone.queuedPeers === 0)
gone.close()

relay.forget('d1')
check('forget drops a device queue', relay.queuedPeers === 0)
const facade = new GatewayAdmission(5, { relayBytesPerSecond: 0, onStalled: () => {} })
check('the facade hands out independent frame windows', facade.frameWindow() !== facade.frameWindow())
facade.close()
facade.close()
check('close is idempotent', true)

for (const q of [relay, tight, stuck]) q.close()
console.log(pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exit(1)
