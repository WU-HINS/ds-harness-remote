import { readLines, rel, walk } from '../lib.mjs'

const SOURCE = /\.(ts|tsx|js|mjs|css)$/

export const rule = {
  id: 'file-budget',
  title: '文件行数预算只降不升，超 600 行必须登记',
  run(ctx) {
    const violations = []
    const notes = []
    const seen = new Set()

    for (const dir of ctx.policy.sourceRoots) {
      for (const file of walk(ctx.path(ctx.root, dir), { match: f => SOURCE.test(f) })) {
        const key = rel(ctx.root, file)
        const lines = readLines(file).length
        const budget = ctx.policy.budgets[key]
        if (budget === undefined) {
          if (lines > ctx.policy.budgetedAbove) {
            violations.push(ctx.violation(key, 1, `${lines} 行，超过 ${ctx.policy.budgetedAbove} 行却未登记预算`))
          }
          continue
        }
        seen.add(key)
        const note = ctx.policy.budgetNotes?.[key]
        if (note) notes.push(key + ' — ' + note)
        if (lines > budget) {
          violations.push(ctx.violation(key, budget + 1, `${lines} 行，超出预算 ${budget} 行 (+ ${lines - budget})`))
        } else if (lines < budget) {
          notes.push(`${key} 可下调预算 ${budget} → ${lines}`)
        } else {
          notes.push(`${key} 已到预算上限 ${budget}`)
        }
      }
    }

    for (const key of Object.keys(ctx.policy.budgets)) {
      if (!seen.has(key)) violations.push(ctx.violation(key, 0, '预算表登记了不存在的文件'))
    }
    return { violations, notes }
  },
}
