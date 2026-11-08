#!/usr/bin/env node
// End-to-end IdP + SMTP walkthrough: a real OIDC provider (oidc-provider, RS256 and
// ES256 clients) and a real SMTP listener drive registration, password reset,
// first-login provisioning, account binding, SSO-only mode and EC-signed tokens.
//
// Optional dependencies, not part of the package (install ad hoc):
//   npm i --no-save oidc-provider smtp-server playwright-core jose
//   DATABASE_URL=postgres://dsh:dsh@127.0.0.1:5432/dshidp node server/scripts/idp-smtp-walkthrough.mjs
//
// The server under test must be built first (pnpm build).

import Provider from 'oidc-provider'
import { SMTPServer } from 'smtp-server'
import { chromium } from 'playwright-core'
import { generateKeyPair, exportJWK } from 'jose'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PORT = '4620'
const BASE = 'http://127.0.0.1:' + PORT
const ISSUER = 'http://127.0.0.1:9090'
if (!process.env.DATABASE_URL) throw new Error('set DATABASE_URL to a disposable database')

// ── SMTP sink ───────────────────────────────────────────────────────────────
const inbox = []
const smtp = new SMTPServer({
  authOptional: true, disabledCommands: ['STARTTLS'], logger: false, onData(stream, session, cb) {
    let raw = ''; stream.on('data', c => raw += c); stream.on('end', () => { inbox.push(raw); cb() })
  },
})
await new Promise(r => smtp.listen(2525, '127.0.0.1', r))

// ── OIDC provider (RS256 + ES256) ───────────────────────────────────────────
const rs = await generateKeyPair('RS256', { extractable: true })
const es = await generateKeyPair('ES256', { extractable: true })
const provider = new Provider(ISSUER, {
  jwks: { keys: [
    { ...(await exportJWK(rs.privateKey)), kid: 'rs1', alg: 'RS256', use: 'sig' },
    { ...(await exportJWK(es.privateKey)), kid: 'es1', alg: 'ES256', use: 'sig' },
  ] },
  clients: [
    { client_id: 'dsh-rs', client_secret: 'rs-secret', redirect_uris: [BASE + '/api/v1/auth/oidc/callback'], grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'client_secret_basic' },
    { client_id: 'dsh-es', client_secret: 'es-secret', redirect_uris: [BASE + '/api/v1/auth/oidc/callback'], grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'client_secret_post', id_token_signed_response_alg: 'ES256' },
  ],
  claims: { openid: ['sub'], email: ['email', 'email_verified'] },
  features: { devInteractions: { enabled: true } },
  findAccount: async (ctx, id) => ({ accountId: id, async claims() { return { sub: id, email: id, email_verified: true } } }),
})
provider.listen(9090)

// ── our server ──────────────────────────────────────────────────────────────
process.env.DSH_SERVER_PORT = PORT
process.env.DSH_SERVER_HOST = '127.0.0.1'
process.env.DSH_SERVER_PUBLIC_URL = BASE
process.env.DSH_SETUP_KEY = 'idp-setup-key'
process.env.DSH_SERVER_LOG_LEVEL = 'error'
process.env.DSH_SMTP_HOST = '127.0.0.1'
process.env.DSH_SMTP_PORT = '2525'
process.env.DSH_SMTP_SECURE = '0'
process.env.DSH_SMTP_FROM = 'DSH Remote <no-reply@example.com>'
process.env.DSH_OIDC_ISSUER = ISSUER
process.env.DSH_OIDC_CLIENT_ID = 'dsh-rs'
process.env.DSH_OIDC_CLIENT_SECRET = 'rs-secret'
const here = dirname(fileURLToPath(import.meta.url))
await import(pathToFileURL(join(here, '..', 'dist', 'main.js')).href)

for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break } catch {} await new Promise(r => setTimeout(r, 200)) }

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' :: ' + d : '')) }
const api = async (p, o = {}) => {
  const r = await fetch(BASE + p, { ...o, headers: { 'content-type': 'application/json', ...(o.headers ?? {}) } })
  const t = await r.text(); let b; try { b = JSON.parse(t) } catch { b = t }
  return { status: r.status, body: b, headers: r.headers }
}
const bodyText = (raw) => {
  const split = raw.indexOf('\r\n\r\n')
  const body = (split >= 0 ? raw.slice(split + 4) : raw).replace(/\s+/g, '')
  try { return Buffer.from(body, 'base64').toString('utf8') } catch { return body }
}
const codeFrom = (raw) => { const m = /(\d{6})/.exec(bodyText(raw)); return m ? m[1] : undefined }
const lastMail = async (needle) => {
  for (let i = 0; i < 40; i++) {
    const hit = [...inbox].reverse().find(m => m.includes(needle))
    if (hit) return hit
    await new Promise(r => setTimeout(r, 150))
  }
  return ''
}

const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--no-sandbox'] })
const ctx = await browser.newContext()
const page = await ctx.newPage()

// bootstrap admin
const setup = await api('/api/v1/setup', { method: 'POST', body: JSON.stringify({ key: 'idp-setup-key', username: 'boss@example.com', password: 'boss-password-123' }) })
check('bootstrap admin', setup.status === 201, String(setup.status))
const adminCookie = (setup.headers.get('set-cookie') ?? '').split(';')[0]

