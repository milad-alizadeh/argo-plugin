#!/usr/bin/env node
// Independent check on the binding manifest, run BEFORE any use_figma composition,
// so stop-and-ask fires before pixels, not after the full build.
//
//   exit 0 — manifest clean, build may proceed
//   exit 1 — blocked rows or an uncovered PRD requirement — STOP AND ASK
//   exit 2 — usage / missing files (fail closed: no manifest is not a pass)
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { validateBindingManifest } from '../../design-kit/binding-manifest.js'
import { selectChecklistForScreen } from '../../design-kit/completeness-checklist.js'

function readOptionalJson(path: string): any {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

export function runValidateManifest({
  manifestPath,
  cwd,
  prdPath
}: {
  manifestPath: string
  cwd: string
  /**
   * Optional PRD path enabling the requirements-coverage check: every PRD
   * requirement the feature→screen matrix disposes `covered-by` the
   * manifest's `screen` (Visible-in-build yes/partial) must be referenced by
   * at least one manifest row. An uncovered requirement blocks with its id —
   * a required composite simply ABSENT from the manifest is otherwise
   * invisible (a rows-only lint checks only listed rows).
   */
  prdPath?: string
}) {
  if (!existsSync(manifestPath)) {
    throw new Error(`validate-manifest: no manifest at ${manifestPath} — the binding manifest is REQUIRED before any use_figma composition (W1)`)
  }
  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    throw new Error(`validate-manifest: ${manifestPath} is not valid JSON: ${(err as Error).message}`)
  }
  const registry = readOptionalJson(join(cwd, 'design', 'registry.json'))
  if (!registry) {
    throw new Error(`validate-manifest: no design/registry.json under ${cwd} — the manifest can only be validated against the real component roster`)
  }
  const confusablePairs = readOptionalJson(join(cwd, 'design', 'confusable-pairs.json'))
  let requiredRequirements: { id: string }[] | undefined
  if (prdPath !== undefined) {
    if (!existsSync(prdPath)) {
      throw new Error(`validate-manifest: no PRD at ${prdPath} — --prd must point at the feature PRD (fail closed: a missing PRD is not coverage)`)
    }
    const screen = (manifest as any)?.screen
    if (typeof screen !== 'string' || screen === '') {
      throw new Error('validate-manifest: --prd requires the manifest to carry its screen (the matrix name) so coverage can be selected')
    }
    requiredRequirements = selectChecklistForScreen(readFileSync(prdPath, 'utf8'), screen)
  }
  return validateBindingManifest(manifest, { registry, confusablePairs, requiredRequirements })
}

export function parseCliArgs(args: string[]): { manifestPath?: string; cwd?: string; prdPath?: string; help?: boolean } {
  if (args.includes('--help') || args.includes('-h')) return { help: true }
  const KNOWN_FLAGS = ['--manifest', '--cwd', '--prd']
  const unknown = args.filter((a) => a.startsWith('--') && !KNOWN_FLAGS.includes(a))
  if (unknown.length > 0) {
    throw new Error(`validate-manifest: unrecognized flag(s) ${unknown.join(', ')} — known: --manifest, --cwd, --prd, --help`)
  }
  const value = (name: string) => {
    const i = args.indexOf(name)
    return i === -1 ? undefined : args[i + 1]
  }
  return { manifestPath: value('--manifest'), cwd: value('--cwd'), prdPath: value('--prd') }
}

const USAGE = `validate-manifest — independent check on a binding manifest before any use_figma composition (W2).

Lints design/<wave>/binding-manifest.json against design/registry.json (every row must
name an EXISTING component) and design/confusable-pairs.json (a row on a known
confused pair needs an explicit justification), applying the three-tier guardrail
(Always / Ask-first / Never). Any blocked row → exit 1: STOP AND ASK, do not build.

With --prd it ALSO runs the requirements-coverage check: every PRD requirement the
feature→screen matrix disposes covered-by the manifest's screen (Visible in build?
yes/partial) must be referenced by at least one manifest row — an uncovered
requirement blocks with its row id (a required composite simply absent from the
manifest is otherwise invisible to a rows-only lint).

Usage:
  validate-manifest --manifest <path/to/binding-manifest.json> [--cwd <app-dir>] [--prd <path/to/prd.md>]

Flags:
  --manifest  path to the binding manifest JSON (required).
  --cwd       app dir holding design/registry.json + design/confusable-pairs.json (default: cwd).
  --prd       feature PRD path; enables the requirements-coverage check against the manifest's screen.
  --help, -h  show this help.`

if (import.meta.url === `file://${process.argv[1]}`) {
  let parsed: ReturnType<typeof parseCliArgs>
  try {
    parsed = parseCliArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    process.exit(2)
  }
  if (parsed.help) {
    console.log(USAGE)
  } else if (!parsed.manifestPath) {
    process.stderr.write('validate-manifest: --manifest <path> is required\n')
    process.exit(2)
  } else {
    try {
      const result = runValidateManifest({ manifestPath: parsed.manifestPath, cwd: parsed.cwd ?? process.cwd(), prdPath: parsed.prdPath })
      console.log(JSON.stringify(result, null, 2))
      process.exit(result.blocked ? 1 : 0)
    } catch (err) {
      process.stderr.write(`${(err as Error).message}\n`)
      process.exit(2)
    }
  }
}
