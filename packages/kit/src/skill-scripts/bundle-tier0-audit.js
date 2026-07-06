/**
 * Bundles the canonical tier-0 audit (figma-audit/SKILL.md) into a
 * sandbox-runnable artifact for `use_figma` — bundle-on-demand, never
 * assembled/committed into a host project (kit-extraction restructure:
 * killed the splice-into-`design/tier0-audit.js` model, the exact drift bug
 * that motivated this rewrite).
 *
 * `generateTier0AuditEntry(recipe)` — pure string generation, no I/O: builds
 * a tiny ES-module ENTRY that imports `runTier0Audit` from
 * `@argohq/kit/design-kit/tier0-audit` plus (for a recipe with tier-0 checks)
 * that recipe's `runRecipeTier0Checks`/`runKitPatchesConformance` from
 * `@argohq/kit`, and wraps them so project DATA passed in `options` at call
 * time (kitVariableKeys, retiredKitVariableKeys, kitPatches,
 * semanticCollectionName) reaches the recipe functions too — functions can't
 * cross the `use_figma` data boundary, so they're baked into the bundle via
 * imports; only DATA flows through the options object the caller passes.
 *
 * `bundleTier0Audit` — shells out to `bun build --bundle` to produce a
 * self-contained, import-free script (the ONLY thing `use_figma` can run —
 * there is no module resolution in that sandbox), resolving `@argohq/kit`
 * from the host project's own `node_modules` (hence the required `cwd`).
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RECIPE_ENTRIES = {
  'shadcn-tailwind': {
    importPath: '@argohq/kit/design-kit/shadcn-tailwind/tier0-walker'
  }
}

/**
 * Pure string generation (no I/O, no bun build) — the entry source
 * `bundleTier0Audit` bundles. `recipe` is the app's `design.<app>.recipe`
 * value (e.g. `'shadcn-tailwind'`); `null`/unknown ⇒ mechanism-only entry, no
 * recipe checks (matches the `baseSource: none` no-op contract).
 */
export function generateTier0AuditEntry(recipe) {
  const recipeEntry = recipe ? RECIPE_ENTRIES[recipe] : null

  if (!recipeEntry) {
    return [
      "import { runTier0Audit } from '@argohq/kit/design-kit/tier0-audit'",
      '',
      'runTier0Audit'
    ].join('\n')
  }

  return [
    "import { runTier0Audit } from '@argohq/kit/design-kit/tier0-audit'",
    `import { runRecipeTier0Checks, runKitPatchesConformance } from '${recipeEntry.importPath}'`,
    '',
    'async function tier0AuditWithRecipe(options = {}) {',
    '  return runTier0Audit({',
    '    ...options,',
    '    runRecipeTier0Checks: (node, ctx) => runRecipeTier0Checks(node, {',
    '      ...ctx,',
    '      kitVariableKeys: options.kitVariableKeys,',
    '      retiredKitVariableKeys: options.retiredKitVariableKeys,',
    '      semanticCollectionName: options.semanticCollectionName',
    '    }),',
    '    runKitPatchesConformance: (modifiedNodes) => runKitPatchesConformance(modifiedNodes, options.kitPatches)',
    '  })',
    '}',
    '',
    'tier0AuditWithRecipe'
  ].join('\n')
}

const BARE_IDENTIFIER = /^[A-Za-z_$][\w$]*$/
const DEFAULT_EXPORT_STATEMENT = /\n?export\s*\{\s*([\w$]+)\s+as\s+default\s*\};?\s*$/

/**
 * The entry's own convention (last line) is a BARE trailing identifier — the
 * script's Figma-sandbox eval completion value, not an ES export. A
 * tree-shaking bundler sees that bare reference as a side-effect-free,
 * unused expression and discards the entire audit body as dead code
 * (observed: a real bundle collapsed to ~180 bytes). Forcing an explicit
 * `export default` keeps the whole module alive through bundling;
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
      `bundleTier0Audit: expected the entry source to end with a bare identifier (its sandbox completion value), found "${lastLine}"`
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
 * Bundles an entry module (from `generateTier0AuditEntry`) into a single
 * self-contained, import/export-free script runnable in Figma's `use_figma`
 * Plugin API sandbox. Writes the entry to a temp file INSIDE `cwd` so
 * `@argohq/kit` resolves exactly as it does from the host project's real
 * `node_modules`, bundles with `bun build --bundle --format=esm`, restores
 * the bare-completion-value convention (see `makeExportForBundling`), then
 * verifies the result is actually sandbox-runnable: zero `import`/`export`
 * statements, under `maxChars` (use_figma's 50,000-char cap).
 */
export function bundleTier0Audit(entrySource, { cwd, maxChars = 50000 } = {}) {
  if (!cwd) throw new Error('bundleTier0Audit: cwd is required (@argohq/kit resolves from its node_modules)')

  const entryPath = join(cwd, `.tier0-audit-bundle-${process.pid}-${Date.now()}.mjs`)
  const outPath = `${entryPath}.bundled.js`
  writeFileSync(entryPath, makeExportForBundling(entrySource), 'utf8')

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

/**
 * The skill-facing entry point: generates the recipe-appropriate entry,
 * bundles it, and caches the result at `outPath` (default a per-recipe file
 * under the OS tmpdir — never the host project's `design/` dir; nothing
 * audit-related is committed to the project). The cache key is the
 * generated entry source itself (deterministic per recipe/kit version), not
 * a project file's content hash — there is no project source file to hash
 * anymore.
 */
export function bundleTier0AuditForRecipe({ cwd, recipe = null, outPath, maxChars = 50000 } = {}) {
  if (!cwd) throw new Error('bundleTier0AuditForRecipe: cwd is required')

  const entrySource = generateTier0AuditEntry(recipe)
  const hash = createHash('sha256').update(entrySource).digest('hex')
  const resolvedOutPath = outPath || join(tmpdir(), `argo-tier0-audit-bundle-${recipe ?? 'none'}.js`)
  const hashPath = `${resolvedOutPath}.hash`

  if (existsSync(resolvedOutPath) && existsSync(hashPath) && readFileSync(hashPath, 'utf8').trim() === hash) {
    return { bundled: readFileSync(resolvedOutPath, 'utf8'), bundlePath: resolvedOutPath, cached: true }
  }

  const bundled = bundleTier0Audit(entrySource, { cwd, maxChars })
  writeFileSync(resolvedOutPath, bundled, 'utf8')
  writeFileSync(hashPath, hash, 'utf8')
  return { bundled, bundlePath: resolvedOutPath, cached: false }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const recipeIndex = args.indexOf('--recipe')
  const outIndex = args.indexOf('--out')
  const cwd = process.cwd()
  const recipe = recipeIndex === -1 ? null : args[recipeIndex + 1]
  const outPath = outIndex === -1 ? undefined : args[outIndex + 1]

  try {
    const { bundled, bundlePath, cached } = bundleTier0AuditForRecipe({ cwd, recipe, outPath })
    console.log(JSON.stringify({ bundlePath, chars: bundled.length, cached }))
  } catch (err) {
    console.error(`bundle-tier0-audit: ${err.message}`)
    process.exit(1)
  }
}
