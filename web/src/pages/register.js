import { $, dshPost, dshFail, dshToast } from '../shared.js'

export function init() {
  const send = $('reg-send')
  if (send) send.onclick = () => {
    dshPost('/api/v1/auth/register/start', { email: $('reg-email').value.trim() })
      .then((r) => dshToast(r.status === 202 ? '验证码已发送' : dshFail(r.body, r.status), r.status === 202 ? 'ok' : 'err'))
  }
  const form = $('reg')
  if (form) form.onsubmit = (ev) => {
    ev.preventDefault()
    dshPost('/api/v1/auth/register/complete', {
      email: $('reg-email').value.trim(), code: $('reg-code').value.trim(), password: $('reg-pass').value,
    }).then((r) => {
      if (r.ok) location.href = '/'
      else dshToast(dshFail(r.body, r.status), 'err')
    })
  }
}
