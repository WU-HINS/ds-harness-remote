import { readLines, rel, walk } from '../lib.mjs'

export const rule = {
  id: 'console-containment',
  title: '日志出口唯一：console 只允许在 logger/main/config 中出现',
  run(ctx) {
    const violations = []
    const allowed = new Set(ctx.policy.consoleFiles)
    const exemptions = ctx.policy.consoleExemptions
    const hits = new Map()

    for (const file of walk(ctx.path(ctx.root, 'server/src'), { match: f => f.endsWith('.ts') })) {
      const key = rel(ctx.root, file)
      if (allowed.has(key)) continue
      readLines(file).forEach((line, index) => {
        if (!/console\.(log|info|warn|error|debug)\s*\(/.test(line)) return
        const exempt = exemptions.find(e => e.file === key)
        if (exempt) { hits.set(key, (hits.get(key) ?? 0) + 1); return }
        violations.push(ctx.violation(key, index + 1, 'console 绕过结构化日志：' + line.trim().slice(0, 80)))
      })
    }

    for (const exempt of exemptions) {
      const used = hits.get(exempt.file) ?? 0
      if (used > exempt.max) violations.push(ctx.violation(exempt.file, 0, `豁免上限 ${exempt.max}，实际 ${used}`))
    }
    return { violations, notes: [`允许：${[...allowed].join(', ')}`] }
  },
}
