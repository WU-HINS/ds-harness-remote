import { $, dshPost, dshFail, dshToast } from '../shared.js'

const flash = () => {
  const q = new URLSearchParams(location.search)
  if (q.get('oidc') === 'bound') dshToast('SSO 身份已绑定', 'ok')
  if (q.get('oidc') === 'error') dshToast('单点登录未启用或配置有误', 'err')
}

export function init() {
  flash()
  const pw = $('change-pw')
  if (pw) pw.onclick = () => {
    dshPost('/api/v1/auth/password/change', { currentPassword: $('cur-pass').value, newPassword: $('new-pass').value })
      .then((r) => dshToast(r.ok ? '密码已修改' : dshFail(r.body, r.status), r.ok ? 'ok' : 'err'))
  }
  const send = $('send-code')
  if (send) send.onclick = () => {
    dshPost('/api/v1/auth/email/change/start', { newEmail: $('new-email').value.trim() })
      .then((r) => dshToast(r.status === 202 ? '验证码已发送' : dshFail(r.body, r.status), r.status === 202 ? 'ok' : 'err'))
  }
  const email = $('change-email')
  if (email) email.onclick = () => {
    dshPost('/api/v1/auth/email/change/complete', {
      newEmail: $('new-email').value.trim(), newCode: $('new-code').value.trim(), oldCode: $('old-code').value.trim(),
    }).then((r) => {
      if (r.ok) { dshToast('邮箱已换绑', 'ok'); setTimeout(() => location.reload(), 1400) }
      else dshToast(dshFail(r.body, r.status), 'err')
    })
  }
  const unbind = $('unbind')
  if (unbind) unbind.onclick = () => {
    if (!confirm('解绑后将无法用该 SSO 身份登录，确定吗？')) return
    dshPost('/api/v1/auth/oidc/unbind').then((r) => {
      dshToast(r.ok ? '已解绑' : dshFail(r.body, r.status), r.ok ? 'ok' : 'err')
      if (r.ok) setTimeout(() => location.reload(), 700)
    })
  }
}
