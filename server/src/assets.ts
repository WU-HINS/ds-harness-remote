import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The browser bundle is built by the web workspace and merged into the server
 * output at package time (server/dist/web). The server never parses or rewrites
 * it: it only serves the hashed files named in the manifest.
 */
interface Manifest { js: string; css: string }

const here = dirname(fileURLToPath(import.meta.url))

function locate(): { dir: string; manifest: Manifest } | undefined {
  const candidates = [
    process.env.DSH_WEB_DIR,
    join(here, 'web'),           // dist/web after the server build copies it
    join(here, '..', '..', 'web', 'dist'), // running from source in dev
  ].filter(Boolean) as string[]
  for (const dir of candidates) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest
      if (manifest.js && manifest.css) return { dir, manifest }
    } catch { /* try the next location */ }
  }
  return undefined
}

const found = locate()

export const webAssets = found?.manifest
export const webAssetsMissing = found === undefined

export function readAsset(name: string): { body: Buffer; type: string } | undefined {
  if (!found || !/^[a-z0-9.]+\.(js|css)$/.test(name)) return undefined
  try {
    const body = readFileSync(join(found.dir, name))
    const type = name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8'
    return { body, type }
  } catch { return undefined }
}
