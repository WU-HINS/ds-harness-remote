#!/usr/bin/env node
// Full lifecycle walkthrough as a normal user: bootstrap, self-registration with a
// real SMTP code, password and email changes, device keys (create/reveal/revoke),
// device enrolment, a real control-plane session, OIDC binding, admin disable and
// finally account deletion. Runs a real OIDC provider, a real SMTP sink and Chromium.
//
// Optional dependencies (install ad hoc):
//   npm i --no-save oidc-provider smtp-server playwright-core jose
//   pnpm build
//   DATABASE_URL=postgres://dsh:dsh@127.0.0.1:5432/dshjourney node server/scripts/user-journey-walkthrough.mjs

import Provider from 'oidc-provider'
import { SMTPServer } from 'smtp-server'
import { chromium } from 'playwright-core'
import { generateKeyPair, exportJWK } from 'jose'
import { WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PORT = '4640'
const BASE = 'http://127.0.0.1:' + PORT
const ISSUER = 'http://127.0.0.1:9091'
const SETUP_KEY = 'journey-key'
if (!process.env.DATABASE_URL) throw new Error('set DATABASE_URL to a disposable database')

// ── SMTP sink ───────────────────────────────────────────────────────────────
const inbox = []
const smtp = new SMTPServer({
  authOptional: true, disabledCommands: ['STARTTLS'], logger: false,
  onData(stream, session, cb) { let raw = ''; stream.on('data', c => raw += c); stream.on('end', () => { inbox.push(raw); cb() }) },
})
await new Promise(r => smtp.listen(2527, '127.0.0.1', r))

// ── OIDC provider ───────────────────────────────────────────────────────────
const rs = await generateKeyPair('RS256', { extractable: true })
const provider = new Provider(ISSUER, {
  jwks: { keys: [{ ...(await exportJWK(rs.privateKey)), kid: 'rs1', alg: 'RS256', use: 'sig' }] },
  clients: [{ client_id: 'journey', client_secret: 'journey-secret', redirect_uris: [BASE + '/api/v1/auth/oidc/callback'], grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'client_secret_basic' }],
  claims: { openid: ['sub'], email: ['email', 'email_verified'] },
  features: { devInteractions: { enabled: true } },
  findAccount: async (ctx, id) => ({ accountId: id, async claims() { return { sub: id, email: id, email_verified: true } } }),
})
provider.listen(9091)

// ── server under test ───────────────────────────────────────────────────────
process.env.DSH_SERVER_PORT = PORT
process.env.DSH_SERVER_HOST = '127.0.0.1'
process.env.DSH_SERVER_PUBLIC_URL = BASE
process.env.DSH_SETUP_KEY = SETUP_KEY
process.env.DSH_SERVER_LOG_LEVEL = 'error'
process.env.DSH_SMTP_HOST = '127.0.0.1'
process.env.DSH_SMTP_PORT = '2527'
process.env.DSH_SMTP_SECURE = '0'
process.env.DSH_SMTP_FROM = 'DSH Remote <no-reply@example.com>'
process.env.DSH_OIDC_ISSUER = ISSUER
process.env.DSH_OIDC_CLIENT_ID = 'journey'
process.env.DSH_OIDC_CLIENT_SECRET = 'journey-secret'
const here = dirname(fileURLToPath(import.meta.url))
await import(pathToFileURL(join(here, '..', 'dist', 'main.js')).href)
for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break } catch {} await new Promise(r => setTimeout(r, 200)) }

let pass = 0, fail = 0
const step = (n) => console.log('\n── ' + n)
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')) }
const api = async (path, opts = {}) => {
  const res = await fetch(BASE + path, { redirect: 'manual', ...opts, headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) } })
  const text = await res.text(); let body; try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body, headers: res.headers }
}
const cookieOf = (r) => (r.headers.get('set-cookie') ?? '').split(';')[0]
const bodyText = (raw) => {
  const split = raw.indexOf('\r\n\r\n')
  const body = (split >= 0 ? raw.slice(split + 4) : raw).replace(/\s+/g, '')
  try { return Buffer.from(body, 'base64').toString('utf8') } catch { return body }
}
const codeFor = async (needle, since) => {
  for (let i = 0; i < 60; i++) {
    const hit = inbox.slice(since).reverse().find(m => m.includes(needle))
    if (hit) { const m = /(\d{6})/.exec(bodyText(hit)); if (m) return m[1] }
    await new Promise(r => setTimeout(r, 150))
  }
  return undefined
}

