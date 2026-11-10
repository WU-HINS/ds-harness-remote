import { MAX_RELAY_FRAME_BYTES, type ControlFrame } from '@dsh-remote/protocol'
import { RelayBudget, normalizeRelayBytesPerSecond } from './relay-budget.js'
import { RelayQueue } from './relay-queue.js'

/**
 * Admission control for the control channel.
 *
 * Three concerns live here so `gateway.ts` only routes frames:
 *   1. per-socket frame/byte windows (a flood must not reach the parser),
 *   2. dropped-link tombstones (late frames from a dead link are swallowed,
 *      not answered with CONNECTION_NOT_FOUND storms),
 *   3. the weighted relay budget and the per-device send queues that hold
 *      relay frames instead of dropping them (a gap breaks frame counters).
 */

const FRAME_WINDOW_MS = 1_000
/** A socket may buffer this many bytes while it is still unauthenticated. */
const AWAITING_HELLO_BYTES = 16 * MAX_RELAY_FRAME_BYTES
/** Dropped-link frames get a separate allowance so they cannot mask a live flood. */
const DROPPED_FRAME_BYTES = 8 * MAX_RELAY_FRAME_BYTES
const MIN_DROPPED_FRAME_ALLOWANCE = 1_024

/**
 * Per-socket token window. `begin` is the shared ceiling for every frame;
 * `count` and `countDropped` charge the branch that actually handled it.
 */
export class FrameAdmission {
  private start: number
  private frames = 0
  private bytes = 0
  private droppedFrames = 0
  private droppedBytes = 0

  constructor(private readonly maxFramesPerSec: number, private readonly now: () => number = Date.now) {
    this.start = now()
  }

  /** Reset on a one-second boundary, then enforce the combined ceiling. */
  begin(frameBytes: number): boolean {
    const at = this.now()
    if (at - this.start >= FRAME_WINDOW_MS) {
      this.start = at
      this.frames = 0
      this.bytes = 0
      this.droppedFrames = 0
      this.droppedBytes = 0
    }
    return this.frames + this.droppedFrames + 1 <= this.maxFramesPerSec + this.maxDroppedFrames()
      && this.bytes + this.droppedBytes + frameBytes <= AWAITING_HELLO_BYTES + DROPPED_FRAME_BYTES
  }

  /** Charge a live frame. A rejected frame still counts, exactly like before. */
  count(frameBytes: number): boolean {
    if (++this.frames > this.maxFramesPerSec) return false
    return (this.bytes += frameBytes) <= AWAITING_HELLO_BYTES
  }

  /** Charge a frame that belongs to a link that was already dropped. */
  countDropped(frameBytes: number): boolean {
    if (++this.droppedFrames > this.maxDroppedFrames()) return false
    return (this.droppedBytes += frameBytes) <= DROPPED_FRAME_BYTES
  }

  private maxDroppedFrames(): number {
    return Math.max(this.maxFramesPerSec * 2, MIN_DROPPED_FRAME_ALLOWANCE)
  }
}

interface DroppedLink {
  host: string
  client: string
  expiresAt: number
  droppedFrames: number
}

export interface DroppedLinkRegistryOptions {
  isLive: (connectionId: string) => boolean
  onEvict?: (peerId: string, until: number) => void
  onFirstDroppedFrame?: (peerId: string, connectionId: string) => void
  ttlMs?: number
  maxPerHost?: number
  maxTotal?: number
  now?: () => number
}

/**
 * Bounded tombstone table for links that just died. A frame for a tombstoned
 * link is swallowed (and counted) for a while, so a Host does not see a storm
 * of CONNECTION_NOT_FOUND for frames that were already in flight.
 */
export class DroppedLinkRegistry {
  private readonly links = new Map<string, DroppedLink>()
  private readonly ttlMs: number
  private readonly maxPerHost: number
  private readonly maxTotal: number
  private readonly now: () => number

  constructor(private readonly options: DroppedLinkRegistryOptions) {
    this.ttlMs = options.ttlMs ?? 300_000
    this.maxPerHost = options.maxPerHost ?? 64
    this.maxTotal = options.maxTotal ?? 16_384
    this.now = options.now ?? Date.now
  }

  remember(link: { id: string; host: string; client: string }): void {
    const at = this.now()
    this.prune(at)
    this.links.delete(link.id)
    let hostCount = 0
    let oldestForHost: [string, DroppedLink] | undefined
    for (const [id, entry] of this.links) {
      if (entry.host !== link.host) continue
      if (oldestForHost === undefined) oldestForHost = [id, entry]
      hostCount += 1
    }
    if (hostCount >= this.maxPerHost && oldestForHost !== undefined) {
      this.evict(oldestForHost[0], oldestForHost[1], at)
    }
    while (this.links.size >= this.maxTotal) {
      const oldest = this.links.entries().next().value as [string, DroppedLink] | undefined
      if (oldest === undefined) break
      this.evict(oldest[0], oldest[1], at)
    }
    this.links.set(link.id, { host: link.host, client: link.client, expiresAt: at + this.ttlMs, droppedFrames: 0 })
  }

