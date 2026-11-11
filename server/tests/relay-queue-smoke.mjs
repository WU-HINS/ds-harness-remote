import { RelayQueue } from './build/relay-queue.js'

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')) }
let clock = 0
const now = () => clock
const frame = (n) => ({ type: 'relay', payload: { connectionId: 'c1', counter: n, data: 'x' } })

const delivered = []
let credit = 10
const queue = new RelayQueue({ deliver: (f) => delivered.push(f.payload.counter), take: () => credit-- > 0, now })

check('push accepts frames while there is room', queue.push(frame(0), 10) && queue.push(frame(1), 10))
check('queue reports its depth and bytes', queue.frames === 2 && queue.bytes === 20)

credit = 1
let result = queue.drain()
check('drain stops when credit runs out', result.delivered === 1 && queue.frames === 1)
check('[M4] delivery preserves order', JSON.stringify(delivered) === '[0]', JSON.stringify(delivered))
credit = 5
queue.drain()
check('remaining frame follows in order', JSON.stringify(delivered) === '[0,1]', JSON.stringify(delivered))
check('empty queue is reported empty', queue.empty === true && queue.bytes === 0)

// Overflow is a refusal, never unbounded memory.
const tight = new RelayQueue({ deliver: () => {}, take: () => true, maxFrames: 2, now })
check('frame limit rejects the overflow', tight.push(frame(0), 1) && tight.push(frame(1), 1) && tight.push(frame(2), 1) === false)
const narrow = new RelayQueue({ deliver: () => {}, take: () => true, maxBytes: 10, now })
check('byte limit rejects the overflow', narrow.push(frame(0), 6) && narrow.push(frame(1), 6) === false)

// A queue that cannot move for too long must surface, not grow.
let credit2 = 0
const stuck = new RelayQueue({ deliver: () => {}, take: () => credit2-- > 0, maxWaitMs: 1_000, now })
stuck.push(frame(0), 10)
check('fresh queue is not stalled', stuck.drain().stalled === false)
clock += 1_500
check('stalled queue reports a stall', stuck.drain().stalled === true && stuck.waitMs() >= 1_000)

stuck.clear()
check('clear drops everything', stuck.empty === true && stuck.bytes === 0 && stuck.waitMs() === 0)

console.log(pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exit(1)
