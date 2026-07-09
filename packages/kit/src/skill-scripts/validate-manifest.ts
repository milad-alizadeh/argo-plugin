#!/usr/bin/env node
/**
 * `argo design validate-manifest` — the W2 independent check ON the binding
 * manifest (design-phase-quality-plan.md), run BEFORE any `use_figma`
 * composition. Reads the manifest file plus `design/registry.json` and the
 * committed `design/confusable-pairs.json` Node-side, delegates the lint to
 * the pure `validateBindingManifest` (design-kit), prints the JSON report,
 * and exits non-zero when any row blocks — so the calling skill's
 * stop-and-ask fires before pixels, not after the full build:
 *
 *   exit 0 — manifest clean, build may proceed
 *   exit 1 — blocked rows (Never-tier invented name, un-justified confusable
 *            pair, Ask-first row awaiting the human) — STOP AND ASK
 *   exit 2 — usage / missing files (fail closed: no manifest is not a pass)
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { validateBindingManifest } from '../design-kit/binding-manifest.js'

function readOptionalJson(path: string): any {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

export function runValidateManifest({ manifestPath, cwd }: { manifestPath: string; cwd: string }) {
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
  return validateBindingManifest(manifest, { registry, confusablePairs })
}

export function parseCliArgs(args: string[]): { manifestPath?: string; cwd?: string; help?: boolean } {
  if (args.includes('--help') || args.includes('-h')) return { help: true }
  const KNOWN_FLAGS = ['--manifest', '--cwd']
  const unknown = args.filter((a) => a.startsWith('--') && !KNOWN_FLAGS.includes(a))
  if (unknown.length > 0) {
    throw new Error(`validate-manifest: unrecognized flag(s) ${unknown.join(', ')} — known: --manifest, --cwd, --help`)
  }
  const value = (name: string) => {
    const i = args.indexOf(name)
    return i === -1 ? undefined : args[i + 1]
  }
  return { manifestPath: value('--manifest'), cwd: value('--cwd') }
}

const USAGE = `validate-manifest — independent check on a binding manifest before any use_figma composition (W2).

Lints design/<wave>/binding-manifest.json against design/registry.json (every row must
name an EXISTING component) and design/confusable-pairs.json (a row on a known
confused pair needs an explicit justification), applying the three-tier guardrail
(Always / Ask-first / Never). Any blocked row → exit 1: STOP AND ASK, do not build.

Usage:
  validate-manifest --manifest <path/to/binding-manifest.json> [--cwd <app-dir>]

Flags:
  --manifest  path to the binding manifest JSON (required).
  --cwd       app dir holding design/registry.json + design/confusable-pairs.json (default: cwd).
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
      const result = runValidateManifest({ manifestPath: parsed.manifestPath, cwd: parsed.cwd ?? process.cwd() })
      console.log(JSON.stringify(result, null, 2))
      process.exit(result.blocked ? 1 : 0)
    } catch (err) {
      process.stderr.write(`${(err as Error).message}\n`)
      process.exit(2)
    }
  }
}
