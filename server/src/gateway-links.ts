import { randomUUID } from 'node:crypto'
import {
  createControlFrame, type ControlFrame, type ConnectRequestPayload, type RelayPayload,
  type SecureHandshakePayload, type TransportSelectedPayload,
} from '@dsh-remote/protocol'
import { ApiError, type SavedDevice } from './store-pg.js'
import type { Logger } from './logger.js'
import {
  MAX_ICE_CANDIDATES_PER_CONNECTION, TRANSPORT_NAMES, modernHost,
  type Link, type Peer, type TransportName,
} from './gateway-support.js'

/** What the link state machine needs from the Gateway; no socket lifecycle here. */
export interface LinkRouterDeps {
  peers: Map<string, Peer>
  send: (peer: Peer, frame: ControlFrame) => void
  drop: (link: Link, code: string) => void
  rememberDropped: (link: Link) => void
  getDevice: (id: string) => SavedDevice
  disconnect: (id: string, code: string) => void
  heartbeatDisconnectMs: number
  logger: Logger
}

/**
 * Logical connections: connect.request, accept/reject, signalling, handshake,
 * transport selection and relay counter validation. Extracted from Gateway so
 * the socket lifecycle and the link state machine can evolve separately.
 */
export class LinkRouter {
  readonly links = new Map<string, Link>()

  constructor(private readonly deps: LinkRouterDeps) {}

  /**
   * Authorize a REST `/api/v1/turn/credentials` request. Only the two devices
   * of an active logical connection may obtain credentials, and only while
   * that connection is still being established.
   */
  authorizeIce(deviceId: string, connectionId: string): boolean {
    const link = this.links.get(connectionId)
    if (link === undefined) return false
    if (link.host !== deviceId && link.client !== deviceId) return false
    if (link.stage !== 'accepted' && link.stage !== 'handshake') return false
    return this.deps.peers.has(link.host) && this.deps.peers.has(link.client)
  }

