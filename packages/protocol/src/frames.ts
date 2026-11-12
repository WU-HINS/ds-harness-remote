import type { ControlFrameType, ErrorCode, PROTOCOL_VERSION } from './index.js'

/** Control-channel frame and payload shapes (protocol.md §10–§23). */
export interface ControlFrame<TPayload = unknown> {
  v: typeof PROTOCOL_VERSION
  id: string
  type: ControlFrameType
  timestamp: number
  payload: TPayload
}

/** Envelope used by the independent Relay data WebSocket. */
export interface RelayDataFrame<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  v: typeof PROTOCOL_VERSION
  id: string
  type: string
  timestamp: number
  payload: TPayload
}

export interface ControlFrameByteLimits {
  maxControlFrameBytes?: number
  maxRelayFrameBytes?: number
}

export interface HelloPayload {
  recoveryTickets?: string[]
  role: 'host' | 'client'
  deviceId: string
  accessToken: string
  protocols: number[]
  capabilities: string[]
  /** Version of the Client/Plugin software reporting in; symmetric to ``HelloAckPayload.serverVersion``. */
  clientVersion?: string
  /** Host Harness version; sent on first hello to refresh the device record. */
  harnessVersion?: string
}

export interface HelloAckPayload {
  protocol: typeof PROTOCOL_VERSION
  serverVersion: string
  connectionSessionId: string
  heartbeatIntervalMs: number
  maxControlFrameBytes: number
  maxRelayFrameBytes: number
  capabilities?: string[]
  /** Optional implementation extension. This field reports WebRTC DataChannel support. */
  webrtcEnabled?: boolean
  /** Optional implementation extension. This field sets the Relay fallback timeout. */
  webrtcFallbackTimeoutMs?: number
}

export interface ConnectRequestPayload {
  hostDeviceId: string
  preferredTransports: Array<'lan' | 'p2p' | 'turn' | 'relay'>
}

export interface ConnectIncomingPayload {
  relayRecoveryTicket?: string
  recoveryTicket?: string
  connectionId: string
  clientDeviceId: string
  clientIdentityKey: string
  authorization: 'account'
  preferredTransports: Array<'lan' | 'p2p' | 'turn' | 'relay'>
  /** Optional independent Relay data-plane assignment. */
  relayEndpoint?: string
  relayTicket?: string
  relayNodeId?: string
  relayEpoch?: number
}

export interface ConnectAcceptedPayload {
  relayRecoveryTicket?: string
  recoveryTicket?: string
  connectionId: string
  /** Optional independent Relay data-plane assignment. */
  relayEndpoint?: string
  relayTicket?: string
  relayNodeId?: string
  relayEpoch?: number
}

export interface ConnectRejectedPayload {
  connectionId: string
  code?: string
  message?: string
}

export interface SecureHandshakePayload {
  connectionId: string
  targetDeviceId: string
  step: number
  data: string
}

export interface ControlErrorPayload {
  /** §23 defines standard codes. Subsystems can add names such as CODEX_* and FILE_VIEWER_*. */
  code: ErrorCode | (string & {})
  message: string
  retryable?: boolean
  connectionId?: string
}

export interface RelayPayload {
  connectionId: string
  targetDeviceId: string
  counter: number
  ciphertext: string
}

export const selectedTransports = ['lan', 'p2p', 'turn', 'relay'] as const
export type SelectedTransport = typeof selectedTransports[number]

export interface SignalPayload {
  connectionId: string
  targetDeviceId: string
  sdp: string
}

export interface IceCandidatePayload {
  candidate?: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
}

export interface SignalIcePayload {
  connectionId: string
  targetDeviceId: string
  candidate: IceCandidatePayload
}

export function normalizeSdpMLineIndex(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null
  return value
}

export interface TransportSelectedPayload {
  connectionId: string
  targetDeviceId: string
  transport: SelectedTransport
  /** Relay hostname the client actually used when transport is "turn"
   *  (best-effort, from ICE stats; absent for other transports). */
  turnNode?: string
}

/** Capabilities both ends announce in ``hello`` to negotiate the data plane. */