class Peer {
  constructor(label) { this.label = label; this.frames = []; this.waiters = [] }
  async open() {
    this.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws/v1/connect')
    this.ws.on('message', d => { let f; try { f = JSON.parse(String(d)) } catch { return } this.frames.push(f); this.flush() })
    await new Promise((res, rej) => { this.ws.once('open', res); this.ws.once('error', rej) })
  }
  flush() {
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i]
      const idx = this.frames.findIndex(f => f.type === w.type)
      if (idx >= 0) { const [f] = this.frames.splice(idx, 1); clearTimeout(w.timer); this.waiters.splice(i, 1); w.resolve(f) }
    }
  }
  send(type, payload) { this.ws.send(JSON.stringify({ v: 1, id: randomUUID(), type, timestamp: Date.now(), payload })) }
  next(type, ms = 5000) {
    const idx = this.frames.findIndex(f => f.type === type)
    if (idx >= 0) return Promise.resolve(this.frames.splice(idx, 1)[0])
    return new Promise((resolve, reject) => {
      const w = { type, resolve }
      w.timer = setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) this.waiters.splice(i, 1); reject(new Error('timeout ' + type + ' on ' + this.label)) }, ms)
      this.waiters.push(w)
    })
  }
  close() { try { this.ws.close() } catch {} }
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' })
const page = await ctx.newPage()
await page.route('**t.hinswu.top/**', r => r.abort())

// ── 0. bootstrap ────────────────────────────────────────────────────────────
step('0. 首次初始化（管理员）')
await page.goto(BASE + '/')
check('未初始化时跳转 /setup', page.url().endsWith('/setup'), page.url())
await page.fill('#setup-key', SETUP_KEY)
await page.fill('#setup-user', 'boss@example.com')
await page.fill('#setup-pass', 'boss-password-123')
await Promise.all([page.waitForURL(u => u.pathname === '/' || u.pathname === '/admin'), page.click('button[type=submit]')])
check('初始化后进入控制台', page.url() === BASE + '/' || page.url().endsWith('/admin'), page.url())
await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelectorAll('#rows .sk').length === 0, { timeout: 10000 }).catch(() => {})
check('管理员行显示受保护', (await page.locator('#rows').innerText()).includes('受保护'))
check('后台没有密钥卡片', (await page.locator('#key-label').count()) === 0)

// ── 1. self registration ────────────────────────────────────────────────────
step('1. 普通用户自助注册（真实 SMTP 验证码）')
await ctx.clearCookies()
await page.goto(BASE + '/register')
const mark = inbox.length
await page.fill('#reg-email', 'nina@example.com')
await page.click('#reg-send')
const regCode = await codeFor('nina@example.com', mark)
check('注册验证码邮件到达', Boolean(regCode))
await page.fill('#reg-code', regCode)
await page.fill('#reg-pass', 'nina-password-123')
await page.click('#reg button[type=submit]')
await page.waitForURL(BASE + '/', { timeout: 10000 })
check('注册完成并登录', page.url() === BASE + '/')

// ── 2. password + email change ──────────────────────────────────────────────
step('2. 用户自助改密码与换绑邮箱')
await page.goto(BASE + '/account', { waitUntil: 'domcontentloaded' })
await page.fill('#cur-pass', 'nina-password-123')
await page.fill('#new-pass', 'nina-password-456')
await page.click('#change-pw')
await page.waitForTimeout(600)
const oldPw = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nina@example.com', password: 'nina-password-123' }) })
const newPw = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nina@example.com', password: 'nina-password-456' }) })
check('旧密码失效', oldPw.status === 401, String(oldPw.status))
check('新密码可登录', newPw.status === 200, String(newPw.status))

const mark2 = inbox.length
await page.goto(BASE + '/account', { waitUntil: 'domcontentloaded' })
await page.fill('#new-email', 'nina2@example.com')
await page.click('#send-code')
const newCode = await codeFor('nina2@example.com', mark2)
const oldCode = await codeFor('nina@example.com', mark2)
check('换绑需要两封验证码', Boolean(newCode) && Boolean(oldCode))
await page.fill('#new-code', newCode)
await page.fill('#old-code', oldCode)
await page.click('#change-email')
await page.waitForTimeout(900)
const emailLogin = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nina2@example.com', password: 'nina-password-456' }) })
check('新邮箱可登录', emailLogin.status === 200, String(emailLogin.status))

