import { RelayBudget, normalizeRelayBytesPerSecond, DEFAULT_RELAY_BYTES_PER_SECOND } from './build/relay-budget.js'

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')) }

let clock = 0
const now = () => clock

// One active account owns the whole budget: fairness needs someone to be fair to.
const budget = new RelayBudget(100_000, now)
check('sole account owns the budget', budget.shareOf('alice') === 100_000)
budget.take('bob', 0)

// Drive alice far above the budget so her weight must fall.
for (let i = 0; i < 40; i += 1) { clock += 10; budget.take('alice', 200_000) }
const heavy = budget.shareOf('alice')
const light = budget.shareOf('bob')
check('heavy account gets a smaller share', heavy < light, Math.round(heavy) + ' < ' + Math.round(light))
check('[M4] shares add up to the budget', Math.abs(heavy + light - 100_000) < 1, String(heavy + light))
check('heavy share stays a usable fraction', heavy > 1_000, String(Math.round(heavy)))

// Idle time restores the weight: throttling must not be a life sentence.
clock += 2_000
const recovered = budget.shareOf('alice')
check('weight recovers after idle time', recovered > heavy, Math.round(recovered) + ' > ' + Math.round(heavy))
clock += 30_000
check('long idle time almost fully restores the share', budget.shareOf('alice') > 40_000, String(Math.round(budget.shareOf('alice'))))

// Overspending exhausts the account's own bucket, not somebody else's.
const small = new RelayBudget(100_000, now)
small.take('carol', 0)
check('a single oversized frame is admitted', small.take('carol', 200_000) === true)
check('the next frame is refused', small.take('carol', 1) === false)
clock += 1_000
check('one second of refill unblocks the account', small.take('carol', 1) === true)

// Zero disables the whole mechanism (single-user deployments).
const off = new RelayBudget(0)
check('zero disables the budget', off.enabled === false && off.take('dave', 1_000_000_000) === true && off.shareOf('dave') === Number.POSITIVE_INFINITY)

check('default is five mebibytes per second', DEFAULT_RELAY_BYTES_PER_SECOND === 5 * 1024 * 1024)
check('missing value falls back to the default', normalizeRelayBytesPerSecond(undefined) === DEFAULT_RELAY_BYTES_PER_SECOND)
check('garbage falls back to the default', normalizeRelayBytesPerSecond('abc') === DEFAULT_RELAY_BYTES_PER_SECOND)
check('negative falls back to the default', normalizeRelayBytesPerSecond(-5) === DEFAULT_RELAY_BYTES_PER_SECOND)
check('explicit zero stays off', normalizeRelayBytesPerSecond('0') === 0)
check('absurd rates are clamped', normalizeRelayBytesPerSecond(1e12) === 1024 * 1024 * 1024)

console.log(pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exit(1)
