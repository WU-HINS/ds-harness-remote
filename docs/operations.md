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

The key is single-use and deleted once the administrator exists. The setup form also asks for the
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
