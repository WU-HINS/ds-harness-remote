import { createApp } from './app.js'
import { loadSettings } from './settings.js'

const settings = loadSettings()
const app = createApp(settings)

const started = await app.start()
console.info('DSH Remote server listening on ' + settings.host + ':' + settings.port)
if (started.setupKey) {
  console.info('============================================================')
  console.info(' 首次初始化密钥（仅本次有效，也可用 DSH_SETUP_KEY 覆盖）:')
  console.info('   ' + started.setupKey)
  console.info(' 打开 ' + settings.publicUrl.origin + '/setup?key=<上方密钥> 创建管理员')
  console.info('============================================================')
}

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    void app.close().then(() => { process.exitCode = 0 }, () => { process.exitCode = 1 })
  })
}
