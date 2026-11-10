import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { walk, rel } from '../lib.mjs'

const PATTERNS = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: '私钥材料' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: 'AWS access key' },
  { re: /\bghp_[A-Za-z0-9]{36}\b/, label: 'GitHub token' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, label: 'Slack token' },
  { re: /\beyJhbGciOi[A-Za-z0-9_-]{10,}\./, label: '字面 JWT' },
]

export const rule = {
  id: 'secret-scan',
  title: '源码与文档不得出现真实凭据',
  run(ctx) {
    const violations = []
    const files = []
    for (const dir of [...ctx.policy.sourceRoots, 'docs']) {
      const full = join(ctx.root, dir)
      if (existsSync(full)) files.push(...walk(full, { match: f => /\.(ts|js|mjs|md|json|css)$/.test(f) }))
    }

    for (const file of files) {
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        for (const { re, label } of PATTERNS) {
          if (re.test(line)) violations.push(ctx.violation(rel(ctx.root, file), index + 1, '疑似' + label))
        }
      })
    }
    return { violations, notes: [`扫描 ${files.length} 个文件`] }
  },
}