  handle(peer: Peer, frame: ControlFrame): void {
    const p = frame.payload as Record<string, unknown>
    if (frame.type === 'ping') { this.deps.send(peer, createControlFrame('pong', { nonce: p.nonce })); return }
    if (frame.type === 'pong') {
      if (peer.nonce && p.nonce === peer.nonce) { peer.lastPong = Date.now(); peer.nonce = undefined }
      return
    }
    if (frame.type === 'connect.request') {
      const request = frame.payload as ConnectRequestPayload
      if (peer.role !== 'client') throw new ApiError('MEMBERSHIP_REQUIRED')
      const candidateHost = this.deps.peers.get(request.hostDeviceId)
      if (candidateHost && Date.now() - candidateHost.lastPong > this.deps.heartbeatDisconnectMs) {
        this.deps.logger.warn('ws_heartbeat_timeout', {
          peerId: candidateHost.id,
          role: candidateHost.role,
          lastPong: candidateHost.lastPong,
          elapsedMs: Date.now() - candidateHost.lastPong,
          thresholdMs: this.deps.heartbeatDisconnectMs,
        })
        this.deps.disconnect(candidateHost.id, 'CONNECTION_FAILED')
      }
      const host = this.deps.peers.get(request.hostDeviceId)
      const clientDevice = this.deps.getDevice(peer.id)
      // Resolve ownership before reporting reachability: a foreign or unknown
      // host must look exactly like an offline host, never like a 403.
      const hostDevice = host === undefined ? undefined : (() => { try { return this.deps.getDevice(host.id) } catch { return undefined } })()
      if (!host || host.role !== 'host' || hostDevice === undefined || hostDevice.userId !== clientDevice.userId) {
        this.deps.send(peer, createControlFrame('error', { code: 'HOST_OFFLINE', message: 'Host is offline.', retryable: true }))
        return
      }
      if (!request.preferredTransports.includes('relay') || !peer.capabilities.includes('transport.relay') || !host.capabilities.includes('transport.relay')) throw new ApiError('CAPABILITY_NOT_SUPPORTED')
      // The link coordinates only transports both peers actually advertised;
      // the Host receives the same intersection so it never sees a transport
      // it could not have negotiated.
      const preferredTransports = [...new Set(request.preferredTransports)].filter(transport =>
        peer.capabilities.includes(`transport.${transport}`) && host.capabilities.includes(`transport.${transport}`))
      if (preferredTransports.length === 0) throw new ApiError('CAPABILITY_NOT_SUPPORTED')
      for (const old of this.links.values()) if (old.client === peer.id || (old.host === host.id && !modernHost(host.version))) this.deps.drop(old, 'CONNECTION_REPLACED')
      if (this.links.size >= 256) throw new ApiError('RATE_LIMITED')
      const link: Link = {
        id: randomUUID(),
        host: host.id,
        client: peer.id,
        stage: 'pending',
        created: Date.now(),
        counters: new Map(),
        preferredTransports,
        iceCandidates: 0,
      }
      this.links.set(link.id, link)
      this.deps.send(host, createControlFrame('connect.incoming', {
        connectionId: link.id,
        clientDeviceId: peer.id,
        clientIdentityKey: this.deps.getDevice(peer.id).descriptor.identityKey,
        authorization: 'account',
        preferredTransports: link.preferredTransports,
      }))
      return
    }
    const id = p.connectionId
    const link = typeof id === 'string' ? this.links.get(id) : undefined
    if (!link || (peer.id !== link.host && peer.id !== link.client)) throw new ApiError('CONNECTION_NOT_FOUND')
    const otherId = peer.id === link.host ? link.client : link.host
    const other = this.deps.peers.get(otherId)
    this.deps.getDevice(otherId)
    if (!other) throw new ApiError('CONNECTION_FAILED')
    if (frame.type === 'connect.accepted' || frame.type === 'connect.rejected') {
      if (peer.id !== link.host || link.stage !== 'pending') throw new ApiError('INVALID_MESSAGE')
      if (frame.type === 'connect.rejected') {
        this.links.delete(link.id)
        this.deps.rememberDropped(link)
      }
      else link.stage = 'accepted'
      this.deps.send(other, frame)
      return
    }
    if (p.targetDeviceId !== otherId || link.stage === 'pending') throw new ApiError('CONNECTION_NOT_FOUND')
    if (frame.type.startsWith('signal.')) {
      this.forwardSignal(link, peer, other, frame)
      return
    }
    if (frame.type === 'transport.selected') {
      this.forwardTransportSelected(link, peer, other, frame.payload as TransportSelectedPayload)
      return
    }
    if (frame.type === 'secure.handshake') {
      const step = (frame.payload as SecureHandshakePayload).step
      if (step === 1 && peer.id === link.client && link.stage === 'accepted') link.stage = 'handshake'
      else if (step === 2 && peer.id === link.host && link.stage === 'handshake') link.stage = 'ready'
      else throw new ApiError('INVALID_MESSAGE')
    } else if (frame.type === 'relay') {
      const counter = (frame.payload as RelayPayload).counter
      if (link.stage !== 'ready' || counter <= (link.counters.get(peer.id) ?? -1)) throw new ApiError('INVALID_MESSAGE')
      link.counters.set(peer.id, counter)
    } else throw new ApiError('INVALID_MESSAGE')
    this.deps.send(other, frame)
  }
  /**
   * Forward WebRTC signaling only while the logical connection is being
   * established, and only for a transport this link actually negotiated. A
   * relay-only link has no data plane to coordinate — the Host treats
   * unsolicited signaling as a protocol violation that closes its whole
   * Control connection and every tunnel on it, so such frames are dropped for
   * the Client to time out and fall back to Relay.
   */
  private forwardSignal(link: Link, peer: Peer, other: Peer, frame: ControlFrame): void {
    if (link.stage === 'ready') return
    if (!link.preferredTransports.some(transport => transport !== 'relay')) return
    if (frame.type === 'signal.offer') {
      if (peer.id !== link.client) throw new ApiError('INVALID_MESSAGE')
    } else if (frame.type === 'signal.answer') {
      if (peer.id !== link.host) throw new ApiError('INVALID_MESSAGE')
    } else if (frame.type === 'signal.ice') {
      if (++link.iceCandidates > MAX_ICE_CANDIDATES_PER_CONNECTION) throw new ApiError('INVALID_MESSAGE')
    } else {
      throw new ApiError('INVALID_MESSAGE')
    }
    this.deps.send(other, frame)
  }
  /**
   * Forward the initiator's transport choice, gated on the transports the
   * link negotiated. `lan` is downgraded to `p2p` only when the link did not
   * negotiate `transport.lan` (old RC2 peers), as required by
   * docs/protocol.md. Relay keeps the legacy compatibility gate.
   */
  private forwardTransportSelected(link: Link, peer: Peer, other: Peer, payload: TransportSelectedPayload): void {
    // The protocol only lets the initiator (Client) select the transport. A
    // responder (Host) may also announce its own selection after its RTC data
    // channel opens; clients ignore it, so ignoring here is compatibility, not
    // a protocol violation. Throwing would drop the whole link and prevent the
    // Noise handshake from completing.
    if (peer.id !== link.client) return
    if (link.stage !== 'accepted' && link.stage !== 'handshake') throw new ApiError('INVALID_MESSAGE')
    const transport: TransportName = payload.transport
    if (!TRANSPORT_NAMES.includes(transport)) throw new ApiError('INVALID_MESSAGE')
    const selected = transport === 'lan'
      && !link.preferredTransports.includes('lan')
      && link.preferredTransports.includes('p2p')
      ? 'p2p'
      : transport
    if (!link.preferredTransports.includes(selected)) throw new ApiError('CAPABILITY_NOT_SUPPORTED')
    if (selected === 'relay' && !modernHost(other.version)) return
    this.deps.send(other, selected === transport
      ? createControlFrame('transport.selected', { ...payload })
      : createControlFrame('transport.selected', { ...payload, transport: selected }))
  }
}
