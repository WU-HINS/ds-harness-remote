import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const rule = {
  id: 'version-lockstep',
  title: '发布版本三处 package.json 必须一致；协议包独立语义化',
  run(ctx) {
    const read = path => JSON.parse(readFileSync(join(ctx.root, path), 'utf8'))
    const versions = { 'package.json': read('package.json').version, 'server/package.json': read('server/package.json').version, 'web/package.json': read('web/package.json').version }
    const violations = []
    const distinct = new Set(Object.values(versions))
    if (distinct.size !== 1) {
      for (const [file, version] of Object.entries(versions)) violations.push(ctx.violation(file, 0, '版本不一致：' + version))
    }

    const protocol = read('packages/protocol/package.json')
    if (!/^\d+\.\d+\.\d+$/.test(protocol.version)) violations.push(ctx.violation('packages/protocol/package.json', 0, '协议包版本不是语义化版本：' + protocol.version))
    const dep = read('server/package.json').dependencies?.['@dsh-remote/protocol']
    if (dep !== 'workspace:*') violations.push(ctx.violation('server/package.json', 0, '服务端必须以 workspace:* 依赖协议包，实际：' + dep))

    const readme = readFileSync(join(ctx.root, 'README.md'), 'utf8')
    if (!readme.includes(versions['package.json'])) ctx.notes?.push?.('README 未出现当前版本号（可选）')
    return { violations, notes: [`版本 ${versions['package.json']}；协议 ${protocol.version}`] }
  },
}
