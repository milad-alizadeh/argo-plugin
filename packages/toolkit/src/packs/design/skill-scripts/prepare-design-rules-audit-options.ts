#!/usr/bin/env node
/**
 * The figma-audit Node wrapper (SKILL.md §"Procedure" step 3): derives the
 * FULL options object the agent passes into the `use_figma` call that runs
 * `runDesignRulesAudit` — every project-specific value the bundled entry needs,
 * as DATA (kit-extraction restructure: killed the {{…}}-slot/splice model —
 * nothing project-specific is ever baked into a committed audit script
 * again; it all flows through this object at call time instead).
 *
 * The sandbox can't read a committed file itself (kit-awareness.md
 * §"Enforcement"'s same constraint), so this has to happen Node-side, before
 * the call, exactly like `record-audit-receipt.js`'s post-hoc reads of the
 * same files.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { registryComponentNames } from '../design-kit/component-names.js'
import { copyDeckStrings } from '../design-kit/copy-deck.js'
import { findArgoJson } from '../../../config/argo-json.js'
import { TW_COLLECTION_FAMILY } from '../recipes/shadcn-tailwind/design-rules.js'

/**
 * Recipe-declared spacing/binding collection allowlist, keyed by the app's
 * `design.<app>.recipe` value (field bug fix, 2026-07-07 live D01 build) —
 * a fixed characteristic of the recipe's starter file, not per-project
 * config. `null`/unknown recipe gets no additional allowlist.
 */
const RECIPE_ADDITIONAL_ALLOWED_COLLECTION_NAMES: Record<string, string[]> = {
  'shadcn-tailwind': TW_COLLECTION_FAMILY
}

