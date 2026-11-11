import type { WebSocket } from 'ws'
import type { GatewayTimingOptions } from './config.js'
import type { LogLevel, Logger } from './logger.js'

export interface GatewayOptions extends GatewayTimingOptions {
  maxFramesPerSec?: number
  /** Server-wide relay budget in bytes per second; ordinary accounts only. 0 disables. */
  relayBytesPerSecond?: number
  logLevel?: LogLevel
  logger?: Logger
  /** Advertise `transport.turn` (and accept TURN credential requests). */
  turnEnabled?: boolean | (() => boolean)
}

/**
 * Gateway support types and sanitizers. Kept out of gateway.ts so the
 * connection state machine has room to grow and diagnostics stay in one place.
 */
export type ConnectionState = 'awaiting_hello' | 'authenticated' | 'closing' | 'closed'

export type Peer = {
  ws: WebSocket; id: string; role: 'host' | 'client'; accountRole: 'admin' | 'user'
  ownerId: string; capabilities: string[]; version: string; lastPong: number
  nonce?: string; evictedTombstoneUntil?: number
}
export type Link = {
  id: string; host: string; client: string; stage: 'pending' | 'accepted' | 'handshake' | 'ready'
  created: number; counters: Map<string, number>; preferredTransports: TransportName[]; iceCandidates: number
}

/** Protocol v1 default: at most 256 ICE candidates per logical connection. */
export const MAX_ICE_CANDIDATES_PER_CONNECTION = 256
/** Mirrors docs/protocol.md: Clients use max(server, local) and default to 12 s. */
export const WEBRTC_FALLBACK_TIMEOUT_MS = 12_000
export const SUPPORTED_TRANSPORTS = ['transport.lan', 'transport.p2p', 'transport.turn', 'transport.relay'] as const
export const TRANSPORT_NAMES = ['lan', 'p2p', 'turn', 'relay'] as const
export type TransportName = (typeof TRANSPORT_NAMES)[number]

export function modernHost(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:\+.*)?$/.exec(version)
  if (!match) return false
  const [major, minor, patch] = match.slice(1).map(Number)
  return major! > 0 || (minor! > 2 || (minor === 2 && patch! >= 15))
}

const SAFE_TEXT = /^[A-Za-z0-9_.:-]+$/
const SAFE_PATH = /^[A-Za-z0-9/._~-]*$/
const SAFE_ADDRESS = /^[0-9a-fA-F:.]{2,45}$/
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9]{0,31}$/
const SAFE_ERROR_CODE = /^[A-Z0-9_]{1,32}$/

/** Diagnostics must never echo client-supplied text verbatim. */
export function safeText(value: unknown, max = 64): string | undefined {
  return typeof value === 'string' && SAFE_TEXT.test(value) ? value.slice(0, max) : undefined
}

/** Parse the upgrade request path, dropping the query string (it may carry a token). */
export function requestPath(rawUrl: string | undefined): string {
  if (typeof rawUrl !== 'string' || rawUrl === '') return ''
  const end = rawUrl.search(/[?#]/)
  const path = end === -1 ? rawUrl : rawUrl.slice(0, end)
  return SAFE_PATH.test(path) ? path.slice(0, 64) : '<invalid>'
}

export function socketAddress(socket: unknown): string | undefined {
  try {
    const address = (socket as { remoteAddress?: unknown } | null)?.remoteAddress
    return typeof address === 'string' && SAFE_ADDRESS.test(address) ? address : undefined
  } catch {
    return undefined
  }
}

export function errorName(error: unknown): string {
  try {
    const name = error instanceof Error ? error.name : undefined
    return typeof name === 'string' && SAFE_ERROR_NAME.test(name) ? name : 'Error'
  } catch {
    return 'Error'
  }
}

export function errorCode(error: unknown): string | undefined {
  try {
    const code = (error as { code?: unknown } | null | undefined)?.code
    return typeof code === 'string' && SAFE_ERROR_CODE.test(code) ? code : undefined
  } catch {
    return undefined
  }
}
