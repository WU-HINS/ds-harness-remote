import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BACKTICK = String.fromCharCode(96)
const INLINE_CODE = new RegExp(BACKTICK + '([^' + BACKTICK + '\\n]+)' + BACKTICK, 'g')
const EXACT_ROUTE = /path === '(\/api\/[^']*)'/g
/** Family prefix of a router regex:  /^\/api\/v1\/devices\/([^/]+)$/  →  /api/v1/devices/ */
const REGEX_FAMILY = /\^((?:\\\/[A-Za-z0-9._-]+)+)/g

const normalize = path => (path.replace(/\?.*$/, '').replace(/\/$/, '') || '/')

export function codeRoutes(root) {
  const source = readFileSync(join(root, 'server/src/app.ts'), 'utf8')
  const exact = new Set()
  const families = new Set()

  for (const hit of source.matchAll(EXACT_ROUTE)) exact.add(normalize(hit[1]))
  for (const hit of source.matchAll(REGEX_FAMILY)) {
    const family = hit[1].split('\\/').join('/')
    if (family.startsWith('/api/')) families.add(family)
  }
  return { exact, families }
}

function documentedRoutes(root) {
  const docs = ['docs/api.md', 'docs/auth.md', 'docs/configuration.md', 'docs/operations.md', 'README.md', 'root.ai.md']
    .map(file => join(root, file))
    .filter(existsSync)
  const documented = new Set()

  for (const file of docs) {
    for (const hit of readFileSync(file, 'utf8').matchAll(INLINE_CODE)) {
      const token = hit[1].trim()
      if (!token.startsWith('/api/')) continue
      if (/^\/api(\/v1)?$/.test(token)) continue // prefix mention, not a route
      documented.add(normalize(token.split(' ')[0]))
    }
  }
  return documented
}

export const rule = {
  id: 'route-doc-sync',
  title: 'docs/api.md 必须覆盖 app.ts 里的每一条 /api 路由（含 :id 家族）',
  run(ctx) {
    const { exact, families } = codeRoutes(ctx.root)
    const docs = documentedRoutes(ctx.root)
    const allow = new Map(ctx.policy.routeAllowlist.map(entry => [entry.path, entry.reason]))
    const violations = []
    const notes = []

    for (const route of [...exact].sort()) {
      if (docs.has(route)) continue
      if (allow.has(route)) {
        notes.push('登记豁免 ' + route + ' — ' + allow.get(route))
        continue
      }
      violations.push(ctx.violation('docs/api.md', 0, '未文档化路由：' + route))
    }

    for (const family of [...families].sort()) {
      if (allow.has(family)) {
        notes.push('登记豁免家族 ' + family + ' — ' + allow.get(family))
        continue
      }
      const covered = [...docs].some(route => route.startsWith(family))
      if (!covered) violations.push(ctx.violation('docs/api.md', 0, '未文档化路由家族：' + family + '…'))
    }

    for (const path of allow.keys()) {
      const exists = exact.has(path) || families.has(path)
      if (!exists) violations.push(ctx.violation('scripts/guard/policy.json', 0, '豁免了不存在的路由：' + path))
    }

    const stale = [...docs].filter(route => route.startsWith('/api') && !exact.has(route) && ![...families].some(f => route.startsWith(f)))
    for (const route of stale) violations.push(ctx.violation('docs/api.md', 0, '文档写了一条代码里不存在的路由：' + route))

    notes.push('代码：' + exact.size + ' 条精确路由，' + families.size + ' 个路由家族；文档收录 ' + docs.size + ' 条')
    return { violations, notes }
  },
}
