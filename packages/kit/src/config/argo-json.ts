/**
 * `.claude/argo.json` — the kit's consolidated per-project config (decision 8)
 * — and the dual-mode hook-resolution logic the design commit gates arm from.
 *
 * Shape (design section):
 *   { "design": { "<appKey>": { "root": "<app dir, repo-root-relative>",
 *                               "componentsPath": "<relative to root>" } } }
 * Single-repo: one entry keyed "." with root ".". Monorepo: one entry per
 * app, keyed by the app dir (e.g. "apps/desktop"). A gate arms for an app iff
 * its design block exists AND a staged file falls under that app's resolved
 * componentsPath — matched repo-root-relative, which is the fix for the old
 * `design/config.json`-presence arming that silently no-oped per-app in
 * monorepos.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, relative, dirname, sep } from 'node:path'

export type DesignBlock = { root?: string; componentsPath?: string; recipe?: string; [key: string]: unknown }
export type ArgoConfig = { design?: Record<string, DesignBlock> }
export type FoundArgoJson = { repoRoot: string; config: ArgoConfig }

/**
 * Walk up from `cwd` to the first directory containing `.claude/argo.json`.
 * Returns null when absent or malformed — callers treat both as "not an
 * argo project", inert, no throw.
 */
export function findArgoJson(cwd: string): FoundArgoJson | null {
  let dir = resolve(cwd)
  while (true) {
    const candidate = join(dir, '.claude', 'argo.json')
    if (existsSync(candidate)) {
      try {
        return { repoRoot: dir, config: JSON.parse(readFileSync(candidate, 'utf8')) }
      } catch {
        return null // malformed config — inert, never a crash inside a hook
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** The app's design block, or null — arming is presence of `design[appKey]`. */
export function resolveDesignArming(config: ArgoConfig | undefined, appKey: string): DesignBlock | null {
  return config?.design?.[appKey] ?? null
}

/**
 * design.<app> blocks the setup-design skill has SET UP (stamped a `recipe`
 * into) — the design-pack-installed marker. Init-seeded inert `{}` blocks
 * don't count, and neither does a legacy `design/config.json` (no-legacy
 * ruling: pre-kit projects rip and re-init).
 */
export function setUpDesignApps(config: ArgoConfig | undefined): { appKey: string; block: DesignBlock }[] {
  return Object.entries(config?.design ?? {})
    .filter(([, block]) => typeof block?.recipe === 'string')
    .map(([appKey, block]) => ({ appKey, block }))
}

/** Absolute components dir: join(repoRoot, block.root, block.componentsPath). */
export function resolveComponentsPath(repoRoot: string, designBlock: DesignBlock): string {
  return resolve(repoRoot, designBlock.root ?? '.', designBlock.componentsPath as string)
}

/**
 * True iff any staged file (repo-root-relative, as `git diff --cached
 * --name-only` prints them) is the resolved components dir or inside it.
 */
export function matchesStagedFile(resolvedComponentsPath: string, repoRoot: string, stagedRepoRelativePaths: string[]): boolean {
  const rel = relative(resolve(repoRoot), resolvedComponentsPath)
  const prefix = rel.endsWith(sep) ? rel : `${rel}${sep}`
  return stagedRepoRelativePaths.some((f) => f === rel || f.startsWith(prefix))
}

export type ArmedDesignApp = {
  appKey: string
  block: DesignBlock
  componentsPath: string
  designDir: string
  appRelativeStagedFiles: string[]
}

/**
 * The gates' one-call surface: every design app whose componentsPath a staged
 * file touches. Each entry carries the app's design dir (receipt home) and the
 * staged list re-rooted to the app (`design/...` paths stay app-relative, so
 * screen derivation keeps working unchanged in a monorepo).
 */
export function armedDesignApps(found: FoundArgoJson | null, stagedRepoRelativePaths: string[]): ArmedDesignApp[] {
  if (!found?.config?.design) return []
  const armed: ArmedDesignApp[] = []
  for (const [appKey, block] of Object.entries(found.config.design)) {
    if (!block || typeof block.componentsPath !== 'string') continue
    const componentsPath = resolveComponentsPath(found.repoRoot, block)
    if (!matchesStagedFile(componentsPath, found.repoRoot, stagedRepoRelativePaths)) continue
    const appRoot = block.root ?? '.'
    const appPrefix = appRoot === '.' ? '' : `${appRoot}/`
    const appRelativeStagedFiles =
      appPrefix === ''
        ? [...stagedRepoRelativePaths]
        : stagedRepoRelativePaths.filter((f) => f.startsWith(appPrefix)).map((f) => f.slice(appPrefix.length))
    armed.push({
      appKey,
      block,
      componentsPath,
      designDir: resolve(found.repoRoot, appRoot, 'design'),
      appRelativeStagedFiles,
    })
  }
  return armed
}
