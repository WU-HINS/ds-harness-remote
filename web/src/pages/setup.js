import { $, dshPost, dshFail } from '../shared.js'

export function init() {
  const form = $('setup-form')
  if (!form) return
  form.onsubmit = (ev) => {
    ev.preventDefault()
    const body = {
      key: $('setup-key').value.trim(),
      username: $('setup-user').value.trim(),
      password: $('setup-pass').value,
      publicUrl: $('setup-url').value.trim(),
    }
    dshPost('/api/v1/setup', body).then((r) => {
      if (r.ok) { location.href = '/account?welcome=1'; return }
      const box = $('setup-error')
      if (box) box.innerHTML = '<div class="alert err" style="margin-top:14px">' + dshFail(r.body, r.status) + '</div>'
    })
  }
}
