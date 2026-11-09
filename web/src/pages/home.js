import { $, dshApi } from '../shared.js'

export function init() {
  dshApi('/api/v1/account/devices').then((r) => { $('deviceCount').textContent = (r.body.items || []).length }).catch(() => {})
  fetch('/ready').then((r) => { $('health').textContent = r.ok ? '在线' : '异常' }).catch(() => { $('health').textContent = '异常' })
}
