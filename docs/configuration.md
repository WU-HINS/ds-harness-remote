# Configuration

Two layers:

1. **Boot defaults** from environment variables.
2. **Runtime overrides** stored in PostgreSQL (`server_settings`) and edited in the admin console.
   Runtime values win and take effect without a restart, except where noted.

## Core

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — | required, PostgreSQL 13+ |
| `DSH_SERVER_PUBLIC_URL` | `http://localhost:8080` | bare origin only; drives cookies, OIDC redirect URI, origin checks |
| `DSH_SERVER_PORT` | `8080` | `0` picks an ephemeral port (tests) |
| `DSH_SERVER_HOST` | `0.0.0.0` | bind address |
| `DSH_SERVER_TRUSTED_PROXY_IPS` | empty | comma-separated peer IPs allowed to send `X-Forwarded-For`; must contain exactly one address per request |
| `DSH_SETUP_KEY` | random | one-time key for `/setup`; printed at boot when generated |
| `DSH_BREAK_GLASS_PASSWORD` | unset | set to `1` to keep password login usable in SSO-only mode |
| `DSH_SERVER_LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error`/`silent` |

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