// ── A. self registration through the UI + SMTP code ────────────────────────
inbox.length = 0
await page.goto(BASE + '/register')
await page.fill('#reg-email', 'alice@example.com')
await page.click('#reg-send')
const regMail = await lastMail('alice@example.com')
const regCode = codeFrom(regMail)
check('registration email delivered', Boolean(regCode), regMail ? 'smtp message captured' : 'no message')
await page.fill('#reg-code', regCode)
await page.fill('#reg-pass', 'alice-password-123')
await page.click('#reg button[type=submit]')
await page.waitForURL(BASE + '/', { timeout: 10000 })
check('registration completes and signs in', page.url() === BASE + '/')

// ── B. password reset through SMTP ─────────────────────────────────────────
await ctx.clearCookies()
inbox.length = 0
await page.goto(BASE + '/forgot')
await page.fill('#fg-email', 'alice@example.com')
await page.click('#fg-send')
const resetMail = await lastMail('alice@example.com')
const resetCode = codeFrom(resetMail)
check('reset email delivered', Boolean(resetCode))
await page.fill('#fg-code', resetCode)
await page.fill('#fg-pass', 'alice-password-456')
await page.click('#fg button[type=submit]')
await page.waitForTimeout(800)
const relogin = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ username: 'alice@example.com', password: 'alice-password-456' }) })
check('password reset takes effect', relogin.status === 200, String(relogin.status))

// ── C. OIDC first login provisions an account ──────────────────────────────
const oidcLogin = async (email, opts = {}) => {
  await page.goto(BASE + '/api/v1/auth/oidc/start')
  await page.waitForURL(u => u.href.includes('/interaction/'), { timeout: 15000 })
  await page.fill('input[name=login]', email)
  await page.fill('input[name=password]', 'anything')
  await page.click('button[type=submit]')
  await page.waitForLoadState('domcontentloaded')
  if (page.url().includes('/interaction/')) {
    const btn = page.locator('button[type=submit]').first()
    if (await btn.count()) { await btn.click().catch(() => {}) }
    await page.waitForLoadState('domcontentloaded')
  }
  await page.waitForURL(u => !u.href.startsWith(ISSUER), { timeout: 15000 })
  return page.url()
}

await ctx.clearCookies()
const afterFirst = await oidcLogin('carol@example.com')
check('OIDC first login lands on home', afterFirst === BASE + '/', afterFirst)
const carolUsers = await api('/api/v1/admin/users', { headers: { cookie: adminCookie } })
// OIDC provisioning uses the mailbox local part as the username.
const carol = carolUsers.body.users.find(u => u.username === 'carol')
check('OIDC auto-provisioned the account', Boolean(carol), JSON.stringify(carolUsers.body.users.map(u => u.username)))

// ── D. second login with the same subject ──────────────────────────────────
await ctx.clearCookies()
const afterSecond = await oidcLogin('carol@example.com')
check('OIDC second login signs in', afterSecond === BASE + '/', afterSecond)
const carolAgain = (await api('/api/v1/admin/users', { headers: { cookie: adminCookie } })).body.users.filter(u => u.username === 'carol')
check('no duplicate account created', carolAgain.length === 1, String(carolAgain.length))

// ── E. binding an existing account requires verification ───────────────────
await api('/api/v1/admin/users', { method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({ username: 'dave@example.com', password: 'dave-password-123', role: 'user' }) })
await ctx.clearCookies()
const bindUrl = await oidcLogin('dave@example.com')
check('unbound mailbox redirects to binding', bindUrl.includes('/auth/oidc/bind'), bindUrl)
const ticket = new URL(bindUrl).searchParams.get('ticket')
await page.fill('#bind-pass', 'dave-password-123')
await page.click('#bind-submit')
await page.waitForURL(BASE + '/', { timeout: 10000 })
check('binding with the password signs in', page.url() === BASE + '/')

// ── F. only-SSO mode ───────────────────────────────────────────────────────
const ssoOn = await api('/api/v1/admin/settings', { method: 'PUT', headers: { cookie: adminCookie }, body: JSON.stringify({ oidc: { enabled: true, onlySso: true } }) })
check('only-SSO enabled', ssoOn.status === 200, String(ssoOn.status))
const pwLogin = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ username: 'alice@example.com', password: 'alice-password-456' }) })
check('password login refused under only-SSO', pwLogin.status === 403 && pwLogin.body.error.code === 'SSO_ONLY', String(pwLogin.status))
await ctx.clearCookies()
const ssoUrl = await oidcLogin('erin@example.com')
check('OIDC still signs in under only-SSO', ssoUrl === BASE + '/', ssoUrl)

// ── G. ES256 client (EC keys, client_secret_post) ──────────────────────────
const esClient = await api('/api/v1/admin/settings', { method: 'PUT', headers: { cookie: adminCookie }, body: JSON.stringify({ oidc: { clientId: 'dsh-es', clientSecret: 'es-secret' } }) })
check('switched to the ES256 client', esClient.status === 200, String(esClient.status))
await ctx.clearCookies()
const esUrl = await oidcLogin('frank@example.com')
check('EC-signed ID token accepted', esUrl === BASE + '/', esUrl)

await browser.close()
console.log('\n' + pass + '/' + (pass + fail) + ' checks passed')
process.exit(fail ? 1 : 0)
