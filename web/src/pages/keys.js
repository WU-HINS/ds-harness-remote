import { $, dshApi, dshPost, dshDel, dshCopy, dshConfirm, dshEsc, dshFail, dshToast } from '../shared.js'

export function init() {
  let all = []; let state = 'all'
  const empty = () => all.length ? '没有匹配的密钥' : '还没有密钥。回到「概览」或在本页下方生成一把。'
  const label = (k) => (k === 'default' ? '默认密钥' : k)
  const render = () => {
    const q = $('q').value.trim().toLowerCase()
    const rows = all.filter((k) => {
      if (state === 'active' && k.revoked) return false
      if (state === 'revoked' && !k.revoked) return false
      return !q || (k.label || '').toLowerCase().includes(q)
    })
    $('keys').setAttribute('aria-busy', 'false')
    $('keys').innerHTML = rows.length
      ? rows.map((k) => '<tr>' +
        '<td data-th="标签"><span class="strong">' + dshEsc(label(k.label)) + '</span></td>' +
        '<td data-th="设备数"><span class="badge">' + k.deviceCount + '</span></td>' +
        '<td data-th="状态">' + (k.revoked ? '<span class="badge off">已吊销</span>' : '<span class="badge ok">正常</span>') + '</td>' +
        '<td data-th="密钥">' + (k.id === 'unbound'
          ? '<span class="muted small">—</span>'
          : k.revealable === false
            ? '<span class="muted small">' + (k.revoked ? '已吊销，不可回显' : '不可回显（旧密钥）· 请新建一把并吊销此钥') + '</span>'
            : '<span class="mono small keymask" data-key="' + dshEsc(k.key) + '">••••••••••••</span> <button class="btn ghost sm" data-a="reveal">显示</button><button class="btn ghost sm" data-a="copy" data-key="' + dshEsc(k.key) + '">复制</button>') + '</td>' +
        '<td data-th="创建时间" class="muted small">' + (k.createdAt ? dshEsc(new Date(k.createdAt).toLocaleString()) : '—') + '</td>' +
        '<td data-th="操作">' + (k.revoked || k.id === 'unbound' ? '<span class="muted small">—</span>'
          : '<button class="btn danger sm" data-a="revoke" data-id="' + dshEsc(k.id) + '" data-count="' + k.deviceCount + '" aria-label="吊销密钥 ' + dshEsc(k.label) + '">吊销</button>') + '</td></tr>').join('')
      : '<tr><td colspan="6" class="muted">' + empty() + '</td></tr>'
  }
  const load = () => dshApi('/api/v1/account/device-keys')
    .then((r) => { all = r.body.keys || []; render() })
    .catch(() => { $('keys').innerHTML = '<tr><td colspan="6" class="muted">加载失败，请刷新重试</td></tr>' })
  load()
  $('q').addEventListener('input', render)
  document.querySelectorAll('[data-state]').forEach((b) => {
    b.onclick = () => {
      state = b.dataset.state
      document.querySelectorAll('[data-state]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
      render()
    }
  })
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]')
    if (!b) return
    const a = b.dataset.a
    if (a === 'reveal') {
      const m = b.parentElement.querySelector('.keymask')
      if (m) { m.textContent = m.getAttribute('data-key'); b.remove() }
    } else if (a === 'copy') dshCopy(b.dataset.key)
    else if (a === 'revoke') {
      const count = Number(b.dataset.count || 0)
      const message = count > 0
        ? '吊销这把密钥？使用它的 ' + count + ' 台设备会立即断开，且无法用同一设备 ID 重新接入。'
        : '吊销这把密钥？它之后不能再用于接入新设备。'
      if (!(await dshConfirm(message, { title: '吊销密钥', ok: '吊销' }))) return
      const r = await dshDel('/api/v1/account/device-keys/' + encodeURIComponent(b.dataset.id))
      const gone = r.body && typeof r.body.disconnected === 'number' ? r.body.disconnected : 0
      dshToast(r.ok ? (gone > 0 ? '密钥已吊销，' + gone + ' 台设备已断开' : '密钥已吊销') : dshFail(r.body, r.status), r.ok ? 'ok' : 'err')
      load()
    }
  })
  $('create-key').onclick = async () => {
    const r = await dshPost('/api/v1/account/device-keys', { label: $('key-label').value.trim() || 'device' })
    if (!r.ok) { dshToast(dshFail(r.body, r.status), 'err'); return }
    $('key-label').value = ''
    dshToast('密钥已生成，可在列表中显示或复制', 'ok')
    load()
  }
}
