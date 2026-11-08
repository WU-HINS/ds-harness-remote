#!/usr/bin/env node
// End-to-end browser check: boots the built server against a disposable
// PostgreSQL database and drives a real Chromium through the console.
//
//   pnpm build
//   DATABASE_URL=postgres://dsh:dsh@127.0.0.1:5432/dshbrowser \
//   CHROME_PATH=/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome \
//   node server/scripts/browser-check.mjs
//
// Requires playwright (npm i playwright) and a Chromium build; it is not a
// repository dependency, so CI does not run it.

import { chromium } from 'playwright'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdirSync } from 'node:fs'

mkdirSync('browser-shots', { recursive: true })

const PORT = process.env.PORT ?? '4599'
const BASE = 'http://127.0.0.1:' + PORT
if (!process.env.DATABASE_URL) throw new Error('set DATABASE_URL to a disposable database')
process.env.DSH_SERVER_PORT = PORT
process.env.DSH_SERVER_HOST = '127.0.0.1'
process.env.DSH_SERVER_PUBLIC_URL = BASE
const SETUP_KEY = process.env.SETUP_KEY ?? 'browser-check-key'
process.env.DSH_SETUP_KEY = SETUP_KEY
process.env.DSH_SERVER_LOG_LEVEL = 'error'
const here = dirname(fileURLToPath(import.meta.url))
await import(pathToFileURL(join(here, '..', 'dist', 'main.js')).href)

for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE + '/healthz'); if (r.ok) break } catch {}
  await new Promise(r => setTimeout(r, 250))
}

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')) }

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' })
const page = await ctx.newPage()
await page.route('**t.hinswu.top/**', r => r.abort())
const consoleErrors = []
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message))
page.on('response', r => { if (r.status() >= 400) consoleErrors.push('HTTP ' + r.status() + ' ' + r.url()) })

// 1. uninitialised instance redirects to /setup
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
check('uninitialised redirects to /setup', page.url().endsWith('/setup'), page.url())
await page.screenshot({ path: './browser-shots/01-setup.png', fullPage: true })

// 2. bootstrap admin through the form
await page.fill('#setup-key', SETUP_KEY)
await page.fill('#setup-user', 'boss@example.com')
await page.fill('#setup-pass', 'boss-password-123')
await Promise.all([page.waitForURL(u => u.pathname === '/admin' || u.pathname === '/', { timeout: 15000 }), page.click('button[type=submit]')])
check('setup redirects after bootstrap', /\/(admin)?$/.test(page.url()), page.url())
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForLoadState('load')
await page.screenshot({ path: '/tmp/bv/shots/02-home.png', fullPage: true })

// 3. topbar chrome
check('topbar visible', await page.locator('header.topbar').isVisible())
check('nav icons rendered', await page.locator('.navlink .ico').count() >= 3)
const devName = await page.evaluate(() => {
  const el = document.querySelector('.who .dev-name')
  if (!el) return null
  const box = el.getBoundingClientRect()
  const who = el.closest('.who').getBoundingClientRect()
  const next = document.querySelector('.topbar .icon-btn')?.getBoundingClientRect()
  const overlap = next ? !(box.right <= next.left || next.right <= box.left) : false
  return { text: el.textContent.trim(), visible: box.width > 0, clipped: box.right > who.right + 1 || box.left < who.left - 1, overlapsNext: overlap }
})
check('device username visible beside the account name', Boolean(devName && /^dev-/.test(devName.text) && devName.visible && !devName.clipped && !devName.overlapsNext), JSON.stringify(devName))

check('avatar shows initial', (await page.locator('.avatar').innerText()).trim().toUpperCase() === 'B')

// 4. command palette: keyboard open, filter, enter
await page.keyboard.press('Control+k')
await page.waitForSelector('#cmdk[open]', { timeout: 5000 })
check('cmd palette opens with Ctrl+K', await page.locator('#cmdk[open]').count() === 1)
await page.fill('#cmdk-input', '设置')
await Promise.all([page.waitForURL('**/admin/settings', { timeout: 15000 }), page.keyboard.press('Enter')])
check('palette navigates to settings', page.url().endsWith('/admin/settings'), page.url())
await page.screenshot({ path: '/tmp/bv/shots/03-settings.png', fullPage: true })

// 5. settings page structure
check('settings anchors present', await page.locator('.anchors a').count() === 5)
check('settings sections present', await page.locator('#server, #appearance, #smtp, #oidc, #limits').count() === 5)

