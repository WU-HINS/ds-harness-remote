import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import {
  createControlFrame,
  decodeControlFrame,
  MAX_CONTROL_FRAME_BYTES,
  MAX_RELAY_FRAME_BYTES,
  SERVER_SHUTDOWN_CLOSE_CODE,
  SERVER_SHUTDOWN_CLOSE_REASON,
  type ControlFrame,
  type HelloPayload,
  type ConnectRequestPayload,
  type SecureHandshakePayload,
  type RelayPayload,
  type TransportSelectedPayload,
} from '@dsh-remote/protocol'
import { ApiError, Store } from './store-pg.js'
import { Logger } from './logger.js'
import { normalizeGatewayOptions, normalizeMaxFramesPerSec } from './config.js'
import { DroppedLinkRegistry, GatewayAdmission } from './gateway-admission.js'

import type { GatewayOptions } from './gateway-support.js'
import {
  MAX_ICE_CANDIDATES_PER_CONNECTION, WEBRTC_FALLBACK_TIMEOUT_MS, SUPPORTED_TRANSPORTS, TRANSPORT_NAMES,
  modernHost, safeText, requestPath, socketAddress, errorName, errorCode,
  type ConnectionState, type Peer, type Link, type TransportName,
} from './gateway-support.js'

export { MAX_ICE_CANDIDATES_PER_CONNECTION } from './gateway-support.js'
export type { GatewayOptions } from './gateway-support.js'

export class Gateway {
  readonly peers = new Map<string, Peer>()
  private links = new Map<string, Link>()
  /** Tombstones for links that just died: late frames are swallowed, not answered. */
  private readonly droppedLinks = new DroppedLinkRegistry({
    isLive: id => this.links.has(id),
    onEvict: (peerId, until) => {
      const peer = this.peers.get(peerId)
      if (peer) peer.evictedTombstoneUntil = Math.max(peer.evictedTombstoneUntil ?? 0, until)
    },
    onFirstDroppedFrame: (peerId, connectionId) => this.logger.debug('ws_stale_link_frames_dropped', {
      peerId,
      role: this.peers.get(peerId)?.role,
      connectionId: safeText(connectionId),
    }),
  })
  private wss = new WebSocketServer({ noServer: true, maxPayload: MAX_RELAY_FRAME_BYTES, perMessageDeflate: false })
  private heartbeat: ReturnType<typeof setInterval>
  private closed = false
  readonly turnEnabled: boolean | (() => boolean)
  readonly helloTimeoutMs: number
  readonly heartbeatIntervalMs: number
  readonly heartbeatDisconnectMs: number
  readonly forceTerminateGraceMs: number
  readonly maxFramesPerSec: number
  /** Frame windows, weighted relay bandwidth and per-device send queues. */
  private readonly admission: GatewayAdmission
  readonly logger: Logger

