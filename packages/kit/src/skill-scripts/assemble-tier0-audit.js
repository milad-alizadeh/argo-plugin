/**
 * Assembles + bundles the canonical tier-0 audit script (figma-audit/SKILL.md,
 * setup-design §4) into a sandbox-runnable artifact for `use_figma`. Two
 * separate concerns, each independently testable:
 *
 *  - `spliceRecipeChecks`/`fillSlots` — pure string transforms over the
 *    mechanism + recipe source, no I/O.
 *  - `bundleTier0Audit` — shells out to `bun build --bundle` to produce a
 *    self-contained, import-free script (the ONLY thing `use_figma` can run —
 *    there is no module resolution in that sandbox).
 *
 * Two installed artifacts, not one (Defect 1 decision): `design/tier0-audit.js`
 * stays the assembled ES module — readable, diffable, re-derived by
 * setup-design/design-upgrade, and importable from tests/other tooling that
 * runs outside the sandbox. `design/tier0-audit.bundle.js` is a transient,
 * generated-on-demand bundle (never hand-edited, regenerate any time via this
 * script) — THAT file's content is what actually gets pasted into `use_figma`.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { join } from 'node:path'

const RECIPE_CHECKS_MARKER = '// {{RECIPE_TIER0_CHECKS}}'

/**
 * Splices a recipe's tier0-recipe-checks.js content verbatim into the
 * mechanism's `// {{RECIPE_TIER0_CHECKS}}` marker line (module top level, so
 * the recipe file's own `import`s survive intact). Pass `recipeChecksSource:
 * null` for a `baseSource: none` recipe with no checks file — the marker
 * line is deleted rather than left unresolved.
 */
export function spliceRecipeChecks(mechanismSource, recipeChecksSource) {
  const lines = mechanismSource.split('\n')
  const markerIndex = lines.findIndex((line) => line.trim() === RECIPE_CHECKS_MARKER)
  if (markerIndex === -1) {
    throw new Error(`spliceRecipeChecks: marker "${RECIPE_CHECKS_MARKER}" not found in mechanism source`)
  }
  const replacement = recipeChecksSource == null ? [] : recipeChecksSource.split('\n')
  lines.splice(markerIndex, 1, ...replacement)
  return lines.join('\n')
}

/** Fills every `{{TOKEN}}` occurrence in `source` with its value from `slots`. */
export function fillSlots(source, slots) {
  let filled = source
  for (const [token, value] of Object.entries(slots)) {
    filled = filled.split(`{{${token}}}`).join(value)
  }
  return filled
}

const BARE_IDENTIFIER = /^[A-Za-z_$][\w$]*$/
const DEFAULT_EXPORT_STATEMENT = /\n?export\s*\{\s*([\w$]+)\s+as\s+default\s*\};?\s*$/

/**
 * The mechanism's own convention (tier0-audit.js's last line) is a BARE
 * trailing identifier — the script's Figma-sandbox eval completion value,
 * not an ES export. A tree-shaking bundler sees that bare reference as a
 * side-effect-free, unused expression and discards the entire audit body as
 * dead code (observed: a real bundle collapsed to ~180 bytes). Forcing an
 * explicit `export default` keeps the whole module alive through bundling;
 * `restoreCompletionExpression` below converts the bundler's resulting
 * `export { X as default }` back into a bare completion expression, since
 * `export` is exactly as unusable in the importless sandbox as `import`.
 */
function makeExportForBundling(source) {
  const trimmed = source.replace(/\s+$/, '')
  const lines = trimmed.split('\n')
  const lastLine = lines[lines.length - 1].trim()
  if (!BARE_IDENTIFIER.test(lastLine)) {
    throw new Error(
      `bundleTier0Audit: expected the assembled source to end with a bare identifier (its sandbox completion value), found "${lastLine}"`
    )
  }
  lines[lines.length - 1] = `export default ${lastLine}`
  return lines.join('\n')
}

function restoreCompletionExpression(bundled) {
  const match = bundled.match(DEFAULT_EXPORT_STATEMENT)
  if (!match) {
    throw new Error('bundleTier0Audit: expected the bundled output to end with a default export to convert back to a bare completion expression')
  }
  return `${bundled.slice(0, match.index)}\n${match[1]};\n`
}

