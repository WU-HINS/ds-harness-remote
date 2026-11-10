import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep, posix } from 'node:path'

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Recursively list files under `dir`, skipping build output and dependencies. */
export function walk(dir, options = {}) {
  const { skip = ['node_modules', 'dist', '.smoke', '.git', 'browser-shots'], match = () => true } = options
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir)) {
    if (skip.includes(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full, options))
    else if (match(full)) out.push(full)
  }
  return out
}

export function toPosix(path) {
  return path.split(sep).join(posix.sep)
}

export function rel(root, file) {
  return toPosix(relative(root, file))
}

export function readLines(file) {
  return readFileSync(file, 'utf8').split('\n')
}

/** Violation helper: every rule reports through this shape. */
export function violation(file, line, message) {
  return { file, line, message }
}
