import { codeRoutes } from './route-doc-sync.mjs'

/**
 * This repository is a minimal server-side implementation of the upstream
 * protocol plus three deliberate capabilities: OIDC, multi-user, multi-key.
 * Every route must belong to a declared capability family, so adding a family
 * is a design decision that has to be written down before it ships.
 */
export const rule = {
  id: 'fork-surface',
  title: '每条 /api 路由必须落在已登记的能力家族内（最小面原则）',
  run(ctx) {
    const { exact, families } = codeRoutes(ctx.root)
    const groups = ctx.policy.routeGroups ?? []
    const routes = [...exact, ...families]
    const violations = []
    const notes = []

    const owner = path => groups.find(group => path === group.prefix || path.startsWith(group.prefix + '/'))

    for (const route of [...routes].sort()) {
      if (owner(route)) continue
      violations.push(ctx.violation('scripts/guard/policy.json', 0,
        '路由没有能力归属：' + route + '（先在 routeGroups 登记，并在 root.ai.md §0.1 说明它属于上游协议必需还是 C1/C2/C3）'))
    }
    for (const group of groups) {
      if (!routes.some(route => owner(route) === group)) notes.push('已登记但当前无路由：' + group.prefix + ' — ' + group.capability)
    }
    notes.push('能力家族 ' + groups.length + ' 个，路由 ' + routes.length + ' 条')
    return { violations, notes }
  },
}
