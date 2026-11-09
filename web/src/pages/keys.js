import { $, dshApi, dshPost, dshDel, dshCopy, dshEsc, dshFail, dshToast, dshConfirm } from '../shared.js'

export function init() {
  let all = []; let state = 'all'
  const empty = () => all.length ? '没有匹配的密钥' : '还没有密钥，使用下方「生成密钥」创建'
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
      ? rows.map((k) => '<tr><td>' + dshEsc(label(k.label)) + '</td><td><span class="badge">' + k.deviceCount + '</span></td><td>' +
        (k.revoked ? '<span class="badge off">已吊销</span>' : '<span class="badge ok">正常</span>') + '</td><td>' +
        (k.key
          ? '<span class="mono small keymask" data-key="' + dshEsc(k.key) + '">••••••••••••</span> <button class="btn ghost sm" data-a="reveal">显示</button><button class="btn ghost sm" data-a="copy" data-key="' + dshEsc(k.key) + '">复制</button>'
          : '<span class="muted small">不可查看（旧密钥）</span>') +
        '</td><td class="muted small">' + (k.createdAt ? dshEsc(new Date(k.createdAt).toLocaleString()) : '—') + '</td><td>' +
        (k.revoked || k.id === 'unbound' ? '' : '<button class="btn danger sm" data-a="revoke" data-id="' + dshEsc(k.id) + '" aria-label="吊销密钥 ' + dshEsc(k.label) + '">吊销</button>') +
        '</td></tr>').join('')
      : '<tr><td colspan="6" class="muted">' + empty() + '</td></tr>'
  }
  const load = () => dshApi('/api/v1/account/device-keys')
    .then((r) => { all = r.body.keys || []; render() })
    .catch(() => { $('keys').innerHTML = '<tr><td colspan="6" class="muted">加载失败，请刷新重试</td></tr>' })
  load()
  $('q').addEventListener('input', render)
  document.querySelectorAll('[data-state]').forEach((b) => {
    b.onclick = async () => {
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
      if (!(await dshConfirm('吊销这把密钥？使用它的设备会立即掉线，且无法用同一设备 ID 重新接入。'))) return
      dshDel('/api/v1/account/device-keys/' + encodeURIComponent(b.dataset.id))
        .then((r) => { dshToast(r.ok ? '已吊销' : dshFail(r.body, r.status), r.ok ? 'ok' : 'err'); load() })
    }
  })
  $('create-key').onclick = () => {
    dshPost('/api/v1/account/device-keys', { label: $('key-label').value.trim() || 'device' }).then((r) => {
      if (r.ok) { dshToast('密钥已生成，可在列表中显示或复制', 'ok'); $('key-label').value = ''; load() }
      else dshToast(dshFail(r.body, r.status), 'err')
    })
  }
}
