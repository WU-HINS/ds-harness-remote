# DSH Remote Server

Self-hosted, multi-user server for [DeepSeek Harness](https://github.com/liguobao/ds-harness-remote) remote access.
It coordinates connections between a Host (your DSH desktop) and remote clients, keeps accounts and devices,
and relays end-to-end-encrypted traffic it cannot read.

This repository is **server-only**: the desktop plugin, mobile clients and browser extension live in other projects.

## What it does

- **Accounts** — email + password registration with SMTP verification codes, password reset, email change.
- **OIDC** — discovery-based single sign-on with RSA and EC keys, first-login binding rules, SSO-only mode.
- **Devices** — per-user virtual device usernames, multiple revocable device keys, per-key device counts.
- **Connections** — WebSocket signalling and encrypted relay between Host and clients, tenant-isolated.
- **Admin console** — users, device keys, devices, audit log, OIDC and SMTP configuration, login background.
- **PostgreSQL** — declarative schema, applied idempotently on boot.

## Architecture

```text
client ──HTTPS/WS──> server  <──WS── host (DSH desktop)
                        │
                        ├── PostgreSQL (accounts, devices, tokens, audit)
                        └── SMTP (verification codes)
```

The server never sees plaintext Harness traffic: clients and hosts already share an end-to-end
encrypted channel; the server forwards ciphertext and connection metadata only.

## Quick start

```bash
git clone https://github.com/WU-HINS/ds-harness-remote.git
cd ds-harness-remote
cp server/.env.example .env          # set POSTGRES_PASSWORD and DSH_SERVER_PUBLIC_URL
docker compose up -d --build
docker compose logs server | grep -A4 "初始化密钥"
```

Open `https://your.host/setup?key=<key>` and create the first administrator. The setup key is
one-time: it is deleted as soon as the admin exists. Set `DSH_SETUP_KEY` to pin it yourself.

Without Docker:

```bash
corepack enable && pnpm install
pnpm build
DATABASE_URL=postgres://dsh:...@127.0.0.1:5432/dsh \
DSH_SERVER_PUBLIC_URL=https://your.host \
pnpm start
```

## Accounts and devices

| Identity | Credential | Used for |
|---|---|---|
| Web account | email + password, or OIDC | admin console, self-service |
| Device | virtual username `dev-xxxxxxxx` + device key | enrolling clients |
| Password as device secret | email + password | device login while SSO-only is **off** |

Each user can hold several device keys. Revoking a key immediately disconnects every device enrolled
with it; revocation is terminal — the same device id cannot re-enrol.

Administrators can turn on **SSO-only**, which disables password login, password reset, self-service
password change, OIDC unbinding, and password-based device login. `DSH_BREAK_GLASS_PASSWORD=1` keeps
password login available for lockout recovery.

## Configuration

Everything is environment-driven at boot and overridable at runtime from the admin console
(OIDC, SMTP, rate limits, ICE, login background). See [docs/configuration.md](docs/configuration.md).

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `DSH_SERVER_PUBLIC_URL` | unset | optional boot default; the admin console value wins (set on `/setup`) |
| `DSH_SERVER_PORT` / `DSH_SERVER_HOST` | `8080` / `0.0.0.0` | listen address |
| `DSH_SERVER_TRUSTED_PROXY_IPS` | — | extra public proxies allowed to supply `X-Real-IP`/`X-Forwarded-For` (loopback and private ranges are trusted by default) |
| `DSH_SETUP_KEY` | random | one-time bootstrap key |
| `DSH_SMTP_*` | — | required for self-registration and password reset |
| `DSH_OIDC_*` | — | optional IdP bootstrap (also configurable in the console) |
| `DSH_SERVER_STUN_URLS` / `DSH_SERVER_TURN_URLS` | — | handed to clients for P2P/TURN |

## Operations

- **Single writer.** Device and token caches are in-process; the server takes a PostgreSQL advisory
  lock and refuses to start as a second instance.
- **Upgrades.** Schema is declarative; a new image converges the database on boot. Back up first.
- **Backups.** `pg_dump` is enough. The database also holds OIDC/SMTP secrets — treat dumps as credentials.

See [docs/operations.md](docs/operations.md).

## Development

```bash
pnpm install
pnpm build          # protocol + server
pnpm -r check       # type check
pnpm test           # 161 assertions on pg-mem, no database needed
pnpm test:pg        # same suite against real PostgreSQL (needs DATABASE_URL)
```

Layout: `server/src` (HTTP, gateway, store, auth), `server/tests` (smoke suites), `packages/protocol`.

## Documentation

- [Configuration](docs/configuration.md)
- [Authentication](docs/auth.md)
- [HTTP/WS API](docs/api.md)
- [Operations](docs/operations.md)
- [Security model](docs/security.md)

## License

MIT
