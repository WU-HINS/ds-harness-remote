import { $, dshPost, dshFail } from '../shared.js'

export function init() {
  const form = $('login-form')
  if (!form) return
  form.onsubmit = (ev) => {
    ev.preventDefault()
    const body = { username: $('login-user').value.trim(), password: $('login-pass').value }
    dshPost('/api/v1/auth/login', body).then((r) => {
      if (r.ok) { location.href = '/'; return }
      const box = $('login-error')
      if (box) box.innerHTML = '<div class="alert err u-mt14">' + dshFail(r.body, r.status) + '</div>'
    })
  }
}
