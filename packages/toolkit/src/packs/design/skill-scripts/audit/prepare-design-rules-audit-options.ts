#!/usr/bin/env node
// The sandbox can't read a committed file itself, so every project-specific value
// is derived Node-side and passed into the audit call as DATA, never baked into a
// committed script.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { registryComponentNames } from '../../design-kit/component-names.js'
import { copyDeckStrings } from '../../design-kit/copy-deck.js'
import { findArgoJson } from '../../../../config/argo-json.js'
import { TW_COLLECTION_FAMILY } from '../../recipes/shadcn-tailwind/design-rules.js'
import { isRawUnadoptedKit } from '../../design-kit/staleness.js'

// Recipe-declared spacing/binding collection allowlist — a fixed characteristic of
// the recipe's starter file, not per-project config. null/unknown recipe gets none.
const RECIPE_ADDITIONAL_ALLOWED_COLLECTION_NAMES: Record<string, string[]> = {
  'shadcn-tailwind': TW_COLLECTION_FAMILY
}

// Resolves by registry nodeId, not name — a name-based sweep matched every
// same-named node in the file (e.g. auditing "Card" also swept a container frame
// literally named "Card"). Unresolved names fall through to the sandbox-side
// name-lookup fallback.
export function resolveComponentNodeIds(
  componentNames: string[],
  registry: any
): { componentNodeIds: string[]; unresolvedNames: string[]; codeOwnedExemptNames: string[]; rawKitExemptNames: string[] } {
  const components = registry?.components && typeof registry.components === 'object' ? registry.components : {}
  const componentNodeIds: string[] = []
  const unresolvedNames: string[] = []
  const codeOwnedExemptNames: string[] = []
  const rawKitExemptNames: string[] = []
  for (const name of componentNames) {
    const entry = components[name]
    // A code-owned component is a flat screenshot standing in for code — it can't
    // satisfy binding rules, so exempt it before resolving a nodeId.
    if (entry?.kind === 'code-owned') {
      codeOwnedExemptNames.push(name)
      continue
    }
    // A raw (un-adopted) kit master is the vendored mirror, not an authored
    // surface — only kit a project surface actually instances is hard-gated.
    if (isRawUnadoptedKit(entry)) {
      rawKitExemptNames.push(name)
      continue
    }
    const nodeId = entry?.nodeId
    if (typeof nodeId === 'string' && nodeId) {
      componentNodeIds.push(nodeId)
    } else {
      unresolvedNames.push(name)
    }
  }
  return { componentNodeIds, unresolvedNames, codeOwnedExemptNames, rawKitExemptNames }
}

function readOptionalJson(path: string): any {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

// Matches the app's design block by resolved root, falling back to the sole entry
// when there's exactly one. Returns null when unconfigured — callers treat that as
// "use the mechanism's own defaults".
export function findDesignBlock(cwd: string): Record<string, any> | null {
  const found = findArgoJson(cwd)
  const entries = Object.entries(found?.config?.design ?? {})
  if (entries.length === 0) return null

  const resolvedCwd = resolve(cwd)
  const matched = entries.find(([, block]: [string, any]) => resolve(found!.repoRoot, block?.root ?? '.') === resolvedCwd)
  if (matched) return matched[1] as Record<string, any>
  return entries.length === 1 ? (entries[0][1] as Record<string, any>) : null
}

// Kit components are AUDITED, not exempt: the kit is an editable part of the
// project's own design system. What keeps this affordable is SCOPE — the hard gate
// targets only components a session changed or that drifted, never the whole kit.
//
// A file-wide sweep is SCOPED, not literal-whole-file: every registry-listed
// component plus the project's composed-screen pages (matched via
// isDesignPageName's D<NN> convention, regardless of sweepPageNames).
// sweepPageNames is ADDITIVE on top of that, for a genuine literal catch-all page.
// Auditing every top-level frame on a 50+ page starter file was both noisy (stock
// content nobody touched) and a use_figma transport risk (can exceed the
// size/time budget and drop mid-execution with no partial result).
export function deriveDesignRulesAuditOptions({
  cwd,
  componentNames = []
}: {
  cwd: string
  componentNames?: string[]
}) {
  const registry = readOptionalJson(join(cwd, 'design', 'registry.json'))
  const designBlock = findDesignBlock(cwd)
  const recipe = designBlock?.recipe ?? null
  const { componentNodeIds, unresolvedNames, codeOwnedExemptNames, rawKitExemptNames } = resolveComponentNodeIds(
    componentNames,
    registry
  )

  const isSweep = componentNames.length === 0
  const registryComponents = registry?.components && typeof registry.components === 'object' ? registry.components : {}
  const sweepNodeIds = isSweep
    ? Object.values(registryComponents)
        // code-owned components and un-adopted (raw) kit masters stay out of the
        // scoped file-wide sweep too, not just named audits.
        .filter((c: any) => c?.kind !== 'code-owned' && c?.kind !== 'screen' && !isRawUnadoptedKit(c))
        .map((c: any) => c?.nodeId)
        .filter((id: any): id is string => typeof id === 'string' && id.length > 0)
    : []
  const sweepPageNames = isSweep ? (designBlock?.sweepPageNames ?? ['Screens']) : []

  // Registry-driven screen-frame identity, always derived so a screen audited by
  // nodeId still gets its screen-frame exemptions.
  //
  // Flattens every wave copy deck under design/ via copyDeckStrings, plus each
  // registry entry's defaultStrings. No deck anywhere stays INERT (zero behavior
  // change); a deck that EXISTS but is malformed throws loudly — a broken deck
  // silently disarming the copy gate would be a false pass.
  const designDir = join(cwd, 'design')
  const deckPaths: string[] = []
  if (existsSync(join(designDir, 'copy-deck.json'))) deckPaths.push(join(designDir, 'copy-deck.json'))
  if (existsSync(designDir)) {
    for (const entry of readdirSync(designDir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(designDir, entry.name, 'copy-deck.json'))) {
        deckPaths.push(join(designDir, entry.name, 'copy-deck.json'))
      }
    }
  }
  let copyAllowedStrings: string[] | null = null
  if (deckPaths.length > 0) {
    copyAllowedStrings = deckPaths.flatMap((p) => {
      try {
        return copyDeckStrings(JSON.parse(readFileSync(p, 'utf8')))
      } catch (err) {
        throw new Error(`prepare-design-rules-audit-options: invalid copy-deck at ${p}: ${(err as Error).message}`)
      }
    })
    for (const c of Object.values(registryComponents) as any[]) {
      if (Array.isArray(c?.defaultStrings)) copyAllowedStrings.push(...c.defaultStrings.filter((s: any) => typeof s === 'string'))
    }
  }

  const screenNodeIds = Object.values(registryComponents)
    .filter((c: any) => c?.kind === 'screen')
    .map((c: any) => c?.nodeId)
    .filter((id: any): id is string => typeof id === 'string' && id.length > 0)

  return {
    componentNodeIds,
    componentNames: unresolvedNames,
    // Named but skipped: code-owned components the caller can record as
    // intentionally-exempt so a fully-exempt target set isn't read as a
    // vacuous clean pass.
    codeOwnedExemptNames,
    // Named but skipped as raw (un-adopted) kit — reported so the caller can
    // tell the operator "these stock masters were left out of the gate on
    // purpose" rather than silently dropping them.
    rawKitExemptNames,
    compositeNames: registryComponentNames(registry),
    semanticCollectionName: designBlock?.semanticCollectionName ?? 'Semantic',
    additionalAllowedCollectionNames: (recipe && RECIPE_ADDITIONAL_ALLOWED_COLLECTION_NAMES[recipe]) ?? [],
    recipe,
    viewport: designBlock?.viewport,
    sweepNodeIds,
    sweepPageNames,
    screenNodeIds,
    copyAllowedStrings
  }
}

