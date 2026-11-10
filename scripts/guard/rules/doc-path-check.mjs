import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { walk, rel } from '../lib.mjs'

const PATH = /(?<![A-Za-z0-9_./-])((?:server|web|packages|docs|scripts)\/[A-Za-z0-9_.@/-]+\.(?:tsx|ts|mjs|json|jsx|js|css|md|yaml|yml|sh|sql))(?![A-Za-z0-9])/g

export const rule = {
  id: 'doc-path-check',
  title: '文档里引用的仓库路径必须存在',
  run(ctx) {
    const violations = []
    const files = []
    for (const entry of ctx.policy.docRoots) {
      const full = join(ctx.root, entry)
      if (!existsSync(full)) continue
      if (statSync(full).isDirectory()) files.push(...walk(full, { match: f => f.endsWith('.md') }))
      else files.push(full)
    }

    for (const file of files) {
      const key = rel(ctx.root, file)
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        for (const hit of line.matchAll(PATH)) {
          const cited = hit[1]
          if (cited.includes('*') || cited.includes('<')) continue
          if (!existsSync(join(ctx.root, cited))) {
            violations.push(ctx.violation(key, index + 1, '引用了不存在的路径：' + cited))
          }
        }
      })
    }
    return { violations, notes: [`扫描 ${files.length} 份文档`] }
  },
}