  constructor(server: Server, private store: Store, origin: string | (() => string), options: GatewayOptions = {}) {
    // One normalization path for CLI and programmatic callers: NaN, Infinity,
    // negatives and out-of-range values degrade to documented defaults instead
    // of becoming 1ms timers.
    const timing = normalizeGatewayOptions(options)
    this.helloTimeoutMs = timing.helloTimeoutMs
    this.heartbeatIntervalMs = timing.heartbeatIntervalMs
    this.heartbeatDisconnectMs = timing.heartbeatDisconnectMs
    this.forceTerminateGraceMs = timing.forceTerminateGraceMs
    this.maxFramesPerSec = normalizeMaxFramesPerSec(options.maxFramesPerSec)
    this.logger = options.logger ?? new Logger('gateway', options.logLevel ?? 'info')
    this.admission = new GatewayAdmission(this.maxFramesPerSec, {
      relayBytesPerSecond: options.relayBytesPerSecond,
      // 25ms is below the smallest meaningful relay latency and cheap to run.
      onStalled: (peerId, info) => {
        this.logger.warn('relay_queue_stalled', { peerId, ...info })
        this.disconnect(peerId, 'RATE_LIMITED')
      },
    })
    this.turnEnabled = options.turnEnabled ?? false

    store.onInvalidate = id => this.disconnect(id, 'AUTH_INVALID')
    server.on('upgrade', (req, socket, head) => {
      const path = requestPath(req.url)
      // The route still requires an exact match: a query string is rejected
      // (exactly as before) but only its parsed pathname is ever logged.
      const pathRejected = req.url !== '/ws/v1/connect'
      const expectedOrigin = typeof origin === 'function' ? origin() : origin
      const originRejected = Boolean(req.headers.origin) && expectedOrigin !== '' && req.headers.origin !== expectedOrigin
      // Unauthenticated sockets get their own budget so an anonymous flood
      // cannot consume the authenticated capacity.
      const unauth = Math.max(0, this.wss.clients.size - this.peers.size)
      if (pathRejected || originRejected || this.wss.clients.size >= 512 || unauth >= 64) {
        this.logger.warn('ws_upgrade_rejected', {
          // Parsed pathname only: the raw URL may carry credentials in its query.
          path: path === '' ? 'unknown' : path,
          reason: pathRejected
            ? 'invalid_url'
            : originRejected
              ? 'origin_mismatch'
              : 'connection_limit_reached',
          clientCount: this.wss.clients.size,
          hasOrigin: Boolean(req.headers.origin),
          remoteAddress: socketAddress(socket),
        })
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        return
      }
      this.wss.handleUpgrade(req, socket, head, ws => this.accept(ws))
    })
    this.heartbeat = setInterval(() => {
      if (this.closed) return
      for (const peer of this.peers.values()) {
        if (Date.now() - peer.lastPong > this.heartbeatDisconnectMs) {
          this.logger.warn('ws_heartbeat_timeout', {
            peerId: peer.id,
            role: peer.role,
            lastPong: peer.lastPong,
            elapsedMs: Date.now() - peer.lastPong,
            thresholdMs: this.heartbeatDisconnectMs,
          })
          this.disconnect(peer.id, 'CONNECTION_FAILED')
          continue
        }
        peer.nonce = randomUUID()
        this.send(peer, createControlFrame('ping', { nonce: peer.nonce }))
      }
      for (const link of this.links.values()) {
        if (link.stage !== 'ready' && Date.now() - link.created > 30_000) this.drop(link, 'CONNECTION_FAILED')
      }
      this.droppedLinks.prune()
    }, this.heartbeatIntervalMs)
    this.heartbeat.unref()
  }

  droppedLinkFrameCount(connectionId: string): number {
    return this.droppedLinks.countFor(connectionId)
  }

