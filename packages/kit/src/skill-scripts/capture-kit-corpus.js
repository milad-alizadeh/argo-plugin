#!/usr/bin/env node
/**
 * Captures the R7 pristine-kit corpus (test/fixtures/kit-corpus.json) from a
 * live Figma session — the ONE `use_figma` marshal dump the R7 ruling
 * requires so the fixture proves the tier-0 rules against REAL kit shapes,
 * never hand-authored synthetic ones (the exact failure mode `figma-audit`'s
 * plan documents: a synthetic `{remote:true, key:'kit-file-key:1:2'}` fixture
 * passed green while encoding the wrong `key.startsWith(fileKey)` assumption).
 *
 * `buildKitCorpus` is the pure shaping function (unit-tested); the CLI usage
 * below is untested by convention — same posture as
 * `assemble-tier0-audit.js`'s `bundleTier0Audit` CLI entry and
 * `record-audit-receipt.js`'s `--record` usage: it only shapes/writes what a
 * live `use_figma` marshal already produced, never re-derives it.
 *
 * Usage (run from a live Figma session, after marshaling the kit's pristine
 * + inverse fixtures via `use_figma`):
 *   argo design capture-kit-corpus --record '<json>' --out test/fixtures/kit-corpus.json
 * where `<json>` is `{ pristine: [...], inverse: {...}, semanticModes: [...] }`.
 *
 * Re-capture gated on kit upgrade (design-upgrade/D15) so the corpus tracks
 * the kit version it certifies — a new kit release invalidates the previous
 * capture's node shapes.
 */
import { writeFileSync } from 'node:fs'

/** Shapes a marshaled `{ pristine, inverse, semanticModes }` dump into the corpus file format, stamping a capturedFrom provenance header. */
export function buildKitCorpus({ pristine, inverse, semanticModes = [] }, { capturedFrom, now = Date.now() } = {}) {
  return {
    capturedFrom: capturedFrom ?? `live-capture-${new Date(now).toISOString()}`,
    semanticModes,
    pristine,
    inverse
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const recordIndex = args.indexOf('--record')
  const outIndex = args.indexOf('--out')
  if (recordIndex === -1 || outIndex === -1) {
    console.error(
      'capture-kit-corpus: usage: argo design capture-kit-corpus --record \'{"pristine":[...],"inverse":{...},"semanticModes":[...]}\' --out <path>'
    )
    process.exit(1)
  }
  let parsed
  try {
    parsed = JSON.parse(args[recordIndex + 1])
  } catch {
    console.error('capture-kit-corpus: --record argument is not valid JSON')
    process.exit(1)
  }
  const corpus = buildKitCorpus(parsed)
  writeFileSync(args[outIndex + 1], JSON.stringify(corpus, null, 2))
  console.log(`capture-kit-corpus: wrote ${args[outIndex + 1]}`)
}
