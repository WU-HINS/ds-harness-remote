/**
 * Per-user and per-IP token buckets.
 *
 * Global limits apply to every non-admin user; a user with role=admin bypasses
 * them (still counted, so the bucket stays warm and cannot be used to silently
 * reset). Buckets are in-process: the deployment is a single writer.
 */
interface Bucket { tokens: number; updated: number }
export class RateLimiter {
  private buckets = new Map<string, Bucket>()
  private capacity: number
  private refillPerMs: number
  constructor(capacity: number, refillPerMs: number, private readonly sweepMs = 60_000) {
    this.capacity = capacity
    this.refillPerMs = refillPerMs
    const timer = setInterval(() => this.sweep(), sweepMs)
    timer.unref?.()
  }
  take(key: string, cost = 1): boolean {
    const now = Date.now()
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updated: now }
    bucket.tokens = Math.min(this.capacity, bucket.tokens + (now - bucket.updated) * this.refillPerMs)
    bucket.updated = now
    this.buckets.set(key, bucket)
    if (bucket.tokens < cost) return false
    bucket.tokens -= cost
    return true
  }
  remaining(key: string): number {
    return Math.floor(this.buckets.get(key)?.tokens ?? this.capacity)
  }
  reset(key: string): void { this.buckets.delete(key) }
  /** Apply a new limit without dropping existing buckets. */
  setLimit(limit: number): void {
    this.capacity = limit
    this.refillPerMs = limit / 60_000
  }
  private sweep(): void {
    const cutoff = Date.now() - 300_000
    for (const [key, bucket] of this.buckets) if (bucket.updated < cutoff) this.buckets.delete(key)
  }
}
export const perMinute = (limit: number) => new RateLimiter(limit, limit / 60_000)
