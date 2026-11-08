# Configuration

Two layers:

1. **Boot defaults** from environment variables.
2. **Runtime overrides** stored in PostgreSQL (`server_settings`) and edited in the admin console.
   Runtime values win and take effect without a restart, except where noted.

## Core

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — | required, PostgreSQL 13+ |
| `DSH_SERVER_PUBLIC_URL` | unset | optional boot default for the public origin. Prefer setting it on `/setup` or in the admin console — the runtime value wins |
| `DSH_SERVER_PORT` | `8080` | `0` picks an ephemeral port (tests) |
| `DSH_SERVER_HOST` | `0.0.0.0` | bind address |
| `DSH_SERVER_TRUSTED_PROXY_IPS` | empty | extra public peers allowed to send client-IP headers. Loopback and private ranges are **already trusted** |
| `DSH_SETUP_KEY` | random | one-time key for `/setup`; printed at boot when generated |
| `DSH_BREAK_GLASS_PASSWORD` | unset | set to `1` to keep password login usable in SSO-only mode |
| `DSH_SERVER_LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error`/`silent` |

## Public origin (runtime-editable)

`server.publicUrl` in the admin console controls cookies, OIDC redirect URIs and origin checks.
It must be an `https://` origin (plain `http` is accepted only for `localhost`).

- Set it on the `/setup` page (prefilled from the request) or later under **服务地址** in the console.
- When empty and `DSH_SERVER_PUBLIC_URL` is unset, the server derives the origin from the request
  (`X-Forwarded-Proto`/`Host` from trusted peers, otherwise the `Host` header) so first-run works
  before the domain is known. Set it explicitly for production.

## Client IP

Rate limiting and audit use the client address resolved as:

1. if the TCP peer is loopback or in a private range (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16,
   `::1`, `fc00::/7`, `fe80::/10`), or listed in `server.trustedProxyIps`, trust one `X-Real-IP`
   header, then one `X-Forwarded-For` value;
2. otherwise use the TCP peer.

Comma-separated or repeated headers are ignored rather than guessed. This means a proxy on the same
host or LAN works with no configuration; a proxy on a public IP must be listed.

## Sessions and limits (runtime-editable)

| Setting | Default |
|---|---|
| session TTL | 8 hours |
| user rate limit | 600 requests/minute |
| anonymous rate limit | 30 requests/minute |
| connections per user | 16 |

Anonymous limits apply to login, registration and reset endpoints keyed by client IP. Without
`DSH_SERVER_TRUSTED_PROXY_IPS` every request behind a proxy shares one bucket.

## SMTP

Required for self-registration, password reset, email change and code-based OIDC binding.
When unconfigured those endpoints return `503 SMTP_NOT_CONFIGURED`; admins can still create accounts.

```bash
DSH_SMTP_HOST=smtp.example.com
DSH_SMTP_PORT=587
DSH_SMTP_SECURE=0          # 1 for implicit TLS (465)
DSH_SMTP_USER=...
DSH_SMTP_PASS=...
DSH_SMTP_FROM="DSH Remote <no-reply@example.com>"
```

Codes are 6 digits, valid 10 minutes, single use, 5 attempts, 60 s resend cooldown, and limited to
5 per hour / 20 per day per mailbox. Only a keyed digest is stored.

## OIDC

```bash
DSH_OIDC_ISSUER=https://idp.example.com
DSH_OIDC_CLIENT_ID=...
DSH_OIDC_CLIENT_SECRET=...
DSH_OIDC_ALLOWED_DOMAINS=example.com   # optional
```

The console adds two switches: `autoProvision` (create accounts for unknown mailboxes) and
`bindRequireVerification` (require password/code before binding an existing account), plus
`onlySso`. Algorithms accepted: RS256/384/512, PS256/384/512, ES256/384/512. `none` and HMAC are rejected.

## ICE

`DSH_SERVER_STUN_URLS` and `DSH_SERVER_TURN_URLS` are handed to clients through
`GET /api/v1/turn/credentials`. TURN accepts either a coturn REST shared secret
(`DSH_SERVER_TURN_SECRET`) or a static username/password pair. Empty values keep relay-only behaviour.