  private send(peer: Peer, frame: ControlFrame): void {
    if (peer.ws.readyState !== WebSocket.OPEN) return
    if (peer.ws.bufferedAmount > 4 * MAX_RELAY_FRAME_BYTES) { this.disconnect(peer.id, 'SLOW_CONSUMER'); return }
    peer.ws.send(JSON.stringify(frame))
  }
  private drop(link: Link, code: string): void {
    this.links.delete(link.id)
    this.droppedLinks.remember(link)
    for (const id of [link.host, link.client]) {
      const p = this.peers.get(id)
      if (p && (p.role === 'client' || modernHost(p.version))) this.send(p, createControlFrame('error', { code, message: code, connectionId: link.id, retryable: true }))
    }
  }
  disconnect(id: string, code: string): void {
    const peer = this.peers.get(id)
    this.peers.delete(id)
    this.admission.relay.forget(id)
    for (const link of this.links.values()) if (link.host === id || link.client === id) this.drop(link, code)
    if (!peer) return
    this.logger.info('ws_peer_disconnected', { peerId: id, code })
    try {
      peer.ws.close(code === 'CONNECTION_REPLACED' ? 4003 : 4001, code)
    } catch {
      // Socket already closing: the grace below still forces termination.
    }
    const timer = setTimeout(() => {
      if (peer.ws.readyState !== WebSocket.CLOSED) peer.ws.terminate()
    }, this.forceTerminateGraceMs)
    timer.unref()
  }

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
    return this.peers.has(link.host) && this.peers.has(link.client)
  }
  private supportedCapabilities(): string[] {
    const turn = typeof this.turnEnabled === 'function' ? this.turnEnabled() : this.turnEnabled === true
    return SUPPORTED_TRANSPORTS.filter(capability => capability !== 'transport.turn' || turn)
  }
  private negotiatedCapabilities(offered: readonly string[]): string[] {
    return this.supportedCapabilities().filter(capability => offered.includes(capability))
  }

  private accept(ws: WebSocket): void {
    let state: ConnectionState = 'awaiting_hello'
    let peer: Peer | undefined
    let deadline: ReturnType<typeof setTimeout> | undefined
    let graceTimer: ReturnType<typeof setTimeout> | undefined
    let helloInFlight = false

    // Timer cleanup is idempotent: every path (auth, timeout, close) can call
    // it any number of times without leaving a scheduled callback behind.
    const clearDeadline = (): void => {
      if (deadline === undefined) return
      clearTimeout(deadline)
      deadline = undefined
    }
    const clearGrace = (): void => {
      if (graceTimer === undefined) return
      clearTimeout(graceTimer)
      graceTimer = undefined
    }
    const terminateSoon = (target: WebSocket): void => {
      clearGrace()
      graceTimer = setTimeout(() => {
        graceTimer = undefined
        if (target.readyState !== WebSocket.CLOSED) target.terminate()
      }, this.forceTerminateGraceMs)
      graceTimer.unref()
    }

    this.logger.debug('ws_connection_accepted', { clientCount: this.wss.clients.size })

    deadline = setTimeout(() => {
      deadline = undefined
      if (state !== 'awaiting_hello') return
      // Close the door before closing the socket: any hello still in flight is
      // then discarded by the frame guard instead of authenticating late.
      state = 'closing'
      this.logger.warn('ws_hello_timeout', { timeoutMs: this.helloTimeoutMs, readyState: ws.readyState })
      if (ws.readyState === WebSocket.OPEN) {
        try {
          const frame = createControlFrame('error', {
            code: 'HELLO_TIMEOUT',
            message: `Hello handshake timed out after ${this.helloTimeoutMs}ms`,
            retryable: true,
          })
          ws.send(JSON.stringify(frame))
        } catch (error) {
          this.logger.warn('ws_hello_timeout_send_failed', { errorName: errorName(error) })
        }
      }
      try {
        ws.close(4001, 'CONNECTION_FAILED')
      } catch {
        // ws might not be closable in some edge states; the grace below terminates it.
      }
      terminateSoon(ws)
    }, this.helloTimeoutMs)
    deadline.unref()

    const admission = this.admission.frameWindow()
    ws.on('error', (error) => {
      // Error messages can embed payload fragments: log the class and errno only.
      this.logger.warn('ws_socket_error', {
        peerId: peer?.id,
        errorName: errorName(error),
        errorCode: errorCode(error),
      })
    })
    ws.on('close', (code, reason) => {
      state = 'closed'
      clearDeadline()
      clearGrace()
      this.logger.info('ws_connection_closed', {
        ...(peer ? { peerId: peer.id, role: peer.role } : {}),
        code,
        // The close reason is arbitrary client text: report only its presence.
        hasReason: Buffer.isBuffer(reason) ? reason.length > 0 : false,
      })
      if (peer && this.peers.get(peer.id) === peer) this.disconnect(peer.id, 'CONNECTION_FAILED')
    })
    ws.on('message', async (raw, binary) => {
      // Frames arriving after the handshake deadline are dropped before any
      // parsing, authentication or store access can happen.
      if (state !== 'awaiting_hello' && state !== 'authenticated') return
      if (ws.readyState !== WebSocket.OPEN) return
      let frame: ControlFrame | undefined
      try {
        if (binary) throw new ApiError('INVALID_MESSAGE')
        const text = raw.toString()
        const frameBytes = Buffer.byteLength(text)
        if (!admission.begin(frameBytes)) throw new ApiError('RATE_LIMITED')
        if (state === 'awaiting_hello' && !admission.count(frameBytes)) throw new ApiError('RATE_LIMITED')
        const envelope = JSON.parse(text) as { v?: unknown }
        if (envelope && envelope.v !== 1) throw new ApiError('UNSUPPORTED_VERSION')
        frame = decodeControlFrame(text)
        if (state === 'awaiting_hello') {
          if (frame.type !== 'hello') throw new ApiError('AUTH_REQUIRED')
          // One hello at a time: a second frame must not overwrite the peer.
          if (helloInFlight) return
          helloInFlight = true
          const p = frame.payload as HelloPayload
          const device = this.store.authenticate(p.accessToken).descriptor
          if (device.deviceId !== p.deviceId || device.role !== p.role) throw new ApiError('AUTH_INVALID')
          // Per-user connection cap: it protects the process, not a privilege tier.
          if (!p.protocols.includes(1)) throw new ApiError('UNSUPPORTED_VERSION')
          // The deadline wins over a late hello: no side effect below may run.
          if (state !== 'awaiting_hello') return
          const ownerId = this.store.get(device.deviceId).userId
          const owner = await this.store.findUserById(ownerId)
          // Re-assert after the await: the hello deadline may have fired meanwhile.
          if (state !== 'awaiting_hello') return
          // Replace our own previous socket before counting, otherwise a user
          // at the cap can never reconnect.
          this.disconnect(device.deviceId, 'CONNECTION_REPLACED')
          let sameUser = 0
          for (const other of this.peers.values()) {
            try { if (this.store.get(other.id).userId === ownerId) sameUser += 1 } catch { /* revoked peer still counts */ sameUser += 1 }
          }
          if (sameUser >= this.store.connectionLimit) throw new ApiError('RATE_LIMITED', 429)
          state = 'authenticated'
          clearDeadline()
          // hello.ack advertises only what this Server can actually coordinate.
          peer = { ws, id: device.deviceId, role: device.role, accountRole: owner?.role === 'admin' ? 'admin' : 'user', ownerId, capabilities: this.negotiatedCapabilities(p.capabilities), version: p.clientVersion ?? device.clientVersion, lastPong: Date.now() }
          this.peers.set(peer.id, peer)
          this.store.touch(peer.id, p.clientVersion, p.harnessVersion)
          this.logger.info('ws_hello_authenticated', {
            deviceId: safeText(peer.id),
            role: peer.role,
            clientVersion: safeText(peer.version),
            capabilities: peer.capabilities.filter(capability => safeText(capability) !== undefined).slice(0, 8),
          })
          this.send(peer, createControlFrame('hello.ack', {
            protocol: 1,
            serverVersion: 'self-hosted/0.1.0',
            connectionSessionId: randomUUID(),
            heartbeatIntervalMs: this.heartbeatIntervalMs,
            maxControlFrameBytes: MAX_CONTROL_FRAME_BYTES,
            maxRelayFrameBytes: MAX_RELAY_FRAME_BYTES,
            capabilities: this.negotiatedCapabilities(p.capabilities),
            webrtcEnabled: true,
            webrtcFallbackTimeoutMs: WEBRTC_FALLBACK_TIMEOUT_MS,
          }))
          return
        }
        if (frame.type === 'hello') throw new ApiError('INVALID_MESSAGE')
        if (!peer || this.peers.get(peer.id) !== peer) throw new ApiError('AUTH_INVALID')
        this.store.get(peer.id)
        if (this.droppedLinks.matches(peer, frame)) {
          if (!admission.countDropped(frameBytes)) throw new ApiError('RATE_LIMITED')
          return
        }
        if (!admission.count(frameBytes)) throw new ApiError('RATE_LIMITED')
        this.processAuthenticatedFrame(peer, frame, frameBytes)
      } catch (error) {
        const code = error instanceof ApiError ? error.code : 'INVALID_MESSAGE'
        this.logger.warn('ws_message_error', {
          code,
          peerId: peer?.id,
          // Never log error.message: JSON parse failures echo the payload.
          errorName: errorName(error),
        })
        // Valid connection-scoped failures must not close the Host's other clients.
        const connectionId = (frame?.payload as { connectionId?: unknown } | undefined)?.connectionId
        if (peer && typeof connectionId === 'string' && code !== 'RATE_LIMITED') {
          const link = this.links.get(connectionId)
          if (link && (link.host === peer.id || link.client === peer.id)) { this.drop(link, code); return }
          this.send(peer, createControlFrame('error', { code, message: code, connectionId, retryable: false }))
          return
        }
        state = 'closing'
        clearDeadline()
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify(createControlFrame('error', { code, message: code, retryable: false }))) } catch { /* closing anyway */ }
        }
        if (peer) this.disconnect(peer.id, code)
        else {
          try { ws.close(4001, code) } catch { /* terminate below */ }
          terminateSoon(ws)
        }
      }
    })
  }
  /** WebSocket frame path: relay frames queue while a queue exists, so a live
   *  frame can never overtake one (a counter gap is a protocol violation). */
  private processAuthenticatedFrame(peer: Peer, frame: ControlFrame, frameBytes: number): void {
    if (frame.type === 'relay' && peer.accountRole !== 'admin' && this.admission.relay.shouldQueue(peer.id, peer.ownerId, frameBytes)) {
      const replay = (next: ControlFrame): void => {
        if (this.peers.get(peer.id) !== peer) return
        try { this.handle(peer, next) } catch (error) {
          // A dead link is stale traffic, not a reason to kill the control connection.
          if (!(error instanceof ApiError && error.code === 'CONNECTION_NOT_FOUND')) this.disconnect(peer.id, 'INVALID_MESSAGE')
        }
      }
      if (!this.admission.relay.enqueue(peer.id, peer.ownerId, frame, frameBytes, replay)) throw new ApiError('RATE_LIMITED')
      return
    }
    this.handle(peer, frame)
  }

  private handle(peer: Peer, frame: ControlFrame): void {
    const p = frame.payload as Record<string, unknown>
    if (frame.type === 'ping') { this.send(peer, createControlFrame('pong', { nonce: p.nonce })); return }
    if (frame.type === 'pong') {
      if (peer.nonce && p.nonce === peer.nonce) { peer.lastPong = Date.now(); peer.nonce = undefined }
      return
    }
    if (frame.type === 'connect.request') {
      const request = frame.payload as ConnectRequestPayload
      if (peer.role !== 'client') throw new ApiError('MEMBERSHIP_REQUIRED')
      const candidateHost = this.peers.get(request.hostDeviceId)
      if (candidateHost && Date.now() - candidateHost.lastPong > this.heartbeatDisconnectMs) {
        this.logger.warn('ws_heartbeat_timeout', {
          peerId: candidateHost.id,
          role: candidateHost.role,
          lastPong: candidateHost.lastPong,
          elapsedMs: Date.now() - candidateHost.lastPong,
          thresholdMs: this.heartbeatDisconnectMs,
        })
        this.disconnect(candidateHost.id, 'CONNECTION_FAILED')
      }
      const host = this.peers.get(request.hostDeviceId)
      const clientDevice = this.store.get(peer.id)
      // Resolve ownership before reporting reachability: a foreign or unknown
      // host must look exactly like an offline host, never like a 403.
      const hostDevice = host === undefined ? undefined : (() => { try { return this.store.get(host.id) } catch { return undefined } })()
      if (!host || host.role !== 'host' || hostDevice === undefined || hostDevice.userId !== clientDevice.userId) {
        this.send(peer, createControlFrame('error', { code: 'HOST_OFFLINE', message: 'Host is offline.', retryable: true }))
        return
      }
      if (!request.preferredTransports.includes('relay') || !peer.capabilities.includes('transport.relay') || !host.capabilities.includes('transport.relay')) throw new ApiError('CAPABILITY_NOT_SUPPORTED')
      // The link coordinates only transports both peers actually advertised;
      // the Host receives the same intersection so it never sees a transport
      // it could not have negotiated.
      const preferredTransports = [...new Set(request.preferredTransports)].filter(transport =>
        peer.capabilities.includes(`transport.${transport}`) && host.capabilities.includes(`transport.${transport}`))
      if (preferredTransports.length === 0) throw new ApiError('CAPABILITY_NOT_SUPPORTED')
      for (const old of this.links.values()) if (old.client === peer.id || (old.host === host.id && !modernHost(host.version))) this.drop(old, 'CONNECTION_REPLACED')
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
      this.send(host, createControlFrame('connect.incoming', {
        connectionId: link.id,
        clientDeviceId: peer.id,
        clientIdentityKey: this.store.get(peer.id).descriptor.identityKey,
        authorization: 'account',
        preferredTransports: link.preferredTransports,
      }))
      return
    }
    const id = p.connectionId
    const link = typeof id === 'string' ? this.links.get(id) : undefined
    if (!link || (peer.id !== link.host && peer.id !== link.client)) throw new ApiError('CONNECTION_NOT_FOUND')
    const otherId = peer.id === link.host ? link.client : link.host
    const other = this.peers.get(otherId)
    this.store.get(otherId)
    if (!other) throw new ApiError('CONNECTION_FAILED')
    if (frame.type === 'connect.accepted' || frame.type === 'connect.rejected') {
      if (peer.id !== link.host || link.stage !== 'pending') throw new ApiError('INVALID_MESSAGE')
      if (frame.type === 'connect.rejected') {
        this.links.delete(link.id)
        this.droppedLinks.remember(link)
      }
      else link.stage = 'accepted'
      this.send(other, frame)
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
    this.send(other, frame)
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
    this.send(other, frame)
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
    this.send(other, selected === transport
      ? createControlFrame('transport.selected', { ...payload })
      : createControlFrame('transport.selected', { ...payload, transport: selected }))
  }
  close(): void {
    if (this.closed) return
    this.closed = true
    clearInterval(this.heartbeat)
    this.admission.close()
    this.logger.info('ws_gateway_closing', { clientCount: this.wss.clients.size })
    for (const ws of this.wss.clients) {
      // An explicit shutdown code lets resumable clients keep only their bounded lease.
      try {
        if (ws.readyState === WebSocket.OPEN) ws.close(SERVER_SHUTDOWN_CLOSE_CODE, SERVER_SHUTDOWN_CLOSE_REASON)
        else ws.terminate()
      } catch {
        // Force termination below.
      }
      const timer = setTimeout(() => { if (ws.readyState !== WebSocket.CLOSED) ws.terminate() }, this.forceTerminateGraceMs)
      timer.unref()
    }
    this.wss.close()
  }
}
