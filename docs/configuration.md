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

## Relay budget (boot-time)

Relayed bytes are capped in aggregate so one account cannot starve the process, the uplink or the
database's neighbours.

| Setting | Default |
|---|---|
| `DSH_SERVER_RELAY_BYTES_PER_SECOND` | `5242880` (5 MiB/s) |

Ordinary accounts share that budget **by weight**, and the weight falls as an account occupies more of
it:

- `rate` is the account's smoothed relay throughput (roughly a one-second window);
- `weight = 1 / (1 + rate / budget)` — an idle account weighs 1, one saturating the budget weighs ½;
- `share = budget × weight / Σ weights`, so shares always add up to the budget and a sole active
  account still gets all of it;
- each account holds a bucket of one second of its share (minimum 64 KiB), refilled at that share.

An account that overruns its own share does not get disconnected on the first frame: relay frames
are held in a per-device FIFO (32 frames / 256 KiB, order preserved) and released as credit
returns, so a burst is smoothed instead of cut. Frames are never dropped — a missing relay frame
breaks the peer's counter ordering. A queue that overflows, or that cannot move for 15 seconds,
closes that connection with `RATE_LIMITED` and logs `relay_queue_stalled`. Idle time restores the
weight within about half a minute. Administrator accounts are exempt. `0` disables the whole
mechanism, which is reasonable for a single-user deployment.

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

STUN defaults to `stun:stun.cloudflare.com:3478` when unset. `DSH_SERVER_STUN_URLS` and `DSH_SERVER_TURN_URLS` are handed to clients through
`GET /api/v1/turn/credentials`. TURN accepts either a coturn REST shared secret
(`DSH_SERVER_TURN_SECRET`) or a static username/password pair. Empty values keep relay-only behaviour.
