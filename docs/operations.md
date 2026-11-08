# Operations

## Deploy

```bash
cp server/.env.example .env
# POSTGRES_PASSWORD, DSH_SERVER_PUBLIC_URL
docker compose up -d --build
```

The server listens on `127.0.0.1:8080`; put a reverse proxy in front for TLS. The proxy must:

- forward `/ws/v1/connect` with `Upgrade`/`Connection` headers and an idle timeout above 75 s;
- pass the client IP in a single `X-Forwarded-For` value if you set `DSH_SERVER_TRUSTED_PROXY_IPS`;
- keep `DSH_SERVER_PUBLIC_URL` equal to the browser-visible origin (scheme, host, port).

## Bootstrap

On first boot the server generates a setup key and prints it:

```text
============================================================
 首次初始化密钥（仅本次有效，也可用 DSH_SETUP_KEY 覆盖）:
   <key>
 打开 https://your.host/setup?key=<key> 创建管理员
============================================================
```

The key is single-use and deleted once the administrator exists. Until then every page redirects to
`/setup`. The administrator account must use an email address — it is the login name. The setup form also asks for the
public origin; it can be changed later under **服务地址** in the admin console.

## Single instance

Device and token caches live in process memory. The server takes a PostgreSQL advisory lock at startup
and refuses to run as a second writer (`503 INSTANCE_LOCKED`). Run exactly one replica.

## Backup and restore

```bash
docker compose exec -T postgres pg_dump -U dsh dsh | gzip > dsh-$(date +%F).sql.gz
```

The dump contains OIDC client secrets, SMTP passwords and the device-key digests — store it like a key.

## Upgrade

Pull the new image and restart. `server/src/schema.ts` is declarative and converges on boot; there is no
migration version table. Back up before upgrading, and keep the server stopped while restoring.

## Observability

- `/healthz` — process alive.
- `/ready` — database reachable.
- `audit_log` — registration, login failures, password/email changes, OIDC binding, key rotation and
  device revocation.

## Browser check

`server/scripts/browser-check.mjs` drives a real Chromium through bootstrap, login,
the command palette, the admin console and a 360px viewport. It is not part of CI
(it needs a browser build); run it against a disposable database:

```bash
pnpm build
createdb dshbrowser
DATABASE_URL=postgres://dsh:dsh@127.0.0.1:5432/dshbrowser node server/scripts/browser-check.mjs
```

Screenshots land in `./browser-shots/`.

## Protocol walkthrough

`server/scripts/protocol-walkthrough.mjs` drives two simulated peers through the whole
control plane against a real server: hello, heartbeat, connect request/accept, the 120 s
signalling window, the Noise handshake gate, ordered relay counters, replay rejection,
transport selection, presence, cross-tenant isolation, refresh rotation and key revocation.
CI runs it on a fresh database after the store tests.

```bash
pnpm build
DATABASE_URL=postgres://dsh:dsh@127.0.0.1:5432/dshproto node server/scripts/protocol-walkthrough.mjs
```

## IdP + SMTP walkthrough

`server/scripts/idp-smtp-walkthrough.mjs` starts a real OIDC provider (`oidc-provider`, one
RS256 client and one ES256 client) and a real SMTP listener, then walks registration codes,
password reset, first-login provisioning, binding, SSO-only mode and EC-signed ID tokens in a
headless browser. Its dependencies are optional and installed ad hoc:

```bash
npm i --no-save oidc-provider smtp-server playwright-core jose
pnpm build
DATABASE_URL=postgres://dsh:dsh@127.0.0.1:5432/dshidp node server/scripts/idp-smtp-walkthrough.mjs
```

## Full user journey

`server/scripts/user-journey-walkthrough.mjs` plays a normal user from zero: bootstrap,
self-registration with a real SMTP code, password and mailbox changes, device keys
(create / reveal / revoke), two enrolled devices, a real control-plane session with a
Noise handshake and relay, OIDC binding and login, admin disable/enable, SSO-only mode and
finally account deletion — 40 checks against a real OIDC provider, SMTP sink and Chromium.

```bash
npm i --no-save oidc-provider smtp-server playwright-core jose
pnpm build
DATABASE_URL=postgres://dsh:dsh@127.0.0.1:5432/dshjourney node server/scripts/user-journey-walkthrough.mjs
```
