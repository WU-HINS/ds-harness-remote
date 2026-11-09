#!/usr/bin/env node
// Bundles the browser assets into web/dist with content hashes. The server build
// copies that directory into server/dist/web, so the two halves only meet at
// build time.
import { build, context } from 'esbuild'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'dist')
const watch = process.argv.includes('--watch')

const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10)

async function emit() {
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })

  const js = await build({
    entryPoints: [join(here, 'src/app.js')],
    bundle: true, minify: true, format: 'iife', target: ['es2020'],
    write: false, legalComments: 'none',
  })
  const jsBytes = js.outputFiles[0].contents
  const jsName = 'app.' + hash(jsBytes) + '.js'
  await writeFile(join(out, jsName), jsBytes)

  const cssBytes = await readFile(join(here, 'src/app.css'))
  const cssName = 'app.' + hash(cssBytes) + '.css'
  await writeFile(join(out, cssName), cssBytes)

  await writeFile(join(out, 'manifest.json'), JSON.stringify({ js: jsName, css: cssName }, null, 2) + '\n')
  console.log('web assets: ' + jsName + ' (' + jsBytes.length + ' B), ' + cssName + ' (' + cssBytes.length + ' B)')
}

if (watch) {
  await emit()
  const ctx = await context({
    entryPoints: [join(here, 'src/app.js')],
    bundle: true, format: 'iife', target: ['es2020'], outfile: join(out, 'app.watch.js'),
  })
  await ctx.watch()
  console.log('watching web/src …')
} else {
  await emit()
}
