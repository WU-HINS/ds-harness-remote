# API

Every JSON endpoint answers `{ "error": { "code", "message", "requestId", "retryable" } }` on failure and the
success shape documented below on success. Web sessions use the `dsh_session` cookie; device endpoints use
`Authorization: Bearer <accessToken>`. All paths live under the single prefix `/api/v1` except the probes below.

## Probes and pages

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | liveness, never touches the database |
| GET | `/ready` | database readiness; 503 until the declarative schema has converged |
| GET | `/setup` | first-run page (redirect target while no administrator exists) |
| GET | `/login` `/register` `/forgot` | server-rendered pages |
| GET | `/auth/oidc/bind` | OIDC binding page opened from the device flow |

## Public / session

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/setup` | first-run bootstrap, authorised by the one-time setup key |
| POST | `/api/v1/auth/login` | password login, or a device-key ticket exchange |
| POST | `/api/v1/auth/device-login` | device enrolment with a device key (or the account password when SSO-only is off) |
| POST | `/api/v1/auth/logout` | clear the session cookie |
| GET | `/api/v1/auth/me` | current session user |
| POST | `/api/v1/auth/register/start` `/api/v1/auth/register/complete` | email registration |
| POST | `/api/v1/auth/password/reset/start` `/api/v1/auth/password/reset/complete` | password reset by email code |
| POST | `/api/v1/auth/password/change` | self-service change, requires the current password |
| POST | `/api/v1/auth/email/change/start` `/api/v1/auth/email/change/complete` | mailbox change with two codes |
| GET | `/api/v1/auth/oidc/start` `/api/v1/auth/oidc/callback` | OIDC authorisation code flow |
| POST | `/api/v1/auth/oidc/bind/start` `/api/v1/auth/oidc/bind/complete` `/api/v1/auth/oidc/unbind` | OIDC identity binding |

### Legacy OAuth probes

`/api/v1/auth/oauth/providers`, `/api/v1/auth/oauth/status` and `/api/v1/auth/oauth/github/status` answer with a
fixed "not configured" payload so that older clients get an explicit answer instead of `404`. They carry no
credential flow, accept no input and are not part of the supported surface.

## Device

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/refresh` | rotate a device refresh token |
| POST | `/api/v1/devices/register` | enrol a device (registration ticket, or an account session when SSO-only is off) |
| GET | `/api/v1/devices` | hosts in the caller's tenant |
| GET | `/api/v1/devices/:id` `/api/v1/devices/:id/presence` | device details; another tenant gets 404, not 403 |
| POST | `/api/v1/devices/:id/name` | rename a device |
| DELETE | `/api/v1/devices/self` | revoke the calling device |
| GET | `/api/v1/me` | the calling device descriptor |
| GET | `/api/v1/account/devices` | tenant devices for a web session or a device token |
| PATCH | `/api/v1/account/devices/:id` | rename a device owned by the caller |
| DELETE | `/api/v1/account/devices/:id` | revoke a device owned by the caller |
| GET | `/api/v1/account/device-keys` | list the caller's device keys |
| POST | `/api/v1/account/device-keys` | issue a device key, plaintext returned once |
| DELETE | `/api/v1/account/device-keys/:id` | revoke a key and every device enrolled with it |
| GET | `/api/v1/turn/credentials` | short-lived ICE credentials, requires `connection_id` |

Device-key rows carry `revealable`. A live key the owner can echo back returns `key` with
`revealable: true`; a revoked key, or a legacy key created before the sealed copy existed, returns
`revealable: false` and no `key` — clients must say so instead of rendering an empty cell.

## Admin (session, role=admin)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/admin/settings` | runtime configuration, secrets masked |
| PUT | `/api/v1/admin/settings` | update runtime configuration, validated before persistence |
| GET | `/api/v1/admin/users` | list accounts |
| POST | `/api/v1/admin/users` | create an account |
| PATCH | `/api/v1/admin/users/:id` | enable / disable an account |
| DELETE | `/api/v1/admin/users/:id` | delete an account |
| GET | `/api/v1/admin/devices` | every device across tenants |
| DELETE | `/api/v1/admin/devices/:id` | revoke one device |
| GET | `/api/v1/admin/audit` | recent audit entries, `limit` capped at 200 |
| POST | `/api/v1/admin/smtp/test` | send a test mail with the current SMTP settings |

## WebSocket

`/ws/v1/connect` carries the control channel: `hello`, `connect.request`, `relay`, `secure.handshake`,
WebRTC signalling and relay fallback frames. A connection must authenticate with a device access token and is
scoped to its tenant.
