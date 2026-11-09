import { $, dshApi, dshEsc } from '../shared.js'

export function init() {
  let all = []; let role = 'all'; let online = 'all'
  const empty = () => all.length ? '没有匹配的设备，试试清除搜索或筛选' : '还没有设备接入，先到「设备密钥」生成一把密钥'
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
      ? rows.map((d) => '<tr><td>' + dshEsc(d.name) + '</td><td>' + (d.role === 'host' ? '主机' : '客户端') + '</td><td>' + dshEsc(d.platform || '—') +
        '</td><td class="mono small">' + dshEsc(d.version || '—') + '</td><td class="mono small">' + dshEsc(d.harnessVersion || '—') +
        '</td><td>' + (d.online ? '<span class="badge ok">在线</span>' : '<span class="badge">离线</span>') +
        '</td><td class="muted small">' + (d.lastSeenAt ? dshEsc(new Date(d.lastSeenAt).toLocaleString()) : '—') + '</td></tr>').join('')
      : '<tr><td colspan="7" class="muted">' + empty() + '</td></tr>'
  }
  dshApi('/api/v1/account/devices')
    .then((r) => { all = r.body.items || []; render() })
    .catch(() => { $('devices').innerHTML = '<tr><td colspan="7" class="muted">加载失败，请刷新重试</td></tr>' })
  $('q').addEventListener('input', render)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button.chip')
    if (!b) return
    const group = b.dataset.role ? 'role' : 'online'
    const value = b.dataset.role || b.dataset.online
    if (group === 'role') role = value; else online = value
    document.querySelectorAll('button[data-' + group + ']').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    render()
  })
}
