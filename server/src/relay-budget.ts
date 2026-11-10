/**
 * Weighted, account-shared budget for relayed bytes.
 *
 * Ordinary accounts share one server-wide budget (5 MiB/s by default). Instead
 * of a first-come-first-served bucket, every account holds a weight that decays
 * with its own recent throughput: the more a single account occupies within the
 * sampling window, the smaller its share becomes and the sooner it meets its own
 * ceiling — so one fast transfer cannot starve everybody else.
 *
 * The weights are relative, so a single active account still gets the whole
 * budget: fairness only matters when there is somebody to be fair to.
 */
export const DEFAULT_RELAY_BYTES_PER_SECOND = 5 * 1024 * 1024
export const MAX_RELAY_BYTES_PER_SECOND = 1024 * 1024 * 1024
/** Refill is measured in bytes/ms; a floor keeps tiny shares usable. */
const MIN_BUCKET_BYTES = 64 * 1024
/** Throughput smoothing window; a burst fades within a few seconds. */
const RATE_DECAY_MS = 1000

/** Reject NaN, negatives and absurd rates; 0 stays 0 because it means "off". */
export function normalizeRelayBytesPerSecond(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_RELAY_BYTES_PER_SECOND
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_RELAY_BYTES_PER_SECOND
  return Math.min(MAX_RELAY_BYTES_PER_SECOND, Math.floor(parsed))
}

interface AccountState {
  tokens: number
  updated: number
  /** Smoothed bytes per second, decayed with elapsed time. */
  rate: number
}

export class RelayBudget {
  private readonly accounts = new Map<string, AccountState>()

  constructor(readonly bytesPerSecond: number, private readonly now: () => number = Date.now) {}

  get enabled(): boolean {
    return this.bytesPerSecond > 0
  }

  /** Weight in (0, 1]: an idle account weighs 1, one saturating the budget weighs 1/2. */
  weightOf(rate: number): number {
    if (!this.enabled) return 1
    return 1 / (1 + Math.max(0, rate) / this.bytesPerSecond)
  }

  /** This account's share of the budget, in bytes per second. */
  shareOf(userId: string): number {
    if (!this.enabled) return Number.POSITIVE_INFINITY
    const at = this.now()
    const own = this.accounts.get(userId)
    let total = this.weightOf(own ? this.decayedRate(own, at) : 0)
    for (const [id, state] of this.accounts) {
      if (id === userId) continue
      total += this.weightOf(this.decayedRate(state, at))
    }
    const weight = this.weightOf(own ? this.decayedRate(own, at) : 0)
    return this.bytesPerSecond * (weight / total)
  }

  /**
   * Debit one frame for one account. Returns false when the account has spent
   * its own share; the caller decides how to react (this server closes the
   * connection rather than dropping a relay frame, because a gap breaks the
   * peer's ordering guarantees).
   */
  take(userId: string, bytes: number): boolean {
    if (!this.enabled) return true
    const at = this.now()
    this.sweep(at)
    const state = this.state(userId, at)
    const share = this.shareOf(userId)
    const capacity = Math.max(share, MIN_BUCKET_BYTES)
    const elapsed = Math.max(0, at - state.updated)
    if (state.tokens < 0) state.tokens = capacity
    state.tokens = Math.min(capacity, state.tokens + elapsed * (share / 1000))
    this.observe(state, elapsed, bytes)
    state.updated = at
    // A frame larger than the whole bucket is charged the bucket, so an operator
    // who sets a rate below the protocol frame limit still admits single frames.
    const cost = Math.min(Math.max(0, bytes), capacity)
    if (cost > state.tokens) return false
    state.tokens -= cost
    return true
  }

  /** Drop accounts that went quiet; called by the gateway on disconnect. */
  forget(userId: string): void {
    this.accounts.delete(userId)
  }

  private state(userId: string, at: number): AccountState {
    let state = this.accounts.get(userId)
    if (!state) {
      // Negative means "not measured yet": the first take fills the bucket to its
      // share, so a fresh account can burst one second instead of being refused.
      state = { tokens: -1, updated: at, rate: 0 }
      this.accounts.set(userId, state)
    }
    return state
  }

  private decayedRate(state: AccountState, at: number): number {
    const elapsed = Math.max(0, at - state.updated)
    return state.rate * Math.exp(-elapsed / RATE_DECAY_MS)
  }

  private observe(state: AccountState, elapsed: number, bytes: number): void {
    if (elapsed <= 0) return
    const decay = Math.exp(-elapsed / RATE_DECAY_MS)
    const instant = Math.max(0, bytes) * 1000 / elapsed
    state.rate = state.rate * decay + instant * (1 - decay)
  }

  /** Bound the map for a long-running process with many one-off accounts. */
  private sweep(at: number): void {
    if (this.accounts.size <= 256) return
    for (const [id, state] of this.accounts) {
      if (at - state.updated > 60_000 && this.decayedRate(state, at) < 1) this.accounts.delete(id)
    }
  }
}
