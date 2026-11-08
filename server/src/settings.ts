export interface Settings {
  publicUrlExplicit: boolean
  port: number
  host: string
  publicUrl: URL
  databaseUrl: string
  sessionTtlMs: number
  deviceAccessTtlMs: number
  deviceRefreshTtlMs: number
  /** Requests per minute for a non-admin web session. */
  userRatePerMinute: number
  /** Requests per minute per client IP for anonymous endpoints (login/setup). */
  anonRatePerMinute: number
  /** Concurrent WebSocket connections per non-admin user. */
  userConnectionLimit: number
  trustedProxyIps: string[]
  oidc?: {
    issuer: string
    clientId: string
    clientSecret: string
    scopes: string
    /** When set, only these email domains may auto-provision. */
    allowedDomains: string[]
    autoProvision: boolean
  }
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent'
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const publicUrl = new URL(env.DSH_SERVER_PUBLIC_URL ?? 'http://localhost:8080')
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) {
    throw new Error('DSH_SERVER_PUBLIC_URL must be a bare http(s) origin.')
  }
  const issuer = env.DSH_OIDC_ISSUER?.trim()
  const oidc = issuer && env.DSH_OIDC_CLIENT_ID
    ? {
        issuer,
        clientId: env.DSH_OIDC_CLIENT_ID,
        clientSecret: env.DSH_OIDC_CLIENT_SECRET ?? '',
        scopes: env.DSH_OIDC_SCOPES ?? 'openid email profile',
        allowedDomains: (env.DSH_OIDC_ALLOWED_DOMAINS ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean),
        autoProvision: env.DSH_OIDC_AUTO_PROVISION !== 'false',
      }
    : undefined
  return {
    publicUrlExplicit: typeof env.DSH_SERVER_PUBLIC_URL === 'string' && env.DSH_SERVER_PUBLIC_URL.trim() !== '',
    port: int(env.DSH_SERVER_PORT, 8080, 0, 65535), // 0 = ephemeral, used by embedded/tests
    host: env.DSH_SERVER_HOST ?? '0.0.0.0',
    publicUrl,
    databaseUrl: env.DATABASE_URL ?? 'postgres://dsh:dsh@127.0.0.1:5432/dsh',
    sessionTtlMs: int(env.DSH_SESSION_TTL_MS, 8 * 3600_000, 300_000, 90 * 86400_000),
    deviceAccessTtlMs: int(env.DSH_DEVICE_ACCESS_TTL_MS, 3600_000, 60_000, 86400_000),
    deviceRefreshTtlMs: int(env.DSH_DEVICE_REFRESH_TTL_MS, 30 * 86400_000, 3600_000, 365 * 86400_000),
    userRatePerMinute: int(env.DSH_USER_RATE_PER_MINUTE, 600, 10, 100_000),
    anonRatePerMinute: int(env.DSH_ANON_RATE_PER_MINUTE, 30, 1, 10_000),
    userConnectionLimit: int(env.DSH_USER_CONNECTION_LIMIT, 16, 1, 4096),
    trustedProxyIps: (env.DSH_SERVER_TRUSTED_PROXY_IPS ?? '').split(',').map(v => v.trim()).filter(Boolean),
    oidc,
    logLevel: (env.DSH_SERVER_LOG_LEVEL as Settings['logLevel']) ?? 'info',
  }
}