// ── 3. device keys ──────────────────────────────────────────────────────────
step('3. 用户自管设备密钥（创建 / 回显 / 吊销）')
const ninaSession = cookieOf(await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nina2@example.com', password: 'nina-password-456' }) }))
await page.goto(BASE + '/account/keys', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelectorAll('#keys .sk').length === 0, { timeout: 10000 }).catch(() => {})
check('账户页拆分为三个子页', (await page.locator('.subtab').count()) === 3)
check('密钥页有搜索与筛选', (await page.locator('#q').count()) === 1 && (await page.locator('button[data-state]').count()) === 3)
check('默认密钥已存在', (await page.locator('#keys tr').count()) >= 1)
await page.fill('#key-label', 'Pixel')
await page.click('#create-key')
await page.waitForFunction(() => document.querySelectorAll('#keys button[data-a="reveal"]').length >= 2, { timeout: 8000 }).catch(() => {})
await page.locator('#keys button[data-a="reveal"]').first().click()
const revealed = (await page.locator('#keys .keymask').first().innerText()).trim()
check('密钥可在页面上回显', revealed.length > 20 && !revealed.includes('•'), revealed.slice(0, 8) + '…')

const keyList = await api('/api/v1/account/device-keys', { headers: { cookie: ninaSession } })
const keysByLabel = Object.fromEntries(keyList.body.keys.map(k => [k.label, k]))
check('密钥列表含默认与 Pixel', Boolean(keysByLabel.default?.key && keysByLabel.Pixel?.key))

// ── 4. devices ──────────────────────────────────────────────────────────────
step('4. 用密钥接入两台设备')
const enroll = async (key, device) => {
  const res = await api('/api/v1/auth/device-login', { method: 'POST', body: JSON.stringify({ username: keyList.body.keys[0] ? (await api('/api/v1/auth/me', { headers: { cookie: ninaSession } })).body.user.username : '', deviceKey: key, device }) })
  return res
}
const ninaMe = await api('/api/v1/auth/me', { headers: { cookie: ninaSession } })
const hostDev = { deviceId: 'nina-host-0001', name: 'Nina 的 Mac', role: 'host', platform: 'macos', version: '0.6.4', identityKey: 'nina-host-identity' }
const clientDev = { deviceId: 'nina-client-0001', name: 'Pixel', role: 'client', platform: 'android', version: '0.6.4', identityKey: 'nina-client-ident' }
// Devices authenticate with the virtual device username, not the account name.
const deviceUsername = ninaMe.body.deviceUsername
check('账户信息带设备用户名', /^dev-/.test(deviceUsername || ''), String(deviceUsername))
const hostLogin = await api('/api/v1/auth/device-login', { method: 'POST', body: JSON.stringify({ username: deviceUsername, deviceKey: keysByLabel.default.key, device: hostDev }) })
const clientLogin = await api('/api/v1/auth/device-login', { method: 'POST', body: JSON.stringify({ username: deviceUsername, deviceKey: keysByLabel.Pixel.key, device: clientDev }) })
check('Host 设备接入', hostLogin.status === 200, String(hostLogin.status))
check('Client 设备接入', clientLogin.status === 200, String(clientLogin.status))

const myDevices = await api('/api/v1/account/devices', { headers: { cookie: ninaSession } })
check('账户页可见两台设备', (myDevices.body.items || []).length === 2, String((myDevices.body.items || []).length))

await page.goto(BASE + '/account/devices', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelectorAll('#devices .sk').length === 0 && document.querySelectorAll('#devices tr').length > 1, { timeout: 10000 }).catch(() => {})
const deviceText = (await page.locator('#devices').innerText()).replace(/\s+/g, ' ')
check('设备列表显示系统与版本', deviceText.includes('macos') && deviceText.includes('0.6.4'), deviceText.slice(0, 90))
check('设备页有搜索与筛选', (await page.locator('#q').count()) === 1 && (await page.locator('button[data-role]').count()) === 3)
await page.fill('#q', 'Mac')
await page.waitForTimeout(200)
const filtered = (await page.locator('#devices').innerText()).replace(/\s+/g, ' ')
check('搜索可过滤设备', filtered.includes('Nina 的 Mac') && !filtered.includes('Pixel'), filtered.slice(0, 60))
await page.fill('#q', '')
const topbarText = (await page.locator('header.topbar').innerText()).replace(/\s+/g, ' ')
check('顶栏显示设备用户名', /dev-[a-z0-9]+/.test(topbarText), topbarText.slice(0, 60))
const devBox = await page.evaluate(() => {
  const el = document.querySelector('.who .dev-name')
  if (!el) return null
  const box = el.getBoundingClientRect(); const who = el.closest('.who').getBoundingClientRect()
  return { visible: box.width > 0, clipped: box.right > who.right + 1 }
})
check('顶栏设备用户名未被裁剪', Boolean(devBox && devBox.visible && !devBox.clipped), JSON.stringify(devBox))

// ── 5. control plane ────────────────────────────────────────────────────────
step('5. 一次真实远程连接（握手 + 双向密文）')
const host = new Peer('host'); await host.open()
const client = new Peer('client'); await client.open()
host.send('hello', { role: 'host', deviceId: hostDev.deviceId, accessToken: hostLogin.body.accessToken, protocols: [1], capabilities: ['transport.relay'], clientVersion: '0.6.4', harnessVersion: '0.9.1' })
await host.next('hello.ack')
client.send('hello', { role: 'client', deviceId: clientDev.deviceId, accessToken: clientLogin.body.accessToken, protocols: [1], capabilities: ['transport.relay'], clientVersion: '0.6.4' })
await client.next('hello.ack')
check('两端 hello 通过', true)
client.send('connect.request', { hostDeviceId: hostDev.deviceId, preferredTransports: ['relay'] })
const incoming = await host.next('connect.incoming')
host.send('connect.accepted', { connectionId: incoming.payload.connectionId })
await client.next('connect.accepted')
const c2h = Buffer.from('hello-host').toString('base64url')
const h2c = Buffer.from('hello-client').toString('base64url')
client.send('secure.handshake', { connectionId: incoming.payload.connectionId, targetDeviceId: hostDev.deviceId, step: 1, data: c2h })
await host.next('secure.handshake')
host.send('secure.handshake', { connectionId: incoming.payload.connectionId, targetDeviceId: clientDev.deviceId, step: 2, data: h2c })
await client.next('secure.handshake')
client.send('relay', { connectionId: incoming.payload.connectionId, targetDeviceId: hostDev.deviceId, counter: 1, ciphertext: c2h })
const up = await host.next('relay')
host.send('relay', { connectionId: incoming.payload.connectionId, targetDeviceId: clientDev.deviceId, counter: 1, ciphertext: h2c })
const down = await client.next('relay')
check('密文双向透传', up.payload.ciphertext === c2h && down.payload.ciphertext === h2c)

await page.goto(BASE + '/account/devices', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelectorAll('#devices .sk').length === 0, { timeout: 10000 }).catch(() => {})
const versionText = (await page.locator('#devices').innerText()).replace(/\s+/g, ' ')
check('设备列表显示 DSH 版本', versionText.includes('0.9.1'), versionText.slice(0, 80))
check('设备表可键盘聚焦', await page.evaluate(() => {
  const box = document.querySelector('.table-scroll')
  return Boolean(box && box.getAttribute('tabindex') === '0' && box.getAttribute('role') === 'region' && box.getAttribute('aria-label'))
}))

const presence = await api('/api/v1/devices/' + hostDev.deviceId + '/presence', { headers: { authorization: 'Bearer ' + clientLogin.body.accessToken } })
check('Host 在线可见', presence.status === 200 && presence.body.online === true)

// ── 6. OIDC bind + login ────────────────────────────────────────────────────
step('6. 绑定并改用 OIDC 登录')
const oidcLogin = async (email) => {
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
const beforeBind = await oidcLogin('nina2@example.com')
check('未绑定邮箱要求二次校验', beforeBind.includes('/auth/oidc/bind'), beforeBind)
await page.fill('#bind-pass', 'nina-password-456')
await page.click('#bind-submit')
await page.waitForURL(BASE + '/', { timeout: 10000 })
check('绑定后进入首页', page.url() === BASE + '/')
await ctx.clearCookies()
const boundLogin = await oidcLogin('nina2@example.com')
check('已绑定后 OIDC 直接登录', boundLogin === BASE + '/', boundLogin)

// ── 7. admin: disable / re-enable ──────────────────────────────────────────
step('7. 管理员禁用与恢复')
const adminLogin = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'boss@example.com', password: 'boss-password-123' }) })
const adminCookie = cookieOf(adminLogin)
const users = await api('/api/v1/admin/users', { headers: { cookie: adminCookie } })
const nina = users.body.users.find(u => u.username === 'nina')
check('控制台能看到 nina', Boolean(nina), JSON.stringify(users.body.users.map(u => u.username)))
const disabled = await api('/api/v1/admin/users/' + nina.id, { method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ toggle: true }) })
check('管理员可禁用普通用户', disabled.status === 200, String(disabled.status))
const afterDisable = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nina2@example.com', password: 'nina-password-456' }) })
check('禁用后无法登录', afterDisable.status >= 400, String(afterDisable.status))
const deviceAfterDisable = await api('/api/v1/devices/self', { method: 'DELETE', headers: { authorization: 'Bearer ' + clientLogin.body.accessToken } })
check('禁用后设备令牌失效', [401, 404].includes(deviceAfterDisable.status), String(deviceAfterDisable.status))
const enabled = await api('/api/v1/admin/users/' + nina.id, { method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ toggle: true }) })
check('管理员可恢复用户', enabled.status === 200, String(enabled.status))
const afterEnable = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nina2@example.com', password: 'nina-password-456' }) })
check('恢复后可登录', afterEnable.status === 200, String(afterEnable.status))

