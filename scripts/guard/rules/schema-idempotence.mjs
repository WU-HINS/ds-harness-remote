import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const IDEMPOTENT = /(IF NOT EXISTS|IF EXISTS|WHERE\b)/i

export const rule = {
  id: 'schema-idempotence',
  title: '声明式 schema：每条语句重跑都必须是无操作',
  run(ctx) {
    const file = join(ctx.root, 'server/src/schema.ts')
    const source = readFileSync(file, 'utf8')
    const violations = []

    const blocks = [
      { name: 'SCHEMA_STATEMENTS', start: source.indexOf('SCHEMA_STATEMENTS') },
      { name: 'SCHEMA_NORMALISE', start: source.indexOf('SCHEMA_NORMALISE') },
    ]

    for (const statement of source.matchAll(/^\s*["'`](.+)["'`],?$/gm)) {
      const sql = statement[1]
      if (!/^(CREATE|ALTER|DROP|UPDATE|INSERT|DELETE|TRUNCATE)\b/i.test(sql)) continue
      const at = statement.index ?? 0
      const block = [...blocks].reverse().find(b => b.start >= 0 && at > b.start)?.name ?? 'UNKNOWN'
      if (!IDEMPOTENT.test(sql)) {
        violations.push(ctx.violation('server/src/schema.ts', source.slice(0, at).split('\n').length,
          block + ' 非幂等语句：' + sql.slice(0, 70)))
      }
      if (/^DROP\s/i.test(sql)) {
        violations.push(ctx.violation('server/src/schema.ts', source.slice(0, at).split('\n').length,
          'DROP 不允许进入声明式 schema：' + sql.slice(0, 70)))
      }
    }
    return { violations, notes: [] }
  },
}
