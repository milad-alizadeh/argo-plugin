#!/usr/bin/env node
/**
 * Captures the kit-awareness browse catalog (design/kit-inventory.json,
 * kit-awareness.md §1) from a live Figma kit-library session — mirrors
 * capture-kit-corpus.js's split: a pure shaping function (unit-tested) plus
 * an untested `--record/--out` CLI entry that only persists what a live
 * `use_figma`/`search_design_system` pass already produced.
 *
 * Committed fields are deliberately slow-moving: `name`, `type`,
 * `aliases[]`, `purpose`. `key` and structured `variantProps` are the
 * volatile fields the council rejected committing (the exact stale-import
 * failure class) — `buildKitInventory` strips them defensively even if a
 * caller's marshaled component object still carries them. Icons collapse to
 * ONE family row, never an enumerated 1473-row list.
 *
 * Sole writer: `design-upgrade` (whole-file recapture on kit swap).
 * `setup-design` seeds it at t=0 with the same capture routine.
 */
import { writeFileSync } from 'node:fs'

const COMMITTED_COMPONENT_FIELDS = ['name', 'type', 'aliases', 'purpose']

function stripVolatileFields(component) {
  const shaped = {}
  for (const field of COMMITTED_COMPONENT_FIELDS) {
    if (field in component) shaped[field] = component[field]
  }
  return shaped
}

/** Shapes a marshaled `{ components, icons }` dump into the committed kit-inventory.json shape. */
export function buildKitInventory({ components = [], icons }, { kitLibraryFileKey, kitSourceVersion, now = Date.now() } = {}) {
  return {
    _usage:
      'Kit components are used AS-IS via base instances; prefer them over custom builds. Building custom when a kit component (or alias) matches requires a design/waivers.json entry naming the kit candidate and a concrete reason it is insufficient.',
    kitLibraryFileKey,
    kitSourceVersion,
    capturedAt: new Date(now).toISOString(),
    source: 'figma-kit-library',
    components: components.map(stripVolatileFields),
    icons
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const recordIndex = args.indexOf('--record')
  const outIndex = args.indexOf('--out')
  if (recordIndex === -1 || outIndex === -1) {
    console.error(
      'capture-kit-inventory: usage: argo design capture-kit-inventory --record ' +
        '\'{"components":[...],"icons":{...},"kitLibraryFileKey":"...","kitSourceVersion":"..."}\' --out <path>'
    )
    process.exit(1)
  }
  let parsed
  try {
    parsed = JSON.parse(args[recordIndex + 1])
  } catch {
    console.error('capture-kit-inventory: --record argument is not valid JSON')
    process.exit(1)
  }
  const { components, icons, kitLibraryFileKey, kitSourceVersion } = parsed
  const inventory = buildKitInventory({ components, icons }, { kitLibraryFileKey, kitSourceVersion })
  writeFileSync(args[outIndex + 1], JSON.stringify(inventory, null, 2))
  console.log(`capture-kit-inventory: wrote ${args[outIndex + 1]}`)
}
