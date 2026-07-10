// Bundled on demand for use_figma, never assembled/committed into a host project —
// avoids the splice-into-design-rules-audit.js drift bug this rewrite replaced.
import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, rmSync, existsSync, readdirSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { issueAuditNonce } from '../session-guard/lib/audit-nonce.js'
import { resolveRepoRoot } from '../../../../lib/repo-root.js'

const RECIPE_ENTRIES: Record<string, { importPath: string }> = {
  'shadcn-tailwind': {
    importPath: '@argohq/toolkit/design-kit/shadcn-tailwind/design-rules-walker'
  }
}

// Pure string generation (no I/O): `recipe` is the app's design.<app>.recipe value;
// null/unknown produces a mechanism-only entry with no recipe checks.
export function generateDesignRulesAuditEntry(recipe: string | null): string {
  const recipeEntry = recipe ? RECIPE_ENTRIES[recipe] : null

  if (!recipeEntry) {
    return [
      "import { runDesignRulesAudit } from '@argohq/toolkit/design-kit/design-rules-audit'",
      '',
      'runDesignRulesAudit'
    ].join('\n')
  }

  return [
    "import { runDesignRulesAudit } from '@argohq/toolkit/design-kit/design-rules-audit'",
    `import { runRecipeDesignRulesChecks } from '${recipeEntry.importPath}'`,
    '',
    'async function designRulesAuditWithRecipe(options = {}) {',
    '  return runDesignRulesAudit({',
    '    ...options,',
    '    runRecipeDesignRulesChecks: (node, ctx) => runRecipeDesignRulesChecks(node, {',
    '      ...ctx,',
    '      semanticCollectionName: options.semanticCollectionName',
    '    }),',
    '  })',
    '}',
    '',
    'designRulesAuditWithRecipe'
  ].join('\n')
}

const BARE_IDENTIFIER = /^[A-Za-z_$][\w$]*$/
const DEFAULT_EXPORT_STATEMENT = /\n?export\s*\{\s*([\w$]+)\s+as\s+default\s*\};?\s*$/

// The entry ends in a bare identifier (the sandbox's eval completion value), which a
// tree-shaking bundler treats as dead code and drops (observed: bundle collapsed to
// ~180 bytes) — force `export default` to keep it alive; restoreCompletionExpression
// converts it back since `export` is unusable in the importless sandbox.
function makeExportForBundling(source: string): string {
  const trimmed = source.replace(/\s+$/, '')
  const lines = trimmed.split('\n')
  const lastLine = lines[lines.length - 1].trim()
  if (!BARE_IDENTIFIER.test(lastLine)) {
    throw new Error(
      `bundleDesignRulesAudit: expected the entry source to end with a bare identifier (its sandbox completion value), found "${lastLine}"`
    )
  }
  lines[lines.length - 1] = `export default ${lastLine}`
  return lines.join('\n')
}

function restoreCompletionExpression(bundled: string): string {
  const match = bundled.match(DEFAULT_EXPORT_STATEMENT)
  if (!match) {
    throw new Error('bundleDesignRulesAudit: expected the bundled output to end with a default export to convert back to a bare completion expression')
  }
  return `${bundled.slice(0, match.index)}\n${match[1]};\n`
}

// Bundles an entry into a single import/export-free script runnable in the use_figma
// sandbox. Writes the entry inside `cwd` so the kit resolves from the host's real
// node_modules, then verifies zero import/export statements and the 50,000-char cap.
export function bundleDesignRulesAudit(entrySource: string, { cwd, maxChars = 50000 }: { cwd: string; maxChars?: number }): string {
  if (!cwd) throw new Error('bundleDesignRulesAudit: cwd is required (@argohq/toolkit resolves from its node_modules)')

  const entryPath = join(cwd, `.design-rules-audit-bundle-${process.pid}-${Date.now()}.mjs`)
  const outPath = `${entryPath}.bundled.js`
  writeFileSync(entryPath, makeExportForBundling(entrySource), 'utf8')

  try {
    const result = spawnSync('bun', ['build', '--bundle', '--format=esm', entryPath, `--outfile=${outPath}`], {
      encoding: 'utf8'
    })
    if (result.status !== 0) {
      throw new Error(`bundleDesignRulesAudit: bun build failed: ${result.stderr || result.stdout}`)
    }

    const bundled = restoreCompletionExpression(readFileSync(outPath, 'utf8'))
    if (/^\s*(import|export)\s/m.test(bundled)) {
      throw new Error('bundleDesignRulesAudit: bundled output still contains an import/export statement — not sandbox-runnable')
    }
    if (bundled.length > maxChars) {
      throw new Error(`bundleDesignRulesAudit: bundled output is ${bundled.length} chars, exceeds use_figma's ${maxChars}-char cap`)
    }
    return bundled
  } finally {
    rmSync(entryPath, { force: true })
    rmSync(outPath, { force: true })
  }
}