// ── 8. admin cannot touch keys / passwords ─────────────────────────────────
step('8. 管理员边界')
const adminKeys = await api('/api/v1/admin/users/' + nina.id + '/device-keys', { headers: { cookie: adminCookie } })
check('管理员读不到用户密钥', adminKeys.status === 404, String(adminKeys.status))
const adminReset = await api('/api/v1/admin/users/' + nina.id, { method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ password: 'hijack-password' }) })
check('管理员不能重置密码', adminReset.status === 200 || adminReset.status === 409, String(adminReset.status))
const stillOldPw = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nina2@example.com', password: 'hijack-password' }) })
check('密码未被管理员改动', stillOldPw.status === 401, String(stillOldPw.status))

// ── 9. SSO-only ─────────────────────────────────────────────────────────────
step('9. 仅 SSO 模式')
await api('/api/v1/admin/settings', { method: 'PUT', headers: { cookie: adminCookie }, body: JSON.stringify({ oidc: { enabled: true, onlySso: true } }) })
const pwUnderSso = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nina2@example.com', password: 'nina-password-456' }) })
check('仅 SSO 下密码登录被拒', pwUnderSso.status === 403 && pwUnderSso.body.error.code === 'SSO_ONLY', String(pwUnderSso.status))
await ctx.clearCookies()
const ssoLogin = await oidcLogin('nina2@example.com')
check('仅 SSO 下 OIDC 仍可登录', ssoLogin === BASE + '/', ssoLogin)
const keyUnderSso = await api('/api/v1/auth/device-login', { method: 'POST', body: JSON.stringify({ username: deviceUsername, deviceKey: keysByLabel.Pixel.key, device: clientDev }) })
check('仅 SSO 下设备用户名 + 密钥可用', keyUnderSso.status === 200, String(keyUnderSso.status))
const standardUnderSso = await api('/api/v1/auth/device-login', { method: 'POST', body: JSON.stringify({ username: 'nina', deviceKey: keysByLabel.Pixel.key, device: { ...clientDev, deviceId: 'nina-client-0002' } }) })
check('仅 SSO 下普通用户名 + 密钥可用', standardUnderSso.status === 200, String(standardUnderSso.status))

