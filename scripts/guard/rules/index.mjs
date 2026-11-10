import { rule as fileBudget } from './file-budget.mjs'
import { rule as sqlContainment } from './sql-containment.mjs'
import { rule as consoleContainment } from './console-containment.mjs'
import { rule as schemaIdempotence } from './schema-idempotence.mjs'
import { rule as routeDocSync } from './route-doc-sync.mjs'
import { rule as forkSurface } from './fork-surface.mjs'
import { rule as docPathCheck } from './doc-path-check.mjs'
import { rule as testWiring } from './test-wiring.mjs'
import { rule as versionLockstep } from './version-lockstep.mjs'
import { rule as secretScan } from './secret-scan.mjs'
import { rule as rootMirror } from './root-mirror.mjs'

export const rules = [
  fileBudget,
  sqlContainment,
  consoleContainment,
  schemaIdempotence,
  routeDocSync,
  forkSurface,
  docPathCheck,
  testWiring,
  versionLockstep,
  secretScan,
  rootMirror,
]
