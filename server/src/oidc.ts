import { createHash, randomBytes } from 'node:crypto'
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose'
import { ApiError } from './store-pg.js'

export interface OidcConfig {
  issuer: string
  clientId: string
  clientSecret: string
  scopes: string
  allowedDomains: string[]
  autoProvision: boolean
}

interface Discovery {
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  issuer: string
  token_endpoint_auth_methods_supported?: string[]
}
const normalizeIssuer = (value: string) => value.replace(/\/+$/, '')

export interface PendingLogin { nonce: string; verifier: string; expires: number; redirectTo: string }

export class OidcClient {
  private discovery?: Discovery
  private jwks?: ReturnType<typeof createRemoteJWKSet>
  private discoveryExpires = 0
  readonly pending = new Map<string, PendingLogin>()

  constructor(private readonly config: OidcConfig, private readonly publicUrl: string) {}

  get redirectUri(): string { return new URL('/api/v1/auth/oidc/callback', this.publicUrl).toString() }

  private async load(): Promise<Discovery> {
    if (this.discovery && this.discoveryExpires > Date.now()) return this.discovery
    const response = await fetch(new URL('/.well-known/openid-configuration', this.config.issuer), { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new ApiError('OIDC_UNAVAILABLE', 502)
    const discovery = await response.json() as Discovery
    if (!discovery.authorization_endpoint || !discovery.token_endpoint || !discovery.jwks_uri) throw new ApiError('OIDC_UNAVAILABLE', 502)
    // The document must describe the issuer we are configured for; otherwise a
    // swapped discovery would silently re-anchor every binding.
    if (normalizeIssuer(discovery.issuer ?? '') !== normalizeIssuer(this.config.issuer)) {
      throw new ApiError('OIDC_ISSUER_MISMATCH', 502)
    }
    this.discovery = discovery
    this.discoveryExpires = Date.now() + 3600_000
    this.jwks = createRemoteJWKSet(new URL(discovery.jwks_uri))
    return discovery
  }

  async authorizationUrl(): Promise<{ url: string; state: string }> {
    const discovery = await this.load()
    const state = randomBytes(24).toString('base64url')
    const nonce = randomBytes(24).toString('base64url')
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    this.pending.set(state, { nonce, verifier, expires: Date.now() + 600_000, redirectTo: '/' })
    for (const [key, value] of this.pending) if (value.expires < Date.now()) this.pending.delete(key)
    const url = new URL(discovery.authorization_endpoint)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', this.config.clientId)
    url.searchParams.set('redirect_uri', this.redirectUri)
    url.searchParams.set('scope', this.config.scopes)
    url.searchParams.set('state', state)
    url.searchParams.set('nonce', nonce)
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')
    return { url: url.toString(), state }
  }

  async complete(code: string, state: string): Promise<{ issuer: string; subject: string; email?: string; emailVerified: boolean; name?: string }> {
    const pending = this.pending.get(state)
    this.pending.delete(state)
    if (!pending || pending.expires < Date.now()) throw new ApiError('OIDC_INVALID_STATE', 401)
    const discovery = await this.load()
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: this.redirectUri,
      client_id: this.config.clientId, code_verifier: pending.verifier,
    })
    const methods = discovery.token_endpoint_auth_methods_supported ?? []
    const usePost = this.config.clientSecret !== '' && methods.includes('client_secret_post') && !methods.includes('client_secret_basic')
    // The authorization code is single-use: send it exactly once.
    const response = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(!usePost && this.config.clientSecret
          ? { authorization: 'Basic ' + Buffer.from(this.config.clientId + ':' + this.config.clientSecret).toString('base64') }
          : {}),
      },
      body: usePost
        ? new URLSearchParams({ ...Object.fromEntries(body), client_id: this.config.clientId, client_secret: this.config.clientSecret })
        : body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new ApiError('OIDC_TOKEN_EXCHANGE_FAILED', 401)
    const tokens = await response.json() as { id_token?: string }
    if (!tokens.id_token) throw new ApiError('OIDC_TOKEN_EXCHANGE_FAILED', 401)
    const { payload } = await jwtVerify(tokens.id_token, this.jwks!, {
      issuer: this.config.issuer,
      audience: this.config.clientId,
      clockTolerance: 60,
      // RSA and EC only: no HMAC, no none.
      algorithms: ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512'],
    })
    if (payload.nonce !== pending.nonce) throw new ApiError('OIDC_INVALID_NONCE', 401)
    const audience = payload.aud
    if ((Array.isArray(audience) && audience.length > 1) || payload.azp !== undefined) {
      if (payload.azp !== this.config.clientId) throw new ApiError('OIDC_INVALID_AZP', 401)
    }
    return this.claims(payload, normalizeIssuer(this.config.issuer))
  }

  private claims(payload: JWTPayload, issuer: string) {
    const subject = String(payload.sub ?? '')
    if (!subject) throw new ApiError('OIDC_INVALID_SUBJECT', 401)
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined
    if (this.config.allowedDomains.length > 0) {
      const domain = email?.split('@')[1]
      if (!domain || !this.config.allowedDomains.includes(domain)) throw new ApiError('OIDC_DOMAIN_NOT_ALLOWED', 403)
    }
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true'
    return {
      issuer, subject,
      ...(email ? { email } : {}),
      emailVerified,
      ...(typeof payload.name === 'string' ? { name: payload.name } : {}),
    }
  }
}
