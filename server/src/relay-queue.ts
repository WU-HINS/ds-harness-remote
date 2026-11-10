import type { ControlFrame } from '@dsh-remote/protocol'

/**
 * Send queue for relay frames.
 *
 * A relay frame cannot be dropped: the payload carries a strict counter and the
 * receiving peer treats a gap as a protocol violation. When an account is out of
 * budget the frame is therefore held, in order, until the weighted budget allows
 * it through. The queue is deliberately small: holding relay traffic forever is
 * worse than telling the sender to reconnect, so overflow and stall both surface
 * as a refusal instead of unbounded memory.
 */
export interface RelayQueueOptions {
  deliver: (frame: ControlFrame) => void
  take: (bytes: number) => boolean
  maxFrames?: number
  maxBytes?: number
  maxWaitMs?: number
  now?: () => number
}

interface Item {
  frame: ControlFrame
  bytes: number
  at: number
}

export class RelayQueue {
  private readonly items: Item[] = []
  private pending = 0
  private readonly maxFrames: number
  private readonly maxBytes: number
  private readonly maxWaitMs: number
  private readonly now: () => number

  constructor(private readonly options: RelayQueueOptions) {
    this.maxFrames = options.maxFrames ?? 32
    this.maxBytes = options.maxBytes ?? 256 * 1024
    this.maxWaitMs = options.maxWaitMs ?? 15_000
    this.now = options.now ?? Date.now
  }

  get frames(): number {
    return this.items.length
  }

  get bytes(): number {
    return this.pending
  }

  get empty(): boolean {
    return this.items.length === 0
  }

  /** Oldest frame's age; a stalled queue must never silently grow. */
  waitMs(): number {
    const first = this.items[0]
    return first ? Math.max(0, this.now() - first.at) : 0
  }

  push(frame: ControlFrame, bytes: number): boolean {
    if (this.items.length >= this.maxFrames) return false
    if (this.pending + bytes > this.maxBytes) return false
    this.items.push({ frame, bytes, at: this.now() })
    this.pending += bytes
    return true
  }

  /**
   * Deliver in order while the budget allows. Returns true once the queue is
   * empty, false when it ran out of credit or time.
   */
  drain(): { delivered: number; stalled: boolean } {
    let delivered = 0
    while (this.items.length > 0) {
      const head = this.items[0]!
      if (!this.options.take(head.bytes)) break
      this.items.shift()
      this.pending -= head.bytes
      delivered += 1
      this.options.deliver(head.frame)
    }
    return { delivered, stalled: this.waitMs() > this.maxWaitMs }
  }

  clear(): void {
    this.items.length = 0
    this.pending = 0
  }
}
