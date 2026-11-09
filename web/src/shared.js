// Shared browser helpers: DOM lookup, toasts, fetch wrappers, theme, palette.
export const $ = (id) => document.getElementById(id)

export function dshEsc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export function dshHint(msg, kind) {
  const box = $('hint')
  if (!box) return
  box.innerHTML = ''
  const el = document.createElement('div')
  el.className = 'alert ' + (kind || 'ok')
  el.textContent = msg
  box.appendChild(el)
  clearTimeout(window.__hintT)
  window.__hintT = setTimeout(() => { box.innerHTML = '' }, 6000)
}

export const dshToast = (msg, kind) => toast(msg, kind)

function toast(msg, kind) {
  let box = $('toaster')
  if (!box) {
    box = document.createElement('div')
    box.id = 'toaster'
    box.className = 'toaster'
    box.setAttribute('role', 'status')
    box.setAttribute('aria-live', 'polite')
    document.body.appendChild(box)
  }
  const item = document.createElement('div')
  item.className = 'toast-item' + (kind === 'err' ? ' err' : '')
  if (kind === 'err') item.setAttribute('role', 'alert')
  const dot = document.createElement('span'); dot.className = 'dot'
  const body = document.createElement('span'); body.className = 'body'; body.textContent = msg
  const close = document.createElement('button')
  close.className = 'close'; close.type = 'button'; close.setAttribute('aria-label', '关闭提示'); close.textContent = '×'
  item.append(dot, body, close)
  box.appendChild(item)
  const dismiss = () => item.remove()
  close.onclick = (e) => { e.stopPropagation(); dismiss() }
  item.onclick = dismiss
  setTimeout(dismiss, kind === 'err' ? 7000 : 4000)
}

const ERRORS = {
  AUTH_INVALID: '邮箱或密码不正确', EMAIL_UNVERIFIED: '邮箱尚未验证', SSO_ONLY: '已启用仅 SSO，请用身份提供方登录',
  CODE_INVALID: '验证码不正确或已过期', EMAIL_TAKEN: '该邮箱已被使用', EMAIL_RATE_LIMITED: '发送过于频繁，请 60 秒后重试',
  EMAIL_QUOTA_EXCEEDED: '该邮箱今日验证码次数已用完', RATE_LIMITED: '请求过于频繁，请稍后重试',
  SMTP_NOT_CONFIGURED: '服务端未配置 SMTP，请联系管理员', INVALID_EMAIL: '邮箱格式不正确', INVALID_MESSAGE: '填写内容不合法，请检查后重试', INVALID_SETTINGS: '设置有误，请检查填写内容', PASSWORD_INVALID: '当前密码不正确', ACCOUNT_DISABLED: '账号已被禁用，请联系管理员',
  SETUP_REQUIRED: '服务尚未初始化', OIDC_EXPIRED: '绑定会话已过期，请重新登录', DEVICE_KEY_REQUIRED: '需要设备密钥',
}
export const dshErr = (code, status) => ERRORS[code] || '操作失败（' + (code || status) + '）'

export function dshApi(path, opts) {
  return fetch(path, opts).then((r) => r.json().catch(() => ({})).then((body) => ({ ok: r.ok, status: r.status, body })))
}
export const dshPost = (path, body) => dshApi(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
export const dshPut = (path, body) => dshApi(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
export const dshDel = (path) => dshApi(path, { method: 'DELETE' })
export const dshFail = (body, status) => {
  const error = body && body.error
  if (!error) return dshErr(undefined, status)
  // The server sends a sentence when it has one; a bare code is translated here.
  if (typeof error.message === 'string' && error.message !== error.code) return error.message
  return dshErr(error.code, status)
}

export function dshConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog')
    dlg.className = 'confirm'
    dlg.setAttribute('aria-labelledby', 'confirm-title')
    const title = options.title || '确认操作'
    dlg.innerHTML = '<h2 id="confirm-title" style="border:0;padding:0;margin:0 0 10px">' + dshEsc(title) + '</h2>' +
      '<p class="muted small" style="margin:0 0 16px">' + dshEsc(message) + '</p>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn ghost" type="button" data-r="0">取消</button>' +
      '<button class="btn ' + (options.danger === false ? '' : 'danger') + '" type="button" data-r="1">' + dshEsc(options.ok || '确认') + '</button></div>'
    document.body.appendChild(dlg)
    const done = (value) => { dlg.close(); dlg.remove(); resolve(value) }
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-r]')
      if (b) done(b.dataset.r === '1')
      else if (e.target === dlg) done(false)
    })
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(false) })
    dlg.showModal()
  })
}