// ── 10. revoke key + delete account ────────────────────────────────────────
step('10. 吊销密钥与删除账户')
const pixelKey = keysByLabel.Pixel
// Leaving SSO-only restores password login for the user.
await api('/api/v1/admin/settings', { method: 'PUT', headers: { cookie: adminCookie }, body: JSON.stringify({ oidc: { onlySso: false } }) })
const ninaRelogin = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nina2@example.com', password: 'nina-password-456' }) })
const revoke = await api('/api/v1/account/device-keys/' + pixelKey.id, { method: 'DELETE', headers: { cookie: adminCookie } })
check('他人不能吊销该密钥', [401, 404].includes(revoke.status), String(revoke.status))
const selfRevoke = await api('/api/v1/account/device-keys/' + pixelKey.id, { method: 'DELETE', headers: { authorization: 'Bearer ' + ninaRelogin.body.token } })
check('本人可吊销自己的密钥', selfRevoke.status === 200, String(selfRevoke.status))
const revokedDevice = await api('/api/v1/me', { headers: { authorization: 'Bearer ' + clientLogin.body.accessToken } })
check('吊销后该设备失效', revokedDevice.status === 401, String(revokedDevice.status))

const del = await api('/api/v1/admin/users/' + nina.id, { method: 'DELETE', headers: { cookie: adminCookie } })
check('管理员可删除普通用户', del.status === 200, String(del.status))
check('删除后无法登录', (await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nina2@example.com', password: 'nina-password-456' }) })).status === 401)

host.close(); client.close()
await browser.close()
console.log('\n' + pass + '/' + (pass + fail) + ' checks passed')
process.exit(fail ? 1 : 0)
