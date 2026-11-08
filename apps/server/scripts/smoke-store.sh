#!/usr/bin/env bash
# Runs the store, the runtime-config layer and the HTTP surface against pg-mem.
# No database and no Docker required.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=".smoke"
TSC="${TSC:-npx --yes tsc}"
rm -rf "$OUT"
mkdir -p "$OUT/src" "$OUT/node_modules/@dsh-remote/protocol"
cp src/*.ts "$OUT/src/"
cp -r ../../packages/protocol/src "$OUT/src/protocol"

$TSC "$OUT/src/protocol/index.ts" --outDir "$OUT/build" \
  --target es2022 --module nodenext --moduleResolution nodenext \
  --skipLibCheck --declaration --types node
cp "$OUT/build/index.d.ts" "$OUT/node_modules/@dsh-remote/protocol/index.d.ts"
cat > "$OUT/node_modules/@dsh-remote/protocol/package.json" <<'JSON'
{ "name": "@dsh-remote/protocol", "version": "0.0.0", "type": "module",
  "main": "index.js", "types": "index.d.ts",
  "exports": { ".": { "types": "./index.d.ts", "default": "./index.js" } } }
JSON
cat > "$OUT/node_modules/@dsh-remote/protocol/index.js" <<'JSON'
export * from '../../../build/index.js'
JSON

$TSC "$OUT/src/app.ts" "$OUT/src/store-pg.ts" --outDir "$OUT/build" \
  --target es2022 --module nodenext --moduleResolution nodenext \
  --skipLibCheck --strict --types node
cp tests/*.mjs "$OUT/"
# pg-smoke 仅在设置 DATABASE_URL 时运行
if [ -n "${DATABASE_URL:-}" ]; then node "$OUT/pg-smoke.mjs"; fi
cd "$OUT"
node store-smoke.mjs
node runtime-smoke.mjs
node http-smoke.mjs
node e2e-lifecycle.mjs
node e2e-auth.mjs
node e2e-oidc.mjs
node e2e-account.mjs
node e2e-journey.mjs
