# Authentication

## Accounts

Accounts are identified by email. Self-registration verifies the mailbox with a code; admin-created
accounts are marked verified immediately. Passwords are stored with scrypt.

## Web login

`POST /api/v1/auth/login` with `{ email, password }` returns a session cookie
(`HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS) and a bearer token for API use.
Disabled accounts and unverified emails are refused. In SSO-only mode password login returns `403 SSO_ONLY`.

## OIDC

`GET /api/v1/auth/oidc/start` redirects to the IdP with PKCE (S256), `state` and `nonce`;
the state is bound to an `HttpOnly` cookie. The callback verifies signature, issuer, audience,
nonce, `azp` (multi-audience tokens) and that `discovery.issuer` matches the configured issuer.

First login is decided by the mailbox:

| Case | Behaviour |
|---|---|
| A. mailbox unknown | create the account and bind it (`autoProvision`) |
| B. mailbox known, unbound | verify with password or email code when `bindRequireVerification`; otherwise bind directly |
| C. mailbox bound to this subject | sign in |
| D. mailbox bound to another subject | `/login?error=oidc-conflict`, no overwrite |

Binding is conditional (`WHERE oidc_subject IS NULL`), so concurrent callbacks cannot overwrite a binding.
Signed-in users can bind from the account page; unbinding is refused in SSO-only mode.

## Device credentials

Each user has one virtual device username (`dev-xxxxxxxx`) and any number of device keys.

- `POST /api/v1/auth/device-login` with `{ username, deviceKey, device }` registers and enrols in one step.
- `POST /api/v1/auth/login` with the device key returns a short-lived registration ticket, which
  `POST /api/v1/devices/register` exchanges for access/refresh tokens.
- A web/account token may enrol a device (`POST /api/v1/devices/register` with an account
  token), which is what the original clients expect. Under SSO-only this is refused, the
  same way a password may not act as a device secret.
- While SSO-only is off, the account password also works as a device secret. Those devices carry no key
  binding, are listed as `(未绑定密钥)`, and are revoked when the password changes.

Keys are owned by the account, not by the console: users list, create, reveal, rotate and revoke
them on **我的账户**, and the plaintext is stored encrypted (AES-256-GCM) so it can be shown again.
Administrators cannot read or mint another user's keys, cannot reset a password, and cannot
disable or delete an administrator account at all.

Revoking a key disconnects and revokes every device enrolled with it. Revocation is terminal.
Rotating a key re-keys it in place: the id and device bindings stay, the old secret stops working
immediately, the new plaintext is stored sealed, and the action is audited as `device_key.rotated`.
This is the supported path for a legacy key whose original plaintext was never sealed.

## SSO-only matrix

| Action | Off | On |
|---|---|---|
| password login | allowed | `403` |
| password reset / change | allowed | `403` |
| device login with password | allowed | allowed (device credential, not web) |
| device login with key | allowed | allowed |
| unbind OIDC | allowed | `403` |
| self-registration | allowed | `403` |

## Client compatibility

The original ds-harness clients (`dsh go`, desktop plugin) treat the token returned by
`POST /api/v1/auth/login` as an account bearer and then enrol devices with it. The server
keeps that contract, additively:

| Client call | Behaviour |
|---|---|
| `GET /api/v1/auth/me` with `Bearer <account token>` | accepted (cookie or bearer) and returns `account`, `isAdmin`, `user` |
| `POST /api/v1/devices/register` with an account token | accepted, except under SSO-only |
| `GET /api/v1/auth/oauth/providers` | returns `{ items: [] }` instead of 404 |
| `GET /health` | returns `{ status: "ok" }` |

Everything added later (OIDC, device keys owned by the user, admin protections) is layered on
top: no legacy endpoint was removed or repurposed.
