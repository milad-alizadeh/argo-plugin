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
 * that recipe's `runRecipeTier0Checks` from `@argohq/kit`, and wraps it so
 * project DATA passed in `options` at call time (semanticCollectionName)
 * reaches the recipe function too — functions can't cross the `use_figma`
 * data boundary, so they're baked into the bundle via imports; only DATA
 * flows through the options object the caller passes.
 *
 * `bundleTier0Audit` — shells out to `bun build --bundle` to produce a
 * self-contained, import-free script (the ONLY thing `use_figma` can run —
 * there is no module resolution in that sandbox), resolving `@argohq/kit`
 * from the host project's own `node_modules` (hence the required `cwd`).
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, rmSync, existsSync, readdirSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RECIPE_ENTRIES: Record<string, { importPath: string }> = {
  'shadcn-tailwind': {
    importPath: '@argohq/kit/design-kit/shadcn-tailwind/tier0-walker'
  }
}

/**
 * Pure string generation (no I/O, no bun build) — the entry source
 * `bundleTier0Audit` bundles. `recipe` is the app's `design.<app>.recipe`
 * value (e.g. `'shadcn-tailwind'`); `null`/unknown ⇒ mechanism-only entry, no
 * recipe checks.
 */
export function generateTier0AuditEntry(recipe: string | null): string {
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
    `import { runRecipeTier0Checks } from '${recipeEntry.importPath}'`,
    '',
    'async function tier0AuditWithRecipe(options = {}) {',
    '  return runTier0Audit({',
    '    ...options,',
    '    runRecipeTier0Checks: (node, ctx) => runRecipeTier0Checks(node, {',
    '      ...ctx,',
    '      semanticCollectionName: options.semanticCollectionName',
    '    }),',
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
function makeExportForBundling(source: string): string {
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

function restoreCompletionExpression(bundled: string): string {
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
export function bundleTier0Audit(entrySource: string, { cwd, maxChars = 50000 }: { cwd: string; maxChars?: number }): string {
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
 * Content hash of the actually-imported `@argohq/kit` dist that a bundle bakes
 * in — the kit-version half of the cache key. The old key hashed only the
 * generated entry *template* (a static string per recipe), so a kit rebuild
 * that changed the audit logic left the tmp cache — and the in-Figma
 * `sharedPluginData` cache below — serving a stale bundle until a human
 * deleted the tmp file by hand (memory: "Bundle cache stale after kit
 * rebuild"). A `link:`-installed kit in dev never bumps its package version
 * per rebuild, so version alone is insufficient; we hash the dist bytes.
 * Resolves kit from `cwd` exactly as the bundle's imports do, follows the
 * symlink, and folds every `dist/` file's path+bytes (plus the package
 * version) into one digest. Falls back to a sentinel if kit or its dist can't
 * be resolved — the entry-source half still keys the cache in that case.
 */
export function kitDistHash(cwd: string): string {
  try {
    const kitRoot = realpathSync(join(cwd, 'node_modules', '@argohq', 'kit'))
    const distDir = join(kitRoot, 'dist')
    const h = createHash('sha256')
    let version = ''
    try {
      version = JSON.parse(readFileSync(join(kitRoot, 'package.json'), 'utf8')).version || ''
    } catch {
      /* version optional — dist bytes carry the real signal */
    }
    h.update(`version:${version}\n`)
    if (!existsSync(distDir)) return `nodist:${version || 'unknown'}`
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name)
        if (entry.isDirectory()) walk(p)
        else files.push(p)
      }
    }
    walk(distDir)
    for (const f of files.sort()) {
      h.update(`${f.slice(distDir.length)}\0`)
      h.update(readFileSync(f))
    }
    return h.digest('hex')
  } catch {
    return 'unresolved-kit'
  }
}

const TRAILING_IDENTIFIER = /([A-Za-z_$][\w$]*)\s*;?\s*$/

/**
 * The bundle's completion value is a bare trailing identifier (see
 * `makeExportForBundling`) — the name bun's bundler assigned to the audit
 * function. The `sharedPluginData` replay reconstructs the function with
 * `new Function(src + 'return <id>')`, so it needs that identifier.
 */
export function tier0CompletionIdentifier(bundled: string): string {
  const match = bundled.replace(/\s+$/, '').match(TRAILING_IDENTIFIER)
  if (!match) {
    throw new Error(
      'tier0CompletionIdentifier: bundled output must end with a bare completion identifier'
    )
  }
  return match[1]
}

/**
 * Namespace + keys for the in-Figma bundle cache, stored on `figma.root` via
 * `setSharedPluginData` (the only cross-call persistence `use_figma` exposes;
 * `getPluginData`/`setPluginData` are unsupported there). Probed live: `eval`
 * and `new Function` both run in the `use_figma` sandbox, a `new Function`
 * body sees the `figma` global, and a 28 KB entry round-trips (100 KB/entry
 * limit). That makes a true MCP-side cache reachable: embed the ~28 KB bundle
 * ONCE into the file (prime), then every audit/re-audit sends only a tiny
 * replay script instead of re-pasting the bundle (waste-map lever #1).
 */
export const TIER0_CACHE_NAMESPACE = 'argoTier0Audit'
const TIER0_CACHE_KEY_SRC = 'bundleSrc'
const TIER0_CACHE_KEY_HASH = 'bundleHash'

/**
 * Per-writer cache keys. Concurrent designers fanned out over one Figma file
 * share a single `figma.root`, so a global key means one designer's prime
 * overwrites another's, and a replay reads a sibling's value (or a half-written
 * one) → spurious hash-mismatch → fallback to a full ~31KB inline re-embed,
 * defeating the optimization exactly under the parallelism it should help
 * (observed live: 2/3 clean, the 3rd cache-missed twice). Scoping the
 * shared-plugin-data keys by `CLAUDE_CODE_SESSION_ID` (mirrors the per-session
 * `.argo/` design-guard state) gives each writer its own cache slot: N
 * concurrent designers → N independent slots, zero cross-talk. No session id →
 * the base keys, so a single-designer / test run is still 1-prime/N-replay.
 */
export function tier0CacheKeys(sessionId?: string | null): { srcKey: string; hashKey: string } {
  const suffix = sessionId ? `:${sessionId}` : ''
  return {
    srcKey: `${TIER0_CACHE_KEY_SRC}${suffix}`,
    hashKey: `${TIER0_CACHE_KEY_HASH}${suffix}`
  }
}

/**
 * Prime script (paste ONCE per file session): embeds the bundle source a
 * single time as a JSON string literal, stores it + the version hash on
 * `figma.root` under the caller's per-session keys, and returns without running
 * the audit. Store-only keeps this well under the 50,000-char `use_figma` cap
 * even for large recipe bundles (embedding the source AND an executable copy in
 * one call would risk the cap). Re-audits then run via
 * `generateTier0ReplayScript` with the same `sessionId`.
 */
export function generateTier0PrimeScript(bundled: string, hash: string, sessionId?: string | null): string {
  const ns = JSON.stringify(TIER0_CACHE_NAMESPACE)
  const { srcKey, hashKey } = tier0CacheKeys(sessionId)
  return [
    `const __tier0Src = ${JSON.stringify(bundled)};`,
    `figma.root.setSharedPluginData(${ns}, ${JSON.stringify(hashKey)}, ${JSON.stringify(hash)});`,
    `figma.root.setSharedPluginData(${ns}, ${JSON.stringify(srcKey)}, __tier0Src);`,
    `return { primed: true, hash: ${JSON.stringify(hash)}, bytes: __tier0Src.length };`
  ].join('\n')
}

/**
 * Replay script (paste for EVERY audit and re-audit): reads the primed bundle
 * back from `figma.root` under the caller's per-session keys, guards on the
 * version hash (a kit rebuild changes `hash`, forcing a re-prime rather than
 * silently auditing with stale logic), reconstructs the audit function via
 * `new Function`, and calls it with the per-call options object. Returns
 * `{ __tier0CacheMiss: true }` if this session's cache is absent or stale — the
 * caller re-runs the prime script (under the same `sessionId`), then this, so
 * every subsequent replay in the session hits. `optionsLiteral` is the JSON
 * options object from `prepare-tier0-audit-options`.
 */
export function generateTier0ReplayScript(
  completionId: string,
  hash: string,
  optionsLiteral: string,
  sessionId?: string | null
): string {
  if (!BARE_IDENTIFIER.test(completionId)) {
    throw new Error(`generateTier0ReplayScript: invalid completion identifier "${completionId}"`)
  }
  const ns = JSON.stringify(TIER0_CACHE_NAMESPACE)
  const { srcKey, hashKey } = tier0CacheKeys(sessionId)
  return [
    `const __tier0Src = figma.root.getSharedPluginData(${ns}, ${JSON.stringify(srcKey)});`,
    `const __tier0Hash = figma.root.getSharedPluginData(${ns}, ${JSON.stringify(hashKey)});`,
    `if (!__tier0Src || __tier0Hash !== ${JSON.stringify(hash)}) return { __tier0CacheMiss: true };`,
    `const __tier0Audit = new Function(__tier0Src + ${JSON.stringify(`\nreturn ${completionId};`)})();`,
    `return await __tier0Audit(${optionsLiteral});`
  ].join('\n')
}

/**
 * The skill-facing entry point: generates the recipe-appropriate entry,
 * bundles it, and caches the result at `outPath` (default a per-recipe file
 * under the OS tmpdir — never the host project's `design/` dir; nothing
 * audit-related is committed to the project). The cache key folds the
 * generated entry source AND a content hash of the imported `@argohq/kit`
 * dist (`kitDistHash`), so a kit rebuild automatically invalidates the stale
 * bundle. The returned `hash` doubles as the in-Figma `sharedPluginData`
 * cache version key (prime/replay), so one rebuild invalidates both caches.
 */
export function bundleTier0AuditForRecipe({
  cwd,
  recipe = null,
  outPath,
  maxChars = 50000
}: { cwd: string; recipe?: string | null; outPath?: string; maxChars?: number }) {
  if (!cwd) throw new Error('bundleTier0AuditForRecipe: cwd is required')

  const entrySource = generateTier0AuditEntry(recipe)
  const hash = createHash('sha256').update(`${entrySource} ${kitDistHash(cwd)}`).digest('hex')
  const resolvedOutPath = outPath || join(tmpdir(), `argo-tier0-audit-bundle-${recipe ?? 'none'}.js`)
  const hashPath = `${resolvedOutPath}.hash`

  if (existsSync(resolvedOutPath) && existsSync(hashPath) && readFileSync(hashPath, 'utf8').trim() === hash) {
    const bundled = readFileSync(resolvedOutPath, 'utf8')
    return { bundled, bundlePath: resolvedOutPath, cached: true, hash, completionId: tier0CompletionIdentifier(bundled) }
  }

  const bundled = bundleTier0Audit(entrySource, { cwd, maxChars })
  writeFileSync(resolvedOutPath, bundled, 'utf8')
  writeFileSync(hashPath, hash, 'utf8')
  return { bundled, bundlePath: resolvedOutPath, cached: false, hash, completionId: tier0CompletionIdentifier(bundled) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const flag = (name: string) => {
    const i = args.indexOf(name)
    return i === -1 ? undefined : args[i + 1]
  }
  const cwd = process.cwd()
  const recipe = flag('--recipe') ?? null
  const outPath = flag('--out')
  const emit = flag('--emit') // 'prime' | 'replay' | undefined
  const optionsLiteral = flag('--options') // JSON string, required for --emit replay
  // Per-writer cache scope so concurrent designers in one Figma file don't
  // collide on figma.root's shared plugin data. `--session` overrides the env
  // (test hook); prod reads CLAUDE_CODE_SESSION_ID like the other design gates.
  const sessionId = flag('--session') ?? process.env.CLAUDE_CODE_SESSION_ID ?? null

  try {
    const { bundled, bundlePath, cached, hash, completionId } = bundleTier0AuditForRecipe({ cwd, recipe, outPath })

    if (emit === 'prime') {
      console.log(JSON.stringify({ script: generateTier0PrimeScript(bundled, hash, sessionId), hash, cached }))
    } else if (emit === 'replay') {
      if (!optionsLiteral) throw new Error('--emit replay requires --options <json-options-object>')
      console.log(JSON.stringify({ script: generateTier0ReplayScript(completionId, hash, optionsLiteral, sessionId), hash }))
    } else {
      console.log(JSON.stringify({ bundlePath, chars: bundled.length, cached, hash, completionId }))
    }
  } catch (err: any) {
    console.error(`bundle-tier0-audit: ${err.message}`)
    process.exit(1)
  }
}
