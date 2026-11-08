# API

All JSON endpoints return `{ error: { code, message, requestId, retryable } }` on failure.
Web sessions use the `dsh_session` cookie; device APIs use `Authorization: Bearer <accessToken>`.

## Public / session

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz`, `/ready` | liveness / database readiness |
| GET/POST | `/setup`, `/api/v1/setup` | first-run bootstrap (one-time key) |
| POST | `/api/v1/auth/login` | password login, or device-key ticket |
| POST | `/api/v1/auth/device-login` | device enrolment with key (or password when SSO-only is off) |
| POST | `/api/v1/auth/logout` | clear session |
| GET | `/api/v1/auth/me` | current session user |
| POST | `/api/v1/auth/register/start` \| `/complete` | email registration |
| POST | `/api/v1/auth/password/reset/start` \| `/complete` | password reset by email code |
| POST | `/api/v1/auth/password/change` | self-service change (needs current password) |
| POST | `/api/v1/auth/email/change/start` \| `/complete` | change mailbox with two codes |
| GET | `/api/v1/auth/oidc/start` \| `/callback` | OIDC login |
| POST | `/api/v1/auth/oidc/bind/start` \| `/bind/complete` \| `/unbind` | OIDC binding |

## Device

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/refresh` | rotate refresh token |
| POST | `/api/v1/devices/register` | enrol a device (ticket only) |
| GET | `/api/v1/devices` | same-tenant hosts |
| GET | `/api/v1/devices/:id` \| `/presence` | device details (404 for other tenants) |
| POST | `/api/v1/devices/:id/name` | rename |
| DELETE | `/api/v1/devices/self` | revoke own device |
| GET | `/api/v1/me`, `/api/v1/account/devices` | current device / tenant devices |
| GET | `/api/v1/turn/credentials?connection_id=` | short-lived ICE credentials |

## Admin (session, role=admin)

| Method | Path | Purpose |
|---|---|---|
| GET/PUT | `/api/v1/admin/settings` | runtime configuration (secrets masked) |
| GET/POST | `/api/v1/admin/users` | list / create |
| PATCH/DELETE | `/api/v1/admin/users/:id` | disable, change role or password, delete |
| GET/POST | `/api/v1/admin/users/:id/device-keys` | list / issue device keys |
| DELETE | `/api/v1/admin/device-keys/:id` | revoke a key and its devices |
| GET/DELETE | `/api/v1/admin/devices[/:id]` | all devices / revoke one |
| GET | `/api/v1/admin/audit?limit=` | recent audit entries |
| POST | `/api/v1/admin/smtp/test` | send a test mail |

## WebSocket

`/ws/v1/connect` carries the control channel: `hello`, `connect.request`, `relay`,
`secure.handshake`, WebRTC signalling and relay fallback frames. Connections must authenticate with a
device access token and are scoped to their tenant.