  /** True when the frame belongs to a dead link and must not be answered. */
  matches(peer: { id: string; evictedTombstoneUntil?: number }, frame: ControlFrame): boolean {
    if (frame.type === 'ping' || frame.type === 'pong' || frame.type === 'connect.request') return false
    const connectionId = (frame.payload as Record<string, unknown>).connectionId
    if (typeof connectionId !== 'string' || this.options.isLive(connectionId)) return false
    const at = this.now()
    const dropped = this.links.get(connectionId)
    if (!dropped) {
      return peer.evictedTombstoneUntil !== undefined && at < peer.evictedTombstoneUntil
    }
    if (dropped.expiresAt <= at) {
      this.links.delete(connectionId)
      return false
    }
    if (peer.id !== dropped.host && peer.id !== dropped.client) return false
    dropped.droppedFrames += 1
    if (dropped.droppedFrames === 1) this.options.onFirstDroppedFrame?.(peer.id, connectionId)
    return true
  }

  countFor(connectionId: string): number {
    return this.links.get(connectionId)?.droppedFrames ?? 0
  }

  prune(at = this.now()): void {
    for (const [id, entry] of this.links) if (entry.expiresAt <= at) this.links.delete(id)
  }

  get size(): number {
    return this.links.size
  }

  private evict(id: string, entry: DroppedLink, at: number): void {
    this.links.delete(id)
    if (entry.expiresAt <= at) return
    this.options.onEvict?.(entry.host, entry.expiresAt)
    this.options.onEvict?.(entry.client, entry.expiresAt)
  }
}

export interface RelayAdmissionOptions {
  /** Server-wide budget in bytes per second; 0 disables it. */
  relayBytesPerSecond?: number
  /** Called when a queue waited longer than its limit; the caller closes the socket. */
  onStalled: (peerId: string, info: { frames: number; bytes: number; waitMs: number }) => void
  queueDrainMs?: number
  now?: () => number
}

/** One device's ordered queue; the budget is shared by the whole account. */
class QueueEntry {
  readonly queue: RelayQueue

  constructor(readonly ownerId: string, readonly replay: (frame: ControlFrame) => void, budget: RelayBudget, now?: () => number) {
    this.queue = new RelayQueue({
      // Replays the normal path; the caller treats CONNECTION_NOT_FOUND as stale
      // traffic instead of letting the drain timer crash or kill the socket.
      deliver: next => this.replay(next),
      take: own => budget.take(this.ownerId, own),
      ...(now ? { now } : {}),
    })
  }
}

/**
 * Weighted relay bandwidth plus one ordered send queue per device. Over-budget
 * frames wait; overflow and stalls are refusals, never silent frame drops.
 */
export class RelayAdmission {
  readonly budget: RelayBudget
  private readonly queues = new Map<string, QueueEntry>()
  private readonly timer: ReturnType<typeof setInterval>
  private closed = false

  constructor(private readonly options: RelayAdmissionOptions) {
    this.budget = new RelayBudget(normalizeRelayBytesPerSecond(options.relayBytesPerSecond), options.now)
    this.timer = setInterval(() => this.drain(), options.queueDrainMs ?? 25)
    this.timer.unref?.()
  }

  take(ownerId: string, bytes: number): boolean {
    return this.budget.take(ownerId, bytes)
  }

  /**
   * True when a frame must wait: this device already has a queue, or the
   * account has no credit. A live frame must never overtake a queued one — the
   * receiver treats a counter gap as a protocol violation.
   */
  shouldQueue(peerId: string, ownerId: string, bytes: number): boolean {
    if (this.queues.has(peerId)) return true
    return !this.budget.take(ownerId, bytes)
  }

  /** Returns false when the queue overflowed (the caller closes with RATE_LIMITED). */
  enqueue(peerId: string, ownerId: string, frame: ControlFrame, bytes: number, replay: (frame: ControlFrame) => void): boolean {
    let entry = this.queues.get(peerId)
    if (!entry) {
      entry = new QueueEntry(ownerId, replay, this.budget, this.options.now)
      this.queues.set(peerId, entry)
    }
    return entry.queue.push(frame, bytes)
  }

  drain(): void {
    if (this.closed) return
    for (const [peerId, entry] of this.queues) {
      const result = entry.queue.drain()
      if (result.stalled) {
        const info = { frames: entry.queue.frames, bytes: entry.queue.bytes, waitMs: entry.queue.waitMs() }
        entry.queue.clear()
        this.queues.delete(peerId)
        this.options.onStalled(peerId, info)
        continue
      }
      if (entry.queue.empty) this.queues.delete(peerId)
    }
  }

  forget(peerId: string): void {
    this.queues.delete(peerId)
  }

  get queuedPeers(): number {
    return this.queues.size
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    clearInterval(this.timer)
    for (const entry of this.queues.values()) entry.queue.clear()
    this.queues.clear()
  }
}

/** Facade wired into the Gateway: one field, one lifetime. */
export class GatewayAdmission {
  readonly relay: RelayAdmission

  constructor(private readonly maxFramesPerSec: number, options: RelayAdmissionOptions) {
    this.relay = new RelayAdmission(options)
  }

  frameWindow(): FrameAdmission {
    return new FrameAdmission(this.maxFramesPerSec)
  }

  close(): void {
    this.relay.close()
  }
}
