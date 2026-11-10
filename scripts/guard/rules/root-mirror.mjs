import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MARKER = /<!--\s*mirror:begin[^>]*-->/
const HEADER = '<!-- generated file · do not edit · source: ../root.ai.md (project root) · rebuild: pnpm guard --sync -->\n<!-- mirror:begin -->\n'

/**
 * The contract lives at the project root and is mirrored into the repository so
 * that it is versioned and readable by CI. The mirror is derived, never edited:
 * every change lands in ../root.ai.md and is copied down by `pnpm guard --sync`.
 * A checkout without the project root falls back to the repository copy.
 */
export const rule = {
  id: 'root-mirror',
  title: '仓库内 root.ai.md 必须是项目根版本的逐字镜像',
  run(ctx) {
    const source = join(ctx.root, '..', 'root.ai.md')
    const mirrorPath = join(ctx.root, 'root.ai.md')
    const violations = []
    const notes = []

    if (!existsSync(source)) {
      notes.push('项目根 root.ai.md 不存在（CI 检出属正常），以仓库内镜像为权威')
      if (!existsSync(mirrorPath)) violations.push(ctx.violation('root.ai.md', 0, '项目根与仓库内都没有 root.ai.md'))
      return { violations, notes }
    }

    const body = readFileSync(source, 'utf8')

    if (ctx.sync) {
      writeFileSync(mirrorPath, HEADER + body)
      notes.push('已重建镜像（' + body.split('\n').length + ' 行）')
      return { violations, notes }
    }

    if (!existsSync(mirrorPath)) {
      violations.push(ctx.violation('root.ai.md', 0, '仓库内缺少镜像，运行 pnpm guard --sync'))
      return { violations, notes }
    }

    const mirror = readFileSync(mirrorPath, 'utf8')
    const match = MARKER.exec(mirror)
    if (!match) {
      violations.push(ctx.violation('root.ai.md', 0, '镜像缺少 mirror:begin 标记，无法判定正文边界'))
      return { violations, notes }
    }

    const afterMarker = mirror.slice(match.index + match[0].length).replace(/^\n+/, '')
    if (afterMarker === body) {
      notes.push('镜像一致（' + body.split('\n').length + ' 行）')
      return { violations, notes }
    }

    const left = afterMarker.split('\n')
    const right = body.split('\n')
    const at = left.findIndex((line, index) => line !== right[index])
    const index = at === -1 ? Math.min(left.length, right.length) : at
    violations.push(ctx.violation('root.ai.md', index + 1,
      '镜像与项目根版本不一致（首个差异：镜像 ' + (left[index] ?? '<EOF>').slice(0, 40) + ' / 项目根 ' + (right[index] ?? '<EOF>').slice(0, 40) + '），运行 pnpm guard --sync'))
    return { violations, notes }
  },
}
