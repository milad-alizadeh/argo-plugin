/**
 * `.argo/config.json`'s consolidated per-project config, and the dual-mode
 * hook-resolution logic the design commit gates arm from.
 *
 * Shape (design section):
 *   { "design": { "<appKey>": { "root": "<app dir, repo-root-relative>",
 *                               "componentsPath": "<relative to root>" } } }
 * Single-repo: one entry keyed "." with root ".". Monorepo: one entry per
 * app, keyed by the app dir (e.g. "apps/web"). A gate arms for an app iff
 * its design block exists AND a staged file falls under that app's resolved
 * componentsPath, matched repo-root-relative.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve, relative, dirname, sep } from 'node:path'
import { argoConfigPath } from './argo-paths.js'

export type DesignBlock = { root?: string; componentsPath?: string; recipe?: string; [key: string]: unknown }
export type ArgoConfig = { design?: Record<string, DesignBlock> }
export type FoundArgoJson = { repoRoot: string; config: ArgoConfig }

/**
 * Walk up from `cwd` to the first directory containing `.argo/config.json`.
 * Returns null when absent or malformed — callers treat both as "not an
 * argo project", inert, no throw.
 */
export function findArgoJson(cwd: string): FoundArgoJson | null {
  let dir = resolve(cwd)
  while (true) {
    const candidate = argoConfigPath(dir)
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

/** App-relative `codePath`s of every `code-owned` registry entry — the files a
 * commit may touch without owing a spec-diff receipt (Figma holds only a
 * screenshot of them, so there is no spec to diff). */
export function codeOwnedCodePaths(registry: unknown): Set<string> {
  const out = new Set<string>()
  const components = (registry as any)?.components
  if (!components || typeof components !== 'object') return out
  for (const entry of Object.values(components)) {
    const e = entry as any
    if (e?.kind === 'code-owned' && typeof e.codePath === 'string' && e.codePath) out.add(e.codePath)
  }
  return out
}

/**
 * The staged component files (under the app's componentsPath) that STILL owe a
 * spec-diff receipt: excludes code-owned codePaths, which are exempt — same as
 * design-rules and figma-to-code. An empty result means the commit touches only
 * code-owned component files, so the app is not gated.
 */
export function gatedComponentFiles(app: ArmedDesignApp, exemptCodePaths: Set<string>): string[] {
  const base = app.block.componentsPath as string
  return app.appRelativeStagedFiles.filter(
    (f) => (f === base || f.startsWith(`${base}/`)) && !exemptCodePaths.has(f)
  )
}
