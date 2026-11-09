import { $, dshPost, dshFail, dshToast } from '../shared.js'

export function init() {
  const send = $('fg-send')
  if (send) send.onclick = () => {
    dshPost('/api/v1/auth/password/reset/start', { email: $('fg-email').value.trim() })
      .then((r) => dshToast(r.status === 202 ? '验证码已发送' : dshFail(r.body, r.status), r.status === 202 ? 'ok' : 'err'))
  }
  const form = $('fg')
  if (form) form.onsubmit = (ev) => {
    ev.preventDefault()
    dshPost('/api/v1/auth/password/reset/complete', {
      email: $('fg-email').value.trim(), code: $('fg-code').value.trim(), password: $('fg-pass').value,
    }).then((r) => {
      if (r.ok) dshToast('已重置，请返回登录', 'ok')
      else dshToast(dshFail(r.body, r.status), 'err')
    })
  }
}
