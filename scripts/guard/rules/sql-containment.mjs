import { readLines, rel, walk } from '../lib.mjs'

// Case-sensitive on purpose: SQL in this repository is upper-case, while the
// HTML produced by pages.ts contains lower-case <select> elements.
const SQL = /\b(SELECT\s|INSERT\s+INTO\b|UPDATE\s+[a-z_"]+\s+SET\b|DELETE\s+FROM\b|CREATE\s+TABLE\b|ALTER\s+TABLE\b|DROP\s+TABLE\b|TRUNCATE\b)/

export const rule = {
  id: 'sql-containment',
  title: 'SQL 只允许出现在 schema.ts 与 store-pg.ts',
  run(ctx) {
    const violations = []
    const allowed = new Set(ctx.policy.sqlFiles)
    const exemptions = ctx.policy.sqlExemptions

    for (const file of walk(ctx.path(ctx.root, 'server/src'), { match: f => f.endsWith('.ts') })) {
      const key = rel(ctx.root, file)
      if (allowed.has(key)) continue
      readLines(file).forEach((line, index) => {
        if (!SQL.test(line) || line.trim().startsWith('*') || line.trim().startsWith('//')) return
        if (exemptions.some(e => e.file === key && line.includes(e.pattern))) return
        violations.push(ctx.violation(key, index + 1, 'SQL 出现在允许清单之外：' + line.trim().slice(0, 80)))
      })
    }
    return { violations, notes: ['允许：' + [...allowed].join(', ') + '；豁免 ' + exemptions.length + ' 条'] }
  },
}
