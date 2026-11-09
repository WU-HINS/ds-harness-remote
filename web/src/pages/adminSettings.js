import { $, dshApi, dshPost, dshPut, dshFail, dshToast, dshConfirm } from '../shared.js'

export function init() {
  dshApi('/api/v1/admin/settings').then((r) => {
    const b = r.body; const o = b.oidc || {}; const l = b.limits || {}; const i = b.ice || {}; const s = b.smtp || {}; const sv = b.server || {}; const ui = b.ui || {}
    $('public-url').value = sv.publicUrl || ''
    $('trusted-proxies').value = (sv.trustedProxyIps || []).join(',')
    $('bg-url').value = ui.backgroundUrl || ''
    $('oidc-enabled').checked = !!o.enabled
    $('only-sso').checked = !!o.onlySso
    $('bind-require').checked = o.bindRequireVerification !== false
    $('issuer').value = o.issuer || ''
    $('client-id').value = o.clientId || ''
    $('scopes').value = o.scopes || 'openid email profile'
    $('allowed-domains').value = (o.allowedDomains || []).join(',')
    $('session-ttl').value = l.sessionTtlMs || ''
    $('conn-limit').value = l.userConnectionLimit || ''
    $('user-rate').value = l.userRatePerMinute || ''
    $('anon-rate').value = l.anonRatePerMinute || ''
    $('stun').value = (i.stunUrls || []).join(',')
    $('turn').value = (i.turnUrls || []).join(',')
    $('turn-user').value = i.turnUsername || ''
    $('smtp-host').value = s.host || ''
    $('smtp-port').value = s.port || 587
    $('smtp-secure').checked = !!s.secure
    $('smtp-user').value = s.user || ''
    $('smtp-from').value = s.from || ''
  })

  $('save-server').onclick = () => dshPut('/api/v1/admin/settings', { server: { publicUrl: $('public-url').value.trim(), trustedProxyIps: $('trusted-proxies').value } })
    .then((r) => dshToast(r.ok ? '已保存' : dshFail(r.body, r.status), r.ok ? 'ok' : 'err'))
  $('save-ui').onclick = () => dshPut('/api/v1/admin/settings', { ui: { backgroundUrl: $('bg-url').value.trim() } })
    .then((r) => dshToast(r.ok ? '已保存，刷新可见' : dshFail(r.body, r.status), r.ok ? 'ok' : 'err'))
  $('save-oidc').onclick = async () => {
    if ($('only-sso').checked && !(await dshConfirm('开启仅 SSO 后，除当前会话外的密码登录会话会被清除，密码登录与找回密码将不可用。', { title: '开启仅 SSO' }))) return
    dshPut('/api/v1/admin/settings', {
      oidc: {
        enabled: $('oidc-enabled').checked, onlySso: $('only-sso').checked, bindRequireVerification: $('bind-require').checked,
        issuer: $('issuer').value.trim(), clientId: $('client-id').value.trim(), clientSecret: $('client-secret').value,
        scopes: $('scopes').value, allowedDomains: $('allowed-domains').value,
      },
    }).then((r) => { if (r.ok) { $('client-secret').value = ''; dshToast('已保存', 'ok') } else dshToast(dshFail(r.body, r.status), 'err') })
  }
  $('save-smtp').onclick = () => dshPut('/api/v1/admin/settings', {
    smtp: { host: $('smtp-host').value.trim(), port: +$('smtp-port').value, secure: $('smtp-secure').checked, user: $('smtp-user').value, pass: $('smtp-pass').value, from: $('smtp-from').value },
  }).then((r) => { if (r.ok) { $('smtp-pass').value = ''; dshToast('已保存', 'ok') } else dshToast(dshFail(r.body, r.status), 'err') })
  $('test-smtp').onclick = () => dshPost('/api/v1/admin/smtp/test', { to: $('smtp-test-to').value.trim() })
    .then((r) => dshToast(r.ok ? '测试邮件已发送' : dshFail(r.body, r.status), r.ok ? 'ok' : 'err'))
  $('save-limits').onclick = () => dshPut('/api/v1/admin/settings', {
    limits: { sessionTtlMs: +$('session-ttl').value, userConnectionLimit: +$('conn-limit').value, userRatePerMinute: +$('user-rate').value, anonRatePerMinute: +$('anon-rate').value },
    ice: { stunUrls: $('stun').value, turnUrls: $('turn').value, turnUsername: $('turn-user').value, turnPassword: $('turn-pass').value },
  }).then((r) => { if (r.ok) { $('turn-pass').value = ''; dshToast('已保存', 'ok') } else dshToast(dshFail(r.body, r.status), 'err') })
}
