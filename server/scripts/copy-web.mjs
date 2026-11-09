#!/usr/bin/env node
// Merge step: the browser bundle built by the web workspace becomes part of the
// server output. Nothing is shared at runtime except these static files.
import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = process.env.DSH_WEB_DIR ?? join(here, '..', '..', 'web', 'dist')
const target = join(here, '..', 'dist', 'web')

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(source, target, { recursive: true })
console.log('merged web assets into dist/web')