// Hashes the actual imported dist bytes (not just package version, since a
// `link:`-installed dev kit never bumps version per rebuild) so a kit rebuild that
// changes audit logic invalidates the stale cached bundle instead of silently serving it.
export function kitDistHash(cwd: string): string {
  try {
    const kitRoot = realpathSync(join(cwd, 'node_modules', '@argohq', 'toolkit'))
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

// Extracts the bare trailing identifier the bundler assigned to the audit function;
// the replay script needs it to reconstruct the function via `new Function`.
export function designRulesCompletionIdentifier(bundled: string): string {
  const match = bundled.replace(/\s+$/, '').match(TRAILING_IDENTIFIER)
  if (!match) {
    throw new Error(
      'designRulesCompletionIdentifier: bundled output must end with a bare completion identifier'
    )
  }
  return match[1]
}

// Stored on figma.root via setSharedPluginData — the only cross-call persistence
// use_figma exposes (getPluginData/setPluginData are unsupported there).
export const DESIGN_RULES_CACHE_NAMESPACE = 'argoDesignRulesAudit'
const DESIGN_RULES_CACHE_KEY_SRC = 'bundleSrc'
const DESIGN_RULES_CACHE_KEY_HASH = 'bundleHash'

// Scoped by session id because concurrent designers share one figma.root: a global
// key means one writer's prime overwrites another's, causing spurious cache misses
// (observed live: 2/3 clean, 3rd cache-missed twice). No session id falls back to base keys.
export function designRulesCacheKeys(sessionId?: string | null): { srcKey: string; hashKey: string } {
  const suffix = sessionId ? `:${sessionId}` : ''
  return {
    srcKey: `${DESIGN_RULES_CACHE_KEY_SRC}${suffix}`,
    hashKey: `${DESIGN_RULES_CACHE_KEY_HASH}${suffix}`
  }
}

// Paste ONCE per file session: stores the bundle source + version hash, store-only
// (no execution) to stay under use_figma's 50,000-char cap for large recipe bundles.
export function generateDesignRulesPrimeScript(bundled: string, hash: string, sessionId?: string | null): string {
  const ns = JSON.stringify(DESIGN_RULES_CACHE_NAMESPACE)
  const { srcKey, hashKey } = designRulesCacheKeys(sessionId)
  return [
    `const __designRulesSrc = ${JSON.stringify(bundled)};`,
    `figma.root.setSharedPluginData(${ns}, ${JSON.stringify(hashKey)}, ${JSON.stringify(hash)});`,
    `figma.root.setSharedPluginData(${ns}, ${JSON.stringify(srcKey)}, __designRulesSrc);`,
    `return { primed: true, hash: ${JSON.stringify(hash)}, bytes: __designRulesSrc.length };`
  ].join('\n')
}

// Paste for EVERY audit/re-audit: guards on version hash so a kit rebuild forces a
// re-prime rather than silently auditing with stale logic; returns a cache-miss
// marker when absent or stale so the caller re-primes.
export function generateDesignRulesReplayScript(
  completionId: string,
  hash: string,
  optionsLiteral: string,
  sessionId?: string | null
): string {
  if (!BARE_IDENTIFIER.test(completionId)) {
    throw new Error(`generateDesignRulesReplayScript: invalid completion identifier "${completionId}"`)
  }
  const ns = JSON.stringify(DESIGN_RULES_CACHE_NAMESPACE)
  const { srcKey, hashKey } = designRulesCacheKeys(sessionId)
  return [
    `const __designRulesSrc = figma.root.getSharedPluginData(${ns}, ${JSON.stringify(srcKey)});`,
    `const __designRulesHash = figma.root.getSharedPluginData(${ns}, ${JSON.stringify(hashKey)});`,
    `if (!__designRulesSrc || __designRulesHash !== ${JSON.stringify(hash)}) return { __designRulesCacheMiss: true };`,
    `const __designRulesAudit = new Function(__designRulesSrc + ${JSON.stringify(`\nreturn ${completionId};`)})();`,
    `return await __designRulesAudit(${optionsLiteral});`
  ].join('\n')
}

// Generates the recipe entry, bundles it, and caches at outPath (default OS tmpdir,
// never the project's design/ dir). The cache key folds entry source + kit dist hash,
// so a kit rebuild invalidates both this cache and the in-Figma one (same hash).
export function bundleDesignRulesAuditForRecipe({
  cwd,
  recipe = null,
  outPath,
  maxChars = 50000
}: { cwd: string; recipe?: string | null; outPath?: string; maxChars?: number }) {
  if (!cwd) throw new Error('bundleDesignRulesAuditForRecipe: cwd is required')

  const entrySource = generateDesignRulesAuditEntry(recipe)
  const hash = createHash('sha256').update(`${entrySource} ${kitDistHash(cwd)}`).digest('hex')
  const resolvedOutPath = outPath || join(tmpdir(), `argo-design-rules-audit-bundle-${recipe ?? 'none'}.js`)
  const hashPath = `${resolvedOutPath}.hash`

  if (existsSync(resolvedOutPath) && existsSync(hashPath) && readFileSync(hashPath, 'utf8').trim() === hash) {
    const bundled = readFileSync(resolvedOutPath, 'utf8')
    return { bundled, bundlePath: resolvedOutPath, cached: true, hash, completionId: designRulesCompletionIdentifier(bundled) }
  }

  const bundled = bundleDesignRulesAudit(entrySource, { cwd, maxChars })
  writeFileSync(resolvedOutPath, bundled, 'utf8')
  writeFileSync(hashPath, hash, 'utf8')
  return { bundled, bundlePath: resolvedOutPath, cached: false, hash, completionId: designRulesCompletionIdentifier(bundled) }
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
  // --session overrides for tests; prod reads CLAUDE_CODE_SESSION_ID.
  const sessionId = flag('--session') ?? process.env.CLAUDE_CODE_SESSION_ID ?? null

  try {
    const { bundled, bundlePath, cached, hash, completionId } = bundleDesignRulesAuditForRecipe({ cwd, recipe, outPath })

    // record-audit-receipt refuses a receipt whose nonce a bundle emission didn't mint.
    let nonceNames: string[] = []
    const namesFlag = flag('--componentNames')
    if (namesFlag) {
      nonceNames = JSON.parse(namesFlag)
    } else if (optionsLiteral) {
      try {
        const parsedOptions = JSON.parse(optionsLiteral)
        if (Array.isArray(parsedOptions?.componentNames)) nonceNames = parsedOptions.componentNames
      } catch {
        /* replay mode surfaces options parse errors below */
      }
    }
    const { nonce } = issueAuditNonce(resolveRepoRoot(cwd), nonceNames)

    if (emit === 'prime') {
      console.log(JSON.stringify({ script: generateDesignRulesPrimeScript(bundled, hash, sessionId), hash, cached, nonce }))
    } else if (emit === 'replay') {
      if (!optionsLiteral) throw new Error('--emit replay requires --options <json-options-object>')
      console.log(JSON.stringify({ script: generateDesignRulesReplayScript(completionId, hash, optionsLiteral, sessionId), hash, nonce }))
    } else {
      console.log(JSON.stringify({ bundlePath, chars: bundled.length, cached, hash, completionId, nonce }))
    }
  } catch (err: any) {
    console.error(`bundle-design-rules-audit: ${err.message}`)
    process.exit(1)
  }
}
