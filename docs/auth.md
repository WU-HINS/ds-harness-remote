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
- Web sessions can never mint device tokens: registration requires a ticket.
- While SSO-only is off, the account password also works as a device secret. Those devices carry no key
  binding, are listed as `(未绑定密钥)`, and are revoked when the password changes.

Revoking a key disconnects and revokes every device enrolled with it. Revocation is terminal.

## SSO-only matrix

| Action | Off | On |
|---|---|---|
| password login | allowed | `403` |
| password reset / change | allowed | `403` |
| device login with password | allowed | `401` |
| device login with key | allowed | allowed |
| unbind OIDC | allowed | `403` |
| self-registration | allowed | `403` |
