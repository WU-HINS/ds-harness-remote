# Security model

## What the server sees

| Visible | Not visible |
|---|---|
| account email, device names, public keys, presence | Harness prompts, replies, tool output |
| connection timing, transport (LAN/P2P/TURN/relay), frame sizes | workspace paths or file contents |
| OIDC subject, audit events | Noise session keys |

Business traffic is end-to-end encrypted between client and host; the server forwards ciphertext.
Relay frames are never written to logs or the database.

## Credential handling

- Passwords: scrypt with per-user salt.
- Session and device tokens: only SHA-256 digests at rest; refresh rotation with a 2-minute recovery window
  and device revocation on replay.
- Verification codes: HMAC-SHA256 with a server-held key, single use, 5 attempts.
- Device keys: only digests stored; plaintext shown once at creation.

## Trust boundaries

- **The server is the account authority.** Anyone who controls the database or the process can add
  devices, reset passwords and read metadata. Run it where you trust the operator.
- **Same-tenant isolation is enforced server-side**: devices, presence, terminal and relay links are
  scoped to the owning user; foreign ids return 404, not 403.
- **Reverse proxy limits.** Rate limiting is per client IP. Behind a proxy without
  `DSH_SERVER_TRUSTED_PROXY_IPS` every anonymous request shares one bucket.
- **CSRF.** State-changing requests require a same-origin `Origin` or are blocked by
  `Sec-Fetch-Site: cross-site`; the OIDC callback is exempt (it is a cross-site navigation) and instead
  relies on the state cookie.

## Hardening checklist

1. Serve only over HTTPS; keep `DSH_SERVER_PUBLIC_URL` on the public origin.
2. Set `DSH_SERVER_TRUSTED_PROXY_IPS` to your proxy's address.
3. Restrict the Postgres port to the server host.
4. Configure SMTP; otherwise self-registration stays closed.
5. Turn on SSO-only once OIDC works, and keep `DSH_BREAK_GLASS_PASSWORD` documented offline.
