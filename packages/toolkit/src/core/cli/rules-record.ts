import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { argoConfigPath } from '../../config/argo-paths.js'

/**
 * Stamps one installed template-derived file's source-template hash into
 * `.argo/config.json`'s `provenance`, keyed by repo-relative installed path
 * so any template-installed file can share the same map. Preserves every
 * other key in the file verbatim — a targeted merge, not a config rewrite.
 */
export function recordProvenance(installedPath: string, hash: string, opts: { cwd?: string } = {}): void {
  const path = argoConfigPath(opts.cwd ?? process.cwd())
  const existing = existsSync(path) ? safeParse(readFileSync(path, 'utf8')) : {}
  const provenance = { ...(existing.provenance ?? {}), [installedPath]: hash }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ ...existing, provenance }, null, 2)}\n`)
}

function safeParse(raw: string): Record<string, any> {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {} // malformed config — start clean rather than throw mid-init
  }
}
