import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { walk, rel } from '../lib.mjs'
import { dirname, join } from 'node:path'

export const rule = {
  id: 'test-wiring',
  title: '写了测试就必须有人执行：根 test 覆盖全部 workspace，脚本覆盖全部用例文件',
  run(ctx) {
    const violations = []
    const notes = []

    const rootPkg = JSON.parse(readFileSync(join(ctx.root, 'package.json'), 'utf8'))
    const test = rootPkg.scripts?.test ?? ''
    for (const workspace of ['@dsh-remote/server', '@dsh-remote/protocol']) {
      const covered = test.includes(workspace) || /pnpm\s+(-r|--recursive)\s+test/.test(test)
      if (!covered) violations.push(ctx.violation('package.json', 0, `根 test 未覆盖 ${workspace}`))
    }

    const smoke = readFileSync(join(ctx.root, 'server/scripts/smoke-store.sh'), 'utf8')
    for (const file of readdirSync(join(ctx.root, 'server/tests'))) {
      if (!file.endsWith('.mjs')) continue
      if (!smoke.includes(file)) violations.push(ctx.violation('server/scripts/smoke-store.sh', 0, `用例未被任何门禁执行：${file}`))
    }

    const protocol = JSON.parse(readFileSync(join(ctx.root, 'packages/protocol/package.json'), 'utf8'))
    if (!protocol.scripts?.test) violations.push(ctx.violation('packages/protocol/package.json', 0, '缺少 test 脚本'))
    for (const file of readdirSync(join(ctx.root, 'packages/protocol/tests'))) {
      if (!/\.(test|spec)\.ts$/.test(file)) continue
      notes.push('protocol 用例：' + file)
    }

    const pnpmWorkspace = readFileSync(join(ctx.root, 'pnpm-workspace.yaml'), 'utf8')
    const declared = { 'server': pnpmWorkspace.includes('server'), 'web': pnpmWorkspace.includes('web'), 'packages/protocol': pnpmWorkspace.includes('packages/*') }
    for (const dir of ['server', 'web', 'packages/protocol']) {
      if (!declared[dir]) violations.push(ctx.violation('pnpm-workspace.yaml', 0, 'workspace 未登记：' + dir))
      if (!existsSync(join(ctx.root, dir, 'package.json'))) violations.push(ctx.violation(dir, 0, '缺少 package.json'))
    }

    // A test that imports a missing module is not a test. This is how five
    // protocol suites died silently in the standalone-server refactor.
    for (const dir of ctx.policy.testRoots) {
      for (const file of walk(join(ctx.root, dir), { match: f => /\.(mjs|ts)$/.test(f) })) {
        const source = readFileSync(file, 'utf8')
        for (const hit of source.matchAll(/^\s*import[^'"]*['"](\.[^'"]+)['"]/gm)) {
          const specifier = hit[1]
          if (/(^|\/)build\//.test(specifier)) continue // compiled by the smoke runner
          const base = join(dirname(file), specifier)
          const candidates = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.mjs'), base + '.ts', base + '.mjs', base + '.js', join(base, 'index.ts')]
          if (!candidates.some(path => existsSync(path))) {
            violations.push(ctx.violation(rel(ctx.root, file), 0, '未解析的相对导入：' + specifier))
          }
        }
      }
    }

    return { violations, notes }
  },
}