/**
 * Resolves each requested name to its registry `nodeId` (authoritative
 * targeting, field bug fix — a name-based sweep matched every same-named
 * node in the file, e.g. auditing "Card" also swept a container frame
 * literally named "Card"). A name with no registry entry falls through to
 * `unresolvedNames` — the sandbox-side name-lookup fallback in
 * `runDesignRulesAudit`, for a target (a foundation frame/SCREEN) that has no
 * registry entry to resolve against.
 */
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
    // A code-owned component is a flat screenshot standing in for a code
    // implementation — it can't satisfy binding rules and is never audited.
    // Exempt it BEFORE resolving a nodeId so it never enters the target set.
    if (entry?.kind === 'code-owned') {
      codeOwnedExemptNames.push(name)
      continue
    }
    // A raw (un-adopted) kit master is stock library content nothing in the
    // project instances — the vendored mirror, not an authored surface.
    // Adoption (directive 3 refined, 2026-07-08) is the SCOPE filter: only
    // kit that a project surface actually instances (`adopted: true`, derived
    // by figma-sync's reconcile walk) is hard-gated; drift on the other ~110
    // stock masters must never pull them into the gate. Adopted kit and custom
    // still resolve as targets (directive 3's "audit what you use" preserved).
    if (entry?.kind === 'kit' && entry?.adopted !== true) {
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

/**
 * The app's `design.<app>` block in `.argo/config.json` for the app rooted
 * at `cwd` — matched by resolved `root`, falling back to the sole entry when
 * there's exactly one (single-repo project, `design["."]`). Returns null
 * when no argo.json/design block is found (unconfigured project) — every
 * caller below treats that as "use the mechanism's own defaults".
 */
export function findDesignBlock(cwd: string): Record<string, any> | null {
  const found = findArgoJson(cwd)
  const entries = Object.entries(found?.config?.design ?? {})
  if (entries.length === 0) return null

  const resolvedCwd = resolve(cwd)
  const matched = entries.find(([, block]: [string, any]) => resolve(found!.repoRoot, block?.root ?? '.') === resolvedCwd)
  if (matched) return matched[1] as Record<string, any>
  return entries.length === 1 ? (entries[0][1] as Record<string, any>) : null
}

/**
 * Kit components are AUDITED, not exempt (directive 3, 2026-07-07): the kit is
 * an editable part of the project's own design system, not a read-only
 * vendored mirror. A component named in an audit is a component someone is
 * authoring/adopting, so its hygiene must pass. The earlier blanket
 * `kind:"kit"` exemption is removed. What keeps this affordable is SCOPE, not
 * exemption: the hard gate targets only the components a session changed
 * (per-session write tracking) or that drifted (pull-registry's
 * detectChangedKitComponents), never the whole 117-component kit every turn.
 * The insideInstance exemptions in design-rules.ts still spare kit internals a
 * designer only instances.
 */
/**
 * A file-wide sweep (`componentNames` input empty) is now SCOPED, not
 * literal-whole-file (D26, 2026-07-08): every registry-listed component
 * (`sweepNodeIds`, kit or custom — directive 3 above still applies, no
 * blanket kit exemption) plus the project's composed-screen pages. The
 * actual project convention for a composed screen's page is `D<NN> <group>`
 * (file-structure.md, `isDesignPageName` in design-rules.ts) — ONE page per
 * screen, never a single page literally named "Screens" — so
 * `runDesignRulesAudit` matches those pages directly via `isDesignPageName`
 * regardless of `sweepPageNames`. `sweepPageNames` (from
 * `design.<app>.sweepPageNames`, defaulting to `['Screens']`) is ADDITIVE
 * on top of that — for a project with a genuine literal catch-all page (or
 * any other non-`D<NN>` naming choice) it wants included too — never the
 * sole mechanism (council-review finding, 2026-07-08: gating the whole
 * scoped-sweep page match on a literal `sweepPageNames` equality check meant
 * the "screens" half of the sweep matched zero pages on every project using
 * the real `D<NN>` convention). Auditing every top-level frame on every one
 * of a starter file's 50+ pages (kit primitives, demo/example pages, icon
 * libraries) was both noisy (near-entirely stock shadcn content nobody in
 * the project touched) and, on a file this size, a `use_figma` transport
 * risk (one script walking the whole tree can exceed the size/time budget
 * and drop mid-execution with no partial result). A NAMED audit's targets
 * (`componentNodeIds`/`unresolvedNames` above) are unaffected — this only
 * widens what a bare sweep (empty `componentNames` input) implies.
 */
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
        // code-owned components (flat screenshots) are audit-exempt, and
        // un-adopted (raw) kit masters are the vendored mirror nothing
        // instances (directive 3 refined) — keep both out of the scoped
        // file-wide sweep, not just named audits. Adopted kit and custom stay.
        .filter((c: any) => c?.kind !== 'code-owned' && c?.kind !== 'screen' && !(c?.kind === 'kit' && c?.adopted !== true))
        .map((c: any) => c?.nodeId)
        .filter((id: any): id is string => typeof id === 'string' && id.length > 0)
    : []
  const sweepPageNames = isSweep ? (designBlock?.sweepPageNames ?? ['Screens']) : []

  // Registered screens (kind:"screen") — the audit sets isScreenFrame from
  // membership in this set (registry-driven identity, replacing the old
  // page-name heuristic). Always derived (named audit AND sweep), so a screen
  // audited by nodeId still gets its screen-frame exemptions.
  // W4 (untraced-copy rule #13): flatten every wave copy deck under design/
  // (design/copy-deck.json + design/<wave>/copy-deck.json, one level) via
  // copyDeckStrings, then append every registry entry's documented
  // defaultStrings. No deck anywhere → null, and the rule stays INERT — a
  // project that never adopted copy decks sees zero behavior change. A deck
  // that EXISTS but is malformed throws loudly (copyDeckStrings/zod): a broken
  // deck silently disarming the copy gate would be a false pass.
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
    const options = deriveDesignRulesAuditOptions({ cwd: cwd ?? process.cwd(), componentNames })
    console.log(JSON.stringify(options))
  }
}