/**
 * Bundles an assembled ES module into a single self-contained, import/export
 * -free script runnable in Figma's `use_figma` Plugin API sandbox. Writes the
 * module to a temp file INSIDE `cwd` so its own relative imports (e.g.
 * `./kit-patches.json`) resolve exactly as they would from the real
 * installed location (`design/` in a host project), bundles with
 * `bun build --bundle --format=esm`, restores the mechanism's bare-completion-
 * value convention (see `makeExportForBundling`), then verifies the result is
 * actually sandbox-runnable: zero `import`/`export` statements, under
 * `maxChars` (use_figma's 50,000-char cap).
 */
/**
 * Cached wrapper around bundleTier0Audit: reads the assembled module at
 * `sourcePath`, bundles into `bundlePath`, and skips the (slow) bun-build
 * when a sidecar hash proves the source is unchanged — designer agents
 * re-audit many times per task; only the first bundle should pay.
 */
export function bundleTier0AuditToFile(sourcePath, bundlePath, opts = {}) {
  const source = readFileSync(sourcePath, 'utf8')
  const hash = createHash('sha256').update(source).digest('hex')
  const hashPath = `${bundlePath}.hash`

  if (existsSync(bundlePath) && existsSync(hashPath) && readFileSync(hashPath, 'utf8').trim() === hash) {
    return { bundled: readFileSync(bundlePath, 'utf8'), cached: true }
  }

  const bundled = bundleTier0Audit(source, { cwd: dirname(sourcePath), ...opts })
  writeFileSync(bundlePath, bundled, 'utf8')
  writeFileSync(hashPath, hash, 'utf8')
  return { bundled, cached: false }
}

export function bundleTier0Audit(assembledSource, { cwd, maxChars = 50000 } = {}) {
  if (!cwd) throw new Error('bundleTier0Audit: cwd is required (relative imports resolve against it)')

  const entryPath = join(cwd, `.tier0-audit-assemble-${process.pid}-${Date.now()}.mjs`)
  const outPath = `${entryPath}.bundled.js`
  writeFileSync(entryPath, makeExportForBundling(assembledSource), 'utf8')

  try {
    const result = spawnSync('bun', ['build', '--bundle', '--format=esm', entryPath, `--outfile=${outPath}`], {
      encoding: 'utf8'
    })
    if (result.status !== 0) {
      throw new Error(`bundleTier0Audit: bun build failed: ${result.stderr || result.stdout}`)
    }

    const bundled = restoreCompletionExpression(readFileSync(outPath, 'utf8'))
    if (/^\s*(import|export)\s/m.test(bundled)) {
      throw new Error('bundleTier0Audit: bundled output still contains an import/export statement — not sandbox-runnable')
    }
    if (bundled.length > maxChars) {
      throw new Error(`bundleTier0Audit: bundled output is ${bundled.length} chars, exceeds use_figma's ${maxChars}-char cap`)
    }
    return bundled
  } finally {
    rmSync(entryPath, { force: true })
    rmSync(outPath, { force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const sourceIndex = args.indexOf('--source')
  const outIndex = args.indexOf('--out')
  const cwd = process.cwd()
  const sourcePath = sourceIndex === -1 ? join(cwd, 'design', 'tier0-audit.js') : args[sourceIndex + 1]
  const bundlePath = outIndex === -1 ? join(cwd, 'design', 'tier0-audit.bundle.js') : args[outIndex + 1]

  if (!existsSync(sourcePath)) {
    console.error(`assemble-tier0-audit: no assembled module at ${sourcePath} — run figma-audit/SKILL.md's assembly step first`)
    process.exit(1)
  }

  try {
    const { bundled, cached } = bundleTier0AuditToFile(sourcePath, bundlePath)
    console.log(JSON.stringify({ bundlePath, chars: bundled.length, cached }))
  } catch (err) {
    console.error(`assemble-tier0-audit: ${err.message}`)
    process.exit(1)
  }
}
