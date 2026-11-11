import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { walk } from '../lib.mjs'

/** Only the first literal argument of a test call is a named case. */
const NAMED_CASE = /(?:\bcheck|\bexpectReject|\bit|\btest)\(\s*(['"`])([^'"`]*?)\1/g
const INVARIANT_ID = /\[(O[1-7]|M[1-5]|K[1-7])\]/g

/** Remove comments while preserving string literals, so a commented tag cannot count. */
function stripComments(source) {
  let out = '', quote = ''
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i], next = source[i + 1]
    if (quote) {
      out += char
      if (char === '\\') { out += next ?? ''; i += 1; continue }
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; out += char; continue }
    if (char === '/' && next === '/') { while (i < source.length && source[i] !== '\n') i += 1; out += '\n'; continue }
    if (char === '/' && next === '*') { i += 2; while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1; i += 1; continue }
    out += char
  }
  return out
}

export const rule = {
  id: 'invariant-coverage',
  title: 'C1/C2/C3 的每条不变量都必须有具名用例（[O1]…[K7]）',
  run(ctx) {
    const required = Object.keys(ctx.policy.invariants ?? {})
    const covered = new Set()

    const files = [
      ...walk(join(ctx.root, 'server/tests'), { match: file => file.endsWith('.mjs') }),
      ...walk(join(ctx.root, 'packages/protocol/tests'), { match: file => file.endsWith('.ts') }),
    ]
    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'))
      for (const hit of source.matchAll(NAMED_CASE)) {
        for (const id of hit[2].matchAll(INVARIANT_ID)) covered.add(id[1])
      }
    }

    const violations = required
      .filter(id => !covered.has(id))
      .map(id => ctx.violation('scripts/guard/policy.json', 0,
        '不变量 ' + id + ' 没有具名用例：在测试名里加 [' + id + ']（' + ctx.policy.invariants[id] + '）'))
    return {
      violations,
      notes: ['不变量 ' + required.length + ' 条，具名覆盖 ' + required.filter(id => covered.has(id)).length + ' 条'],
    }
  },
}
