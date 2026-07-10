import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readConfig, type ArgoConfig, type LspTooling } from '../config.js'
import { LSP_TABLE } from '../lsp-table.js'

/**
 * Read-only posture report over `.argo/config.json`'s pointers — flags
 * config-vs-reality MISMATCHES as plain text, never fixes anything.
 * `computeStatus` is the pure core: it takes an already-resolved
 * `StatusSnapshot` (config plus precomputed fs facts) so it's unit-testable
 * without touching disk; `resolveStatusSnapshot`/`runStatus` are the thin
 * impure wrapper that does the actual reads.
 */

export interface StatusSnapshot {
  config: ArgoConfig
  /** Whether `config.testDiscipline.configPath` exists on disk, relative to
   * `cwd`. `null` when `testDiscipline` isn't configured. */
  testDisciplineConfigExists: boolean | null
  /** Whether `config.boundaryLint.configPath` exists on disk. `null` when
   * `boundaryLint` isn't configured. */
  boundaryLintConfigExists: boolean | null
  /** Whether `.claude/settings.json`'s `enabledPlugins` names a probity
   * plugin (`"probity@probity": true` or similar) — only meaningful when
   * `testDiscipline.enforcedBy === 'probity'`. */
  probityPluginEnabled: boolean
  /** Path -> exists, one entry per key in `config.provenance`. */
  provenanceFileExists: Record<string, boolean>
  /** Language -> whether `.claude/settings.json`'s `lspServers` surface names
   * that language's server, one entry per language recorded `"wired"` in
   * `config.tooling.lsp`. Not checked for `"recommended-not-installed"`
   * languages (nothing should be wired for those yet). */
  lspServerConfigured: Record<string, boolean>
}

export interface StatusReport {
  packs: { enabled: string[]; disabled: string[] }
  testDiscipline:
    | null
    | { enforcedBy: string; configPath: string; configPathExists: boolean; pluginEnabled: boolean }
  boundaryLint: null | { enforcedBy: string; configPath: string; configPathExists: boolean }
  provenance: { recordedCount: number; missingOnDisk: string[] }
  /** `config.tooling.lsp` verbatim, alongside `wired` entries whose Claude
   * Code `lspServers` config could not be confirmed on disk. */
  lsp: { posture: LspTooling; unconfirmed: string[] }
  /** Plain-text config-vs-reality mismatches, in the order they were found.
   * Descriptive only — `argo status` never fixes any of these. */
  mismatches: string[]
}

/** Pure: derive the posture report and mismatch list from an already-resolved
 * snapshot. No disk access here. */
export function computeStatus(snapshot: StatusSnapshot): StatusReport {
  const { config } = snapshot
  const mismatches: string[] = []

  const packEntries = Object.entries(config.packs)
  const packs = {
    enabled: packEntries.filter(([, v]) => v).map(([k]) => k),
    disabled: packEntries.filter(([, v]) => !v).map(([k]) => k)
  }

  let testDiscipline: StatusReport['testDiscipline'] = null
  if (config.testDiscipline) {
    const { enforcedBy, configPath } = config.testDiscipline
    const configPathExists = snapshot.testDisciplineConfigExists ?? false
    const pluginEnabled = snapshot.probityPluginEnabled
    testDiscipline = { enforcedBy, configPath, configPathExists, pluginEnabled }
    if (!configPathExists) {
      mismatches.push(`testDiscipline.configPath "${configPath}" not found on disk`)
    }
    if (enforcedBy === 'probity' && !pluginEnabled) {
      mismatches.push(
        `testDiscipline.enforcedBy is "probity" but no probity plugin is enabled in .claude/settings.json`
      )
    }
  }

  let boundaryLint: StatusReport['boundaryLint'] = null
  if (config.boundaryLint) {
    const { enforcedBy, configPath } = config.boundaryLint
    const configPathExists = snapshot.boundaryLintConfigExists ?? false
    boundaryLint = { enforcedBy, configPath, configPathExists }
    if (!configPathExists) {
      mismatches.push(`boundaryLint.configPath "${configPath}" not found on disk`)
    }
  }

  const recordedPaths = Object.keys(config.provenance)
  const missingOnDisk = recordedPaths.filter((p) => snapshot.provenanceFileExists[p] === false)
  for (const p of missingOnDisk) {
    mismatches.push(`provenance: recorded file "${p}" no longer exists on disk`)
  }

  const wiredLanguages = Object.entries(config.tooling.lsp)
    .filter(([, posture]) => posture === 'wired')
    .map(([language]) => language)
  const unconfirmed = wiredLanguages.filter((language) => snapshot.lspServerConfigured[language] === false)
  for (const language of unconfirmed) {
    mismatches.push(
      `tooling.lsp records "${language}" as wired, but no matching server was found in .claude/settings.json's lspServers`
    )
  }

  return {
    packs,
    testDiscipline,
    boundaryLint,
    provenance: { recordedCount: recordedPaths.length, missingOnDisk },
    lsp: { posture: config.tooling.lsp, unconfirmed },
    mismatches
  }
}

