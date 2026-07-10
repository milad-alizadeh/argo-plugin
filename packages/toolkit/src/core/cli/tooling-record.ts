import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { argoConfigPath } from '../../config/argo-paths.js'

const LSP_POSTURES = new Set(['wired', 'recommended-not-installed'])

/**
 * Stamps one language's LSP wiring posture into `.argo/config.json`'s
 * `tooling.lsp` index (SKILL.md §8c). Preserves every other key in the file
 * verbatim — a targeted merge, not a config rewrite. The only sanctioned
 * writer for this surface (`.argo/config.json` is a protected path; the
 * playbook-permission hook allows CLI-verb writes but blocks direct
 * Edit/Write/Bash-redirect targeting it).
 */
export function recordLspPosture(language: string, posture: string, opts: { cwd?: string } = {}): void {
  if (!LSP_POSTURES.has(posture)) {
    throw new Error(`invalid LSP posture "${posture}" (known: ${[...LSP_POSTURES].join('|')})`)
  }
  const path = argoConfigPath(opts.cwd ?? process.cwd())
  const existing = existsSync(path) ? safeParse(readFileSync(path, 'utf8')) : {}
  const tooling = { ...(existing.tooling ?? {}) }
  const lsp = { ...(tooling.lsp ?? {}), [language]: posture }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ ...existing, tooling: { ...tooling, lsp } }, null, 2)}\n`)
}

function safeParse(raw: string): Record<string, any> {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {} // malformed config — start clean rather than throw mid-init
  }
}