export function dshCopy(text) {
  if (!navigator.clipboard) return toast('请手动选择复制', 'err')
  navigator.clipboard.writeText(text).then(() => toast('已复制到剪贴板', 'ok'), () => toast('复制失败，请手动选择', 'err'))
}

export function applyTheme(pref) {
  const d = document.documentElement
  if (pref === 'light' || pref === 'dark') d.dataset.theme = pref
  else delete d.dataset.theme
  d.dataset.themePref = pref
}

export function toggleTheme() {
  const pref = document.documentElement.dataset.themePref || 'auto'
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  const next = pref === 'auto' ? (dark ? 'light' : 'dark') : (pref === 'dark' ? 'light' : 'dark')
  try { localStorage.setItem('theme', next) } catch {}
  applyTheme(next)
}

export function initTheme() {
  try { applyTheme(localStorage.getItem('theme') || 'auto') } catch {}
}

// Cross-document view transitions are native in Chromium; elsewhere fade out.
export function initNavigation() {
  window.addEventListener('pageshow', () => document.body.classList.remove('leaving'))
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if ('startViewTransition' in document || reduce) return
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a') : null
    if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    const url = new URL(a.href, location.href)
    if (url.origin !== location.origin) return
    e.preventDefault()
    document.body.classList.add('leaving')
    setTimeout(() => { location.href = url.href }, 170)
  })
}

export function initChrome() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-confirm]')
    if (!a) return
    e.preventDefault()
    e.stopPropagation()
    dshConfirm(a.getAttribute('data-confirm'), { title: '确认', ok: '继续' }).then((ok) => { if (ok) location.href = a.href })
  }, true)
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-action=theme]')
    if (t) toggleTheme()
  })
}

export function initPalette() {
  const dlg = $('cmdk'); const input = $('cmdk-input'); const list = $('cmdk-list')
  if (!dlg || !input || !list) return
  const items = [
    { t: '概览', h: '/' }, { t: '我的账户', h: '/account' }, { t: '我的设备', h: '/account/devices' },
    { t: '设备密钥', h: '/account/keys' }, { t: '用户与设备', h: '/admin' }, { t: '设置', h: '/admin/settings' },
    { t: '切换主题', a: 'theme' }, { t: '退出登录', a: 'logout' },
  ]
  let filtered = items; let idx = 0
  const render = () => {
    list.innerHTML = filtered.length
      ? filtered.map((it, i) => '<button type="button" class="cmdk-item' + (i === idx ? ' active' : '') + '" role="option" aria-selected="' + (i === idx) + '" data-i="' + i + '"><span>' + dshEsc(it.t) + '</span><span class="muted small">' + dshEsc(it.h || '') + '</span></button>').join('')
      : '<div class="muted small" style="padding:10px">没有匹配项</div>'
  }
  const close = () => { if (dlg.open) dlg.close() }
  const run = (it) => {
    close()
    if (!it) return
    if (it.h) location.href = it.h
    else if (it.a === 'theme') toggleTheme()
    else if (it.a === 'logout') fetch('/api/v1/auth/logout', { method: 'POST' }).then(() => { location.href = '/login' })
  }
  const open = () => {
    if (dlg.open) return
    input.value = ''; filtered = items; idx = 0; render(); dlg.showModal(); input.focus()
  }
  const btn = $('cmdk-open'); if (btn) btn.onclick = open
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); open(); return }
    if (!dlg.open) return
    if (e.key === 'Escape') { close(); return }
    const n = Math.max(filtered.length, 1)
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % n; render(); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + n) % n; render(); return }
    if (e.key === 'Enter') { e.preventDefault(); run(filtered[idx]) }
  })
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase()
    filtered = items.filter((it) => it.t.toLowerCase().includes(q)); idx = 0; render()
  })
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.cmdk-item')
    if (b) run(filtered[+b.dataset.i])
  })
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close() })
}