// 6. admin page: tabs, skeleton replaced by rows
await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelectorAll('#rows .sk').length === 0, { timeout: 10000 }).catch(() => {})
check('admin tabs visible', await page.locator('.subtab').count() === 2)
const skel = await page.locator('#rows .sk').count()
const rows = await page.locator('#rows tr').count()
check('skeleton replaced by data', skel === 0 && rows >= 1, 'skeleton=' + skel + ' rows=' + rows)
await page.screenshot({ path: '/tmp/bv/shots/04-admin.png', fullPage: true })

// 7. create a user through the UI
await page.fill('#nu', 'alice@example.com')
await page.fill('#np', 'alice-password-123')
await page.click('#create-user')
await page.waitForFunction(() => document.getElementById('rows').innerText.includes('alice@example.com'), { timeout: 8000 })
check('create user from UI', true)

// The admin console must not expose key management at all.
check('admin console has no key card', (await page.locator('#key-label').count()) === 0)

// 8. the owner manages keys on their own account page
await page.goto(BASE + '/account/keys', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => document.querySelectorAll('#keys .sk').length === 0, { timeout: 10000 }).catch(() => {})
check('account page renders', await page.locator('#main').isVisible())
check('account splits into sub-pages', (await page.locator('.subtab').count()) === 3)
check('key table is a keyboard reachable region', await page.evaluate(() => {
  const box = document.querySelector('.table-scroll')
  return Boolean(box && box.getAttribute('tabindex') === '0' && box.getAttribute('role') === 'region')
}))
const initialKeys = await page.locator('#keys tr').count()
check('account lists the default key', initialKeys >= 1, 'rows=' + initialKeys)
await page.fill('#key-label', '客厅 iPad')
await page.click('#create-key')
await page.waitForFunction(() => document.querySelectorAll('#keys button[data-a="reveal"]').length >= 2, { timeout: 8000 }).catch(() => {})
check('owner can create a key', (await page.locator('#keys button[data-a="reveal"]').count()) >= 2)
await page.locator('#keys button[data-a="reveal"]').first().click()
const revealed = (await page.locator('#keys .keymask').first().innerText()).trim()
check('key can be revealed on demand', revealed.length > 20 && !revealed.includes('•'), revealed.slice(0, 8) + '…')
await page.screenshot({ path: '/tmp/bv/shots/05-account-keys.png' })
await page.screenshot({ path: '/tmp/bv/shots/06-account.png', fullPage: true })

// 10. mobile viewport
await page.setViewportSize({ width: 360, height: 800 })
await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
check('no horizontal overflow at 360px', overflow <= 1, 'overflow=' + overflow)
const labelsHidden = await page.locator('.navlink .lbl').first().isHidden()
const mobileDev = await page.evaluate(() => {
  const el = document.querySelector('.who .dev-name')
  if (!el) return null
  const box = el.getBoundingClientRect()
  const next = document.querySelector('.topbar .icon-btn')?.getBoundingClientRect()
  const overlap = next ? !(box.right <= next.left || next.right <= box.left) : false
  return { text: el.textContent.trim(), visible: box.width > 0 && getComputedStyle(el).display !== 'none', overlapsNext: overlap, overflow: document.documentElement.scrollWidth - window.innerWidth }
})
check('device username survives mobile', Boolean(mobileDev && /^dev-/.test(mobileDev.text) && mobileDev.visible && !mobileDev.overlapsNext && mobileDev.overflow <= 1), JSON.stringify(mobileDev))
await page.goto(BASE + '/account', { waitUntil: 'domcontentloaded' })
const accountOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
check('account page fits at 360px', accountOverflow <= 1, 'overflow=' + accountOverflow)

check('nav labels collapse under 640px', labelsHidden)
await page.screenshot({ path: '/tmp/bv/shots/07-admin-mobile.png', fullPage: true })

// 11. light theme via toggle
await page.setViewportSize({ width: 1280, height: 900 })
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
const prefers = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)
await page.click('.icon-btn[title="切换主题"]')
const theme = await page.evaluate(() => document.documentElement.dataset.theme)
await page.setViewportSize({ width: 360, height: 800 })
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(200)
const adminOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
check('admin topbar fits at 360px', adminOverflow <= 1, 'overflow=' + adminOverflow)
const adminLink = await page.locator('header.topbar a[href="/admin"]').count()
check('admin keeps the 管理 entry', adminLink === 1, String(adminLink))
await page.setViewportSize({ width: 1280, height: 900 })

check('theme toggle pins an explicit theme', theme === (prefers ? 'light' : 'dark'), String(theme))
const stored = await page.evaluate(() => localStorage.getItem('theme'))
check('theme preference persisted', stored === theme, String(stored))
await page.screenshot({ path: '/tmp/bv/shots/08-home-light.png', fullPage: true })

// 12. console cleanliness
check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

await browser.close()
const failed = results.filter(r => !r.ok)
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed')
process.exit(failed.length ? 1 : 0)
