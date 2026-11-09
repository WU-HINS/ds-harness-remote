import { $, dshApi, dshPost, dshCopy, dshToast, dshFail } from '../shared.js'

export function init() {
  dshApi('/api/v1/account/devices').then((r) => { $('deviceCount').textContent = (r.body.items || []).length }).catch(() => {})
  fetch('/ready').then((r) => { $('health').textContent = r.ok ? '在线' : '异常' }).catch(() => { $('health').textContent = '异常' })

  document.addEventListener('click', (e) => {
    const copy = e.target.closest('[data-copy]')
    if (copy) { dshCopy(copy.getAttribute('data-copy')); return }
    const gen = e.target.closest('#gen-key')
    if (!gen) return
    gen.disabled = true
    dshPost('/api/v1/account/device-keys', { label: 'desktop' }).then((r) => {
      gen.disabled = false
      const key = r.body && r.body.key
      if (!r.ok || !key) { dshToast(dshFail(r.body, r.status), 'err'); return }
      const box = $('connect-key')
      if (box) box.textContent = key
      dshCopy(key)
      dshToast('密钥已生成并复制，粘贴到桌面端的远程设置里', 'ok')
      if (gen.parentElement && gen.parentElement.parentElement) {
        const row = gen.parentElement.parentElement
        if (!row.querySelector('[data-copy]')) {
          const b = document.createElement('button')
          b.className = 'btn ghost sm'; b.type = 'button'; b.setAttribute('data-copy', key); b.textContent = '复制'
          row.appendChild(b)
        }
      }
    })
  })
}
