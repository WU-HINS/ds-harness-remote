import { $, dshApi, dshPost, dshDel, dshEsc, dshFail, dshToast, dshConfirm } from '../shared.js'

const ACTIONS = {
  'device.renamed': '重命名设备',
  'device.removed': '移除设备',
  'account.registered': '注册账号',
  'auth.code_failure': '验证码校验失败',
  'device.registered': '注册设备',
  'device.registered_from_account': '账号注册设备',
  'device.revoked_by_admin': '管理员吊销设备',
  'device_key.created': '生成设备密钥',
  'device_key.revoked': '吊销设备密钥',
  'device_key.rotated': '轮换设备密钥',
  'device_key.ticket_issued': '签发设备票据',
  'device_login.failure': '设备登录失败',
  'device_login.success': '设备登录',
  'email.change_started': '发起换绑邮箱',
  'email.changed': '换绑邮箱',
  'login.disabled': '禁用账号尝试登录',
  'login.failure': '登录失败',
  'login.sso_only_rejected': '仅 SSO 下拒绝密码登录',
  'login.success': '登录成功',
  'oidc.auto_bound': '自动绑定 SSO',
  'oidc.bound': '绑定 SSO',
  'oidc.conflict': 'SSO 账号冲突',
  'oidc.failure': 'SSO 登录失败',
  'oidc.provisioned': '自动创建账号',
  'oidc.rejected': 'SSO 登录被拒',
  'oidc.success': 'SSO 登录成功',
  'oidc.unbound': '解绑 SSO',
  'password.changed': '修改密码',
  'password.reset': '重置密码',
  'settings.updated': '更新设置',
  'setup.admin_created': '创建管理员',
  'user.created': '创建用户',
  'user.deleted': '删除用户',
  'user.updated': '更新用户',
}
const emptyRow = (n, text) => '<tr><td colspan="' + n + '" class="muted">' + text + '</td></tr>'

export function init() {
  const q = new URLSearchParams(location.search)
  if (q.get('oidc') === 'bound') dshToast('SSO 身份已绑定', 'ok')
  if (q.get('oidc') === 'already-bound') dshToast('该账号已绑定 SSO', 'ok')
  if (q.get('oidc') === 'email-mismatch') dshToast('SSO 邮箱与账号不一致，未绑定', 'err')
  const loadUsers = () => dshApi('/api/v1/admin/users').then((r) => {
    const rows = r.body.users || []
    $('userCount').textContent = rows.length
    $('rows').setAttribute('aria-busy', 'false')
    $('rows').innerHTML = rows.length
      ? rows.map((u) => {
        const name = dshEsc(u.username)
        const isAdmin = u.role === 'admin'
        return '<tr><td data-th="账号">' + name + (isAdmin ? ' <span class="badge">管理员</span>' : '') + '</td><td data-th="设备用户名" class="mono small">' + dshEsc(u.deviceUsername || '-') +
          '</td><td data-th="角色">' + (isAdmin ? '管理员' : '普通用户') + '</td><td data-th="密钥">' + u.deviceKeys + '</td><td data-th="操作">' +
          (isAdmin
            ? '<span class="muted small">受保护</span>'
            : '<div class="actions"><button class="btn ghost sm" data-a="toggle" data-id="' + dshEsc(u.id) + '" aria-label="' + (u.disabled ? '启用' : '禁用') + ' ' + name + '">' + (u.disabled ? '启用' : '禁用') + '</button>' +
              '<button class="btn danger sm" data-a="del" data-id="' + dshEsc(u.id) + '" data-name="' + name + '" aria-label="删除 ' + name + '">删除</button></div>') +
          '</td></tr>'
      }).join('')
      : emptyRow(5, '还没有用户')
  })

  const loadDevices = () => dshApi('/api/v1/admin/devices').then((r) => {
    const xs = r.body.items || []
    $('devices').setAttribute('aria-busy', 'false')
    $('devices').innerHTML = xs.length
      ? xs.map((x) => '<tr><td data-th="用户">' + dshEsc(x.username) + '</td><td data-th="设备">' + dshEsc(x.name) + '</td><td data-th="角色">' + dshEsc(x.role) + '</td><td data-th="状态">' +
        (x.revoked ? '<span class="badge off">已吊销</span>' : (x.online ? '<span class="badge ok">在线</span>' : '<span class="badge">离线</span>')) +
        '</td><td data-th="操作">' + (x.revoked ? '' : '<button class="btn danger sm" data-a="revoke-device" data-id="' + dshEsc(x.deviceId) + '" data-name="' + dshEsc(x.name) + '">吊销</button>') + '</td></tr>').join('')
      : emptyRow(5, '还没有设备接入')
  })

  const loadAudit = () => dshApi('/api/v1/admin/audit?limit=20').then((r) => {
    const xs = r.body.items || []
    $('audit').setAttribute('aria-busy', 'false')
    $('audit').innerHTML = xs.length
      ? xs.map((x) => '<tr><td data-th="时间" class="muted small">' + dshEsc(new Date(x.at).toLocaleString()) + '</td><td data-th="操作者">' + dshEsc(x.actor || '-') + '</td><td data-th="动作">' + dshEsc(ACTIONS[x.action] || x.action) + '</td></tr>').join('')
      : emptyRow(3, '暂无审计记录')
  })

  document.addEventListener('click', async (e) => {
    const b = e.target.closest ? e.target.closest('button[data-a]') : null
    if (!b) return
    const id = b.getAttribute('data-id')
    const a = b.getAttribute('data-a')
    if (a === 'toggle') {
      dshApi('/api/v1/admin/users/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toggle: true }) })
        .then(async (r) => { await Promise.all([loadUsers(), loadAudit()]); dshToast(r.ok ? '状态已更新' : dshFail(r.body, r.status), r.ok ? 'ok' : 'err') })
    } else if (a === 'del') {
      if (!(await dshConfirm('删除用户 ' + b.getAttribute('data-name') + '？该用户的设备与会话会立即失效，且不可恢复。', { title: '删除用户' }))) return
      dshDel('/api/v1/admin/users/' + encodeURIComponent(id)).then((r) => { dshToast(r.ok ? '已删除' : dshFail(r.body, r.status), r.ok ? 'ok' : 'err'); loadUsers() })
    } else if (a === 'revoke-device') {
      if (!(await dshConfirm('吊销设备 ' + b.getAttribute('data-name') + '？它会立即断开。', { title: '吊销设备' }))) return
      dshDel('/api/v1/admin/devices/' + encodeURIComponent(id)).then((r) => { dshToast(r.ok ? '已吊销' : dshFail(r.body, r.status), r.ok ? 'ok' : 'err'); loadDevices() })
    }
  })

  $('create-user').onclick = () => {
    dshPost('/api/v1/admin/users', { username: $('nu').value.trim(), password: $('np').value || undefined, role: $('nr').value }).then((r) => {
      if (r.ok) { dshToast('用户已创建，设备密钥由用户自行生成', 'ok'); $('nu').value = ''; $('np').value = ''; loadUsers() }
      else dshToast(dshFail(r.body, r.status), 'err')
    })
  }

  loadUsers(); loadDevices(); loadAudit()
}
