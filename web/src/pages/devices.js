import { $, dshApi, dshConfirm, dshEsc, dshFail, dshToast } from '../shared.js'

export function init() {
  let all = []; let role = 'all'; let online = 'all'
  const empty = () => all.length ? '没有匹配的设备，试试清除搜索或筛选' : '还没有设备接入。回到「概览」生成一把密钥，填进桌面端的远程设置。'

  const render = () => {
    const q = $('q').value.trim().toLowerCase()
    const rows = all.filter((d) => {
      if (role !== 'all' && d.role !== role) return false
      if (online === 'online' && !d.online) return false
      if (online === 'offline' && d.online) return false
      if (!q) return true
      return ((d.name || '') + ' ' + (d.platform || '')).toLowerCase().includes(q)
    })
    $('devices').setAttribute('aria-busy', 'false')
    $('devices').innerHTML = rows.length
      ? rows.map((d) => '<tr>' +
        '<td data-th="名称"><span class="strong">' + dshEsc(d.name) + '</span>' + (d.online ? '' : ' <span class="badge">离线</span>') + '</td>' +
        '<td data-th="角色">' + (d.role === 'host' ? '主机' : '客户端') + '</td>' +
        '<td data-th="系统">' + dshEsc(d.platform || '—') + '</td>' +
        '<td data-th="插件">' + dshEsc(d.version || '—') + '</td>' +
        '<td data-th="DSH">' + dshEsc(d.harnessVersion || '—') + '</td>' +
        '<td data-th="最近在线" class="muted small">' + (d.lastSeenAt ? dshEsc(new Date(d.lastSeenAt).toLocaleString()) : '—') + '</td>' +
        '<td data-th="操作"><div class="actions">' +
        '<button class="btn ghost sm" data-a="rename" data-id="' + dshEsc(d.deviceId || d.id) + '" data-name="' + dshEsc(d.name) + '">重命名</button>' +
        '<button class="btn danger sm" data-a="remove" data-id="' + dshEsc(d.deviceId || d.id) + '" data-name="' + dshEsc(d.name) + '">断开</button>' +
        '</div></td></tr>').join('')
      : '<tr><td colspan="7" class="muted">' + empty() + '</td></tr>'
  }

  const load = () => dshApi('/api/v1/account/devices')
    .then((r) => { all = r.body.items || []; render() })
    .catch(() => { $('devices').innerHTML = '<tr><td colspan="7" class="muted">加载失败，请刷新重试</td></tr>' })

  load()
  $('q').addEventListener('input', render)
  document.addEventListener('click', async (e) => {
    const chip = e.target.closest('button.chip')
    if (chip) {
      const group = chip.dataset.role ? 'role' : 'online'
      const value = chip.dataset.role || chip.dataset.online
      if (group === 'role') role = value; else online = value
      document.querySelectorAll('button[data-' + group + ']').forEach((x) => x.setAttribute('aria-pressed', String(x === chip)))
      render(); return
    }
    const b = e.target.closest('button[data-a]')
    if (!b) return
    const id = b.dataset.id
    if (b.dataset.a === 'rename') {
      const next = prompt('新的设备名称', b.dataset.name)
      if (!next || !next.trim() || next.trim() === b.dataset.name) return
      const r = await dshApi('/api/v1/account/devices/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: next.trim() }) })
      if (r.ok) { all = all.map((x) => ((x.deviceId || x.id) === id ? { ...x, name: r.body.name || next.trim() } : x)); render(); dshToast('已重命名', 'ok') }
      else dshToast(dshFail(r.body, r.status), 'err')
    } else if (b.dataset.a === 'remove') {
      if (!(await dshConfirm('断开 ' + b.dataset.name + '？它会立即失去访问权限，需要重新用密钥接入。', { title: '断开设备', ok: '断开' }))) return
      const r = await dshApi('/api/v1/account/devices/' + encodeURIComponent(id), { method: 'DELETE' })
      if (r.ok) { all = all.filter((x) => (x.deviceId || x.id) !== id); render(); dshToast('设备已断开', 'ok') }
      else dshToast(dshFail(r.body, r.status), 'err')
    }
  })
}
