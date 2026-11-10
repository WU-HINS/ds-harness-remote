#!/usr/bin/env node
/**
 * Static invariant gate. Every rule is a claim in root.ai.md turned into code.
 * Exit 0 = all clear. Exit 1 = at least one violation, printed with file:line.
 *
 *   node scripts/guard/index.mjs            # run every rule
 *   node scripts/guard/index.mjs --only sql-containment
 *   node scripts/guard/index.mjs --update   # re-baseline file budgets (review required)
 *   node scripts/guard/index.mjs --sync     # rebuild repo/root.ai.md from the project-root contract
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rules } from './rules/index.mjs'
import { readLines, rel, violation } from './lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const policyPath = join(here, 'policy.json')
const policy = JSON.parse(readFileSync(policyPath, 'utf8'))

const argv = process.argv.slice(2)
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null
const sync = argv.includes('--sync')
const update = argv.includes('--update')

if (update) {
  let total = 0
  for (const [key] of Object.entries(policy.budgets)) {
    policy.budgets[key] = readLines(join(root, key)).length
    total += 1
  }
  writeFileSync(policyPath, JSON.stringify(policy, null, 2) + '\n')
  console.log(`guard: re-baselined ${total} budgets — commit the diff with a reason`)
  process.exit(0)
}

const ctx = {
  root,
  policy,
  path: join,
  rel: file => rel(root, file),
  violation: (file, line, message) => violation(file, line, message),
  sync,
}

let failed = 0
const rows = []
for (const rule of rules) {
  if (only && rule.id !== only) continue
  let result
  try {
    result = rule.run(ctx)
  } catch (error) {
    result = { violations: [violation('scripts/guard/' + rule.id, 0, '规则自身异常：' + error.message)], notes: [] }
  }
  const status = result.violations.length === 0 ? 'ok  ' : 'FAIL'
  if (result.violations.length) failed += 1
  rows.push({ status, id: rule.id, title: rule.title, ...result })
}

for (const row of rows) {
  console.log(`${row.status} ${row.id.padEnd(20)} ${row.title}`)
  for (const note of row.notes ?? []) console.log(`     · ${note}`)
  for (const item of row.violations) console.log(`     ✗ ${item.file}:${item.line} ${item.message}`)
}

if (sync) console.log('guard: sync requested — repo/root.ai.md rebuilt from ../root.ai.md')

const total = rows.reduce((sum, row) => sum + row.violations.length, 0)
console.log(`\nguard: ${rows.length} rules, ${total} violation(s), ${failed} rule(s) failing`)
process.exit(total === 0 ? 0 : 1)
