import { $, dshPost, dshFail, dshToast } from '../shared.js'

export function init() {
  const ticket = new URLSearchParams(location.search).get('ticket')
  const mode = $('bind-mode')
  const sync = () => {
    const byCode = mode.value === 'code'
    $('bind-cd').style.display = byCode ? '' : 'none'
    $('bind-pw').style.display = byCode ? 'none' : ''
  }
  if (mode) { mode.onchange = sync; sync() }
  const send = $('bind-send')
  if (send) send.onclick = () => {
    dshPost('/api/v1/auth/oidc/bind/start', { ticket })
      .then((r) => dshToast(r.status === 202 ? '验证码已发送' : dshFail(r.body, r.status), r.status === 202 ? 'ok' : 'err'))
  }
  const submit = $('bind-submit')
  if (submit) submit.onclick = () => {
    const body = { ticket, mode: mode.value }
    if (mode.value === 'code') body.code = $('bind-code').value.trim()
    else body.password = $('bind-pass').value
    dshPost('/api/v1/auth/oidc/bind/complete', body).then((r) => {
      if (r.ok) location.href = '/'
      else dshToast(dshFail(r.body, r.status), 'err')
    })
  }
}