/** True iff `.claude/settings.json` (repo-relative to `cwd`) names an
 * enabled probity plugin. Missing/malformed file resolves to `false`, never
 * a throw. */
function probityPluginEnabled(cwd: string): boolean {
  const path = join(cwd, '.claude', 'settings.json')
  if (!existsSync(path)) return false
  try {
    const settings = JSON.parse(readFileSync(path, 'utf8'))
    const enabledPlugins = settings?.enabledPlugins
    if (!enabledPlugins || typeof enabledPlugins !== 'object') return false
    return Object.entries(enabledPlugins).some(([key, value]) => value && key.startsWith('probity@'))
  } catch {
    return false
  }
}

/** True iff `.claude/settings.json` (repo-relative to `cwd`) names `server`
 * as a key under its `lspServers` block. Missing/malformed file resolves to
 * `false`, never a throw — mirrors `probityPluginEnabled`. */
function lspServerConfigured(cwd: string, server: string): boolean {
  const path = join(cwd, '.claude', 'settings.json')
  if (!existsSync(path)) return false
  try {
    const settings = JSON.parse(readFileSync(path, 'utf8'))
    const lspServers = settings?.lspServers
    if (!lspServers || typeof lspServers !== 'object') return false
    return server in lspServers
  } catch {
    return false
  }
}

/** Impure: reads `.argo/config.json` (via `readConfig`) plus the on-disk
 * facts `computeStatus` needs, resolving every path relative to `cwd`. */
export function resolveStatusSnapshot(cwd: string = process.cwd()): StatusSnapshot {
  const root = resolve(cwd)
  const config = readConfig(root)

  const provenanceFileExists = Object.fromEntries(
    Object.keys(config.provenance).map((p) => [p, existsSync(join(root, p))])
  )

  const lspServerConfiguredEntries = Object.entries(config.tooling.lsp)
    .filter(([, posture]) => posture === 'wired')
    .map(([language]) => [language, lspServerConfigured(root, LSP_TABLE[language] ?? language)] as const)

  return {
    config,
    testDisciplineConfigExists: config.testDiscipline
      ? existsSync(join(root, config.testDiscipline.configPath))
      : null,
    boundaryLintConfigExists: config.boundaryLint ? existsSync(join(root, config.boundaryLint.configPath)) : null,
    probityPluginEnabled: probityPluginEnabled(root),
    provenanceFileExists,
    lspServerConfigured: Object.fromEntries(lspServerConfiguredEntries)
  }
}

/** `argo status` entry point: resolve the snapshot from disk, then compute
 * the report. Read-only — never writes, never fixes a mismatch. */
export function runStatus(cwd: string = process.cwd()): StatusReport {
  return computeStatus(resolveStatusSnapshot(cwd))
}