/**
 * A typo'd or unrecognized flag (e.g. `--component-names` instead of
 * `--componentNames`) must not be silently swallowed into "no components
 * given" — that reads as a legitimate file-wide sweep and lets a named audit
 * run against an empty target, passing vacuously. Reject anything starting
 * with `--` that isn't a known flag before falling back to the sweep default.
 */
export function parseCliArgs(args: string[]): { componentNames: string[]; cwd?: string; help?: boolean } {
  if (args.includes('--help') || args.includes('-h')) return { componentNames: [], help: true }

  // `--componentNames` (camel) is canonical; `--component-names` (kebab) is an
  // accepted alias — callers reach for the kebab form by habit, and rejecting
  // it just costs a wasted round-trip. Unknown `--` flags still throw so a
  // genuine typo can't masquerade as an empty file-wide sweep.
  const KNOWN_FLAGS = ['--componentNames', '--component-names', '--cwd']
  const unknown = args.filter((a) => a.startsWith('--') && !KNOWN_FLAGS.includes(a))
  if (unknown.length > 0)
    throw new Error(`prepare-design-rules-audit-options: unrecognized flag(s) ${unknown.join(', ')} — did you mean --componentNames?`)

  const namesIndex = args.findIndex((a) => a === '--componentNames' || a === '--component-names')
  const componentNames = namesIndex === -1 ? [] : JSON.parse(args[namesIndex + 1])
  const cwdIndex = args.indexOf('--cwd')
  const cwd = cwdIndex === -1 ? undefined : args[cwdIndex + 1]
  return { componentNames, ...(cwd ? { cwd } : {}) }
}

const USAGE = `prepare-design-rules-audit-options — derive the design-rules audit target set.

Usage:
  prepare-design-rules-audit-options [--cwd <path>] [--componentNames '<json-array>']

Flags:
  --componentNames  JSON array of component names for a named (hard) audit.
                    Omit for a file-wide advisory sweep. --component-names alias.
  --cwd             Repo/workspace dir to resolve config from (default: cwd).
  --help, -h        Show this help.`

if (import.meta.url === `file://${process.argv[1]}`) {
  const { componentNames, cwd, help } = parseCliArgs(process.argv.slice(2))
  if (help) {
    console.log(USAGE)
  } else {
    const resolvedCwd = cwd ?? process.cwd()
    // A missing design block means every downstream default is silently wrong for
    // this project — fail loud instead of a hollow options object.
    if (findDesignBlock(resolvedCwd) === null) {
      console.error(
        `prepare-design-rules-audit-options: no design block found for cwd ${resolvedCwd} — run from the app workspace (e.g. apps/desktop)`
      )
      process.exit(1)
    }
    const options = deriveDesignRulesAuditOptions({ cwd: resolvedCwd, componentNames })
    console.log(JSON.stringify(options))
  }
}
