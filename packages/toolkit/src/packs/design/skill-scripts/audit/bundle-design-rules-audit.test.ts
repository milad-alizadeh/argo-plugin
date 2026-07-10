import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  generateDesignRulesAuditEntry,
  bundleDesignRulesAudit,
  bundleDesignRulesAuditForRecipe,
  kitDistHash,
  designRulesCompletionIdentifier,
  generateDesignRulesPrimeScript,
  generateDesignRulesReplayScript,
  designRulesCacheKeys,
  DESIGN_RULES_CACHE_NAMESPACE
} from './bundle-design-rules-audit.js'

// Spawned as a real subprocess against the built dist — run `bun run build` first.
const CLI = fileURLToPath(new URL('../../../../../dist/packs/design/skill-scripts/audit/bundle-design-rules-audit.js', import.meta.url))

const PLUGIN_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..', '..', '..')

function projectDirWithKit() {
  const cwd = mkdtempSync(join(tmpdir(), 'design-rules-audit-bundle-'))
  // Mirror a real host install: @argohq/toolkit resolves as a bare specifier
  // from node_modules alongside the generated entry, subpaths via exports.
  mkdirSync(join(cwd, 'node_modules/@argohq'), { recursive: true })
  symlinkSync(join(PLUGIN_ROOT, 'packages/toolkit'), join(cwd, 'node_modules/@argohq/toolkit'))
  return cwd
}

describe('generateDesignRulesAuditEntry', () => {
  it('for recipe null, imports only runDesignRulesAudit from @argohq/toolkit and ends with a bare completion reference', () => {
    const entry = generateDesignRulesAuditEntry(null)
    expect(entry).toContain("from '@argohq/toolkit/design-kit/design-rules-audit'")
    expect(entry.trim().split('\n').at(-1)!.trim()).toMatch(/^[A-Za-z_$][\w$]*$/)
    expect(entry).not.toMatch(/recipes\/shadcn-tailwind/)
  })

  it('never wires the retired geometry pass (folded into per-node design-rules rules)', () => {
    expect(generateDesignRulesAuditEntry(null)).not.toContain('composeGeometryChecks')
    expect(generateDesignRulesAuditEntry('shadcn-tailwind')).not.toContain('composeGeometryChecks')
  })

  it("for recipe 'shadcn-tailwind', imports the recipe's design-rules-walker and curries options data into it", () => {
    const entry = generateDesignRulesAuditEntry('shadcn-tailwind')
    expect(entry).toContain("from '@argohq/toolkit/design-kit/shadcn-tailwind/design-rules-walker'")
    expect(entry).not.toContain('options.kitVariableKeys')
    expect(entry).not.toContain('options.retiredKitVariableKeys')
    expect(entry).not.toContain('options.kitPatches')
    expect(entry).toContain('options.semanticCollectionName')
    expect(entry.trim().split('\n').at(-1)!.trim()).toMatch(/^[A-Za-z_$][\w$]*$/)
  })
})

describe('bundleDesignRulesAudit (real bun build, the actual Defect 1 proof)', () => {
  it('bundles the shadcn-tailwind entry into an import-free, under-cap script containing the mechanism + recipe rule logic', () => {
    const cwd = projectDirWithKit()
    try {
      const entry = generateDesignRulesAuditEntry('shadcn-tailwind')
      const bundled = bundleDesignRulesAudit(entry, { cwd })
      expect(bundled).not.toMatch(/^\s*(import|export)\s/m)
      expect(bundled.length).toBeLessThanOrEqual(50000)
      // Guards against a tree-shaker silently discarding the whole audit
      // body as "unused" because the entry's own completion-value convention
      // (a bare trailing identifier, not a call) reads as dead code to a
      // bundler — the real rule logic must still be present in the output.
      expect(bundled).toContain('unbound-radius')
      // Anti-recreation gate: guards against this check being tree-shaken
      // away or never wired into the walker.
      expect(bundled).toContain('composite-region-traced-not-instance')
      // Recipe checks actually made it into the bundle too.
      expect(bundled).toContain('non-semantic-binding')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})

describe('bundleDesignRulesAuditForRecipe (skill-facing entry point — bundle-on-demand, never written into the project)', () => {
  it('writes the bundle outside the host project (a caller-provided outPath, e.g. a tmpdir path) and caches on the second call', () => {
    const cwd = projectDirWithKit()
    const outPath = join(cwd, '..', `${cwd.split('/').pop()}-out.js`)
    try {
      const first = bundleDesignRulesAuditForRecipe({ cwd, recipe: null, outPath })
      expect(first.cached).toBe(false)
      expect(first.bundlePath).toBe(outPath)

      const second = bundleDesignRulesAuditForRecipe({ cwd, recipe: null, outPath })
      expect(second.cached).toBe(true)
      expect(second.bundled).toBe(first.bundled)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
      rmSync(outPath, { force: true })
      rmSync(`${outPath}.hash`, { force: true })
    }
  })
})

describe('kitDistHash (item C — kit-version-aware cache key)', () => {
  it('changes when the imported kit dist bytes change, so a rebuild invalidates the cache', () => {
    const cwd = projectDirWithKit()
    try {
      const before = kitDistHash(cwd)
      // Simulate a kit rebuild that rewrote a dist file the bundle imports.
      const kitRoot = join(cwd, 'node_modules/@argohq/toolkit')
      const canary = join(kitRoot, 'dist', '__cache-invalidation-canary__.js')
      writeFileSync(canary, `// ${Date.now()}\n`)
      try {
        const after = kitDistHash(cwd)
        expect(after).not.toBe(before)
      } finally {
        rmSync(canary, { force: true })
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('folds into bundleDesignRulesAuditForRecipe.hash — a dist change flips cached to false', () => {
    const cwd = projectDirWithKit()
    const outPath = join(cwd, '..', `${cwd.split('/').pop()}-invalidate.js`)
    try {
      const first = bundleDesignRulesAuditForRecipe({ cwd, recipe: null, outPath })
      expect(first.cached).toBe(false)
      expect(bundleDesignRulesAuditForRecipe({ cwd, recipe: null, outPath }).cached).toBe(true)

      const canary = join(cwd, 'node_modules/@argohq/toolkit', 'dist', '__canary2__.js')
      writeFileSync(canary, `// ${Date.now()}\n`)
      try {
        const afterRebuild = bundleDesignRulesAuditForRecipe({ cwd, recipe: null, outPath })
        expect(afterRebuild.cached).toBe(false)
        expect(afterRebuild.hash).not.toBe(first.hash)
      } finally {
        rmSync(canary, { force: true })
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true })
      rmSync(outPath, { force: true })
      rmSync(`${outPath}.hash`, { force: true })
    }
  })
})

describe('designRulesCompletionIdentifier', () => {
  it('extracts the bare trailing completion identifier', () => {
    expect(designRulesCompletionIdentifier('const a = 1;\nrunDesignRulesAudit;\n')).toBe('runDesignRulesAudit')
    expect(designRulesCompletionIdentifier('foo\n')).toBe('foo')
  })
  it('throws when the output does not end in a bare identifier', () => {
    expect(() => designRulesCompletionIdentifier('foo()')).toThrow()
  })
})

describe('in-Figma bundle cache scripts (item A — prime once, replay tiny)', () => {
  it('prime script embeds the bundle once as a JSON string and stores src+hash on figma.root', () => {
    const script = generateDesignRulesPrimeScript('runDesignRulesAudit;', 'HASH123')
    expect(script).toContain(DESIGN_RULES_CACHE_NAMESPACE)
    expect(script).toContain('setSharedPluginData')
    expect(script).toContain('HASH123')
    expect(script).toContain(JSON.stringify('runDesignRulesAudit;'))
    expect(script).toContain('primed: true')
    // No import/export — must be sandbox-runnable.
    expect(script).not.toMatch(/^\s*(import|export)\s/m)
  })

  it('replay script reads the cache, guards on hash (cache-miss sentinel), and never re-embeds the bundle', () => {
    const bundle = 'x'.repeat(28000) + '\nrunDesignRulesAudit;\n'
    const replay = generateDesignRulesReplayScript('runDesignRulesAudit', 'HASH123', '{"componentNames":["Button"]}')
    expect(replay).toContain('getSharedPluginData')
    expect(replay).toContain('__designRulesCacheMiss')
    expect(replay).toContain('new Function')
    expect(replay).toContain('return runDesignRulesAudit;')
    expect(replay).toContain('{"componentNames":["Button"]}')
    // The whole point: the ~28KB bundle must NOT appear in the replay script.
    expect(replay).not.toContain(bundle)
    expect(replay.length).toBeLessThan(600)
  })

  it('rejects an unsafe completion identifier', () => {
    expect(() => generateDesignRulesReplayScript('foo(); danger', 'H', '{}')).toThrow()
  })

  it('scopes cache keys per session so concurrent designers do not collide, and falls back to base keys with no session', () => {
    const base = designRulesCacheKeys()
    expect(base).toEqual({ srcKey: 'bundleSrc', hashKey: 'bundleHash' })
    // No session id must equal an explicit null/empty — single-designer path.
    expect(designRulesCacheKeys(null)).toEqual(base)
    expect(designRulesCacheKeys('')).toEqual(base)

    const a = designRulesCacheKeys('sess-A')
    const b = designRulesCacheKeys('sess-B')
    expect(a.srcKey).toBe('bundleSrc:sess-A')
    expect(a.hashKey).toBe('bundleHash:sess-A')
    // The whole point: two concurrent designers never share a key.
    expect(a.srcKey).not.toBe(b.srcKey)
    expect(a.hashKey).not.toBe(b.hashKey)
    expect(a.srcKey).not.toBe(base.srcKey)
  })

  it('prime + replay embed the SAME per-session key (so a session replays its own prime) and different sessions are isolated', () => {
    const primeA = generateDesignRulesPrimeScript('runDesignRulesAudit;', 'H', 'sess-A')
    const replayA = generateDesignRulesReplayScript('runDesignRulesAudit', 'H', '{}', 'sess-A')
    const replayB = generateDesignRulesReplayScript('runDesignRulesAudit', 'H', '{}', 'sess-B')

    // A's prime writes the key A's replay reads.
    expect(primeA).toContain('bundleSrc:sess-A')
    expect(primeA).toContain('bundleHash:sess-A')
    expect(replayA).toContain('bundleSrc:sess-A')
    expect(replayA).toContain('bundleHash:sess-A')

    // B's replay never touches A's slot — no cross-talk, no spurious miss.
    expect(replayB).toContain('bundleSrc:sess-B')
    expect(replayB).not.toContain('sess-A')
  })

  it('CLI --session isolates concurrent writers; a replay under a DIFFERENT session reads a different key (would cache-miss), the SAME session matches', () => {
    const cwd = projectDirWithKit()
    const outPath = join(cwd, '..', `${cwd.split('/').pop()}-sess.js`)
    try {
      const primeA = spawnSync(
        'node',
        [CLI, '--out', outPath, '--emit', 'prime', '--session', 'A'],
        { cwd, encoding: 'utf8' }
      )
      expect(primeA.status).toBe(0)
      const primeAScript = JSON.parse(primeA.stdout).script
      expect(primeAScript).toContain('bundleSrc:A')

      const replayA = spawnSync(
        'node',
        [CLI, '--out', outPath, '--emit', 'replay', '--options', '{}', '--session', 'A'],
        { cwd, encoding: 'utf8' }
      )
      const replayB = spawnSync(
        'node',
        [CLI, '--out', outPath, '--emit', 'replay', '--options', '{}', '--session', 'B'],
        { cwd, encoding: 'utf8' }
      )
      expect(JSON.parse(replayA.stdout).script).toContain('bundleSrc:A')
      // B reads its own key, never A's — so it can't read A's mid-write value.
      expect(JSON.parse(replayB.stdout).script).toContain('bundleSrc:B')
      expect(JSON.parse(replayB.stdout).script).not.toContain('bundleSrc:A')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
      rmSync(outPath, { force: true })
      rmSync(`${outPath}.hash`, { force: true })
    }
  })

  it('CLI reads CLAUDE_CODE_SESSION_ID from the env when --session is absent', () => {
    const cwd = projectDirWithKit()
    const outPath = join(cwd, '..', `${cwd.split('/').pop()}-env.js`)
    try {
      const prime = spawnSync('node', [CLI, '--out', outPath, '--emit', 'prime'], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_CODE_SESSION_ID: 'env-sess' }
      })
      expect(prime.status).toBe(0)
      expect(JSON.parse(prime.stdout).script).toContain('bundleSrc:env-sess')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
      rmSync(outPath, { force: true })
      rmSync(`${outPath}.hash`, { force: true })
    }
  })

  it('CLI --emit prime and --emit replay print ready-to-paste scripts', () => {
    const cwd = projectDirWithKit()
    const outPath = join(cwd, '..', `${cwd.split('/').pop()}-emit.js`)
    try {
      const prime = spawnSync('node', [CLI, '--out', outPath, '--emit', 'prime'], { cwd, encoding: 'utf8' })
      expect(prime.status).toBe(0)
      const primeOut = JSON.parse(prime.stdout)
      expect(primeOut.script).toContain('setSharedPluginData')
      expect(primeOut.hash).toBeTruthy()

      const replay = spawnSync(
        'node',
        [CLI, '--out', outPath, '--emit', 'replay', '--options', '{"componentNames":[]}'],
        { cwd, encoding: 'utf8' }
      )
      expect(replay.status).toBe(0)
      const replayOut = JSON.parse(replay.stdout)
      expect(replayOut.script).toContain('getSharedPluginData')
      expect(replayOut.script).toContain('{"componentNames":[]}')
      expect(replayOut.script.length).toBeLessThan(700)
      // Same hash across prime and replay in one session — the cache key ties them.
      expect(replayOut.hash).toBe(primeOut.hash)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
      rmSync(outPath, { force: true })
      rmSync(`${outPath}.hash`, { force: true })
    }
  })

  it('CLI --emit replay without --options fails loudly', () => {
    const cwd = projectDirWithKit()
    const outPath = join(cwd, '..', `${cwd.split('/').pop()}-noopts.js`)
    try {
      const res = spawnSync('node', [CLI, '--out', outPath, '--emit', 'replay'], { cwd, encoding: 'utf8' })
      expect(res.status).toBe(1)
      expect(res.stderr).toContain('--options')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
      rmSync(outPath, { force: true })
      rmSync(`${outPath}.hash`, { force: true })
    }
  })
})

describe('CLI (argo design bundle-design-rules-audit)', () => {
  it('bundles the mechanism-only entry when run with no --recipe, printing bundlePath/chars/cached', () => {
    const cwd = projectDirWithKit()
    const outPath = join(cwd, '..', `${cwd.split('/').pop()}-cli-out.js`)
    try {
      const result = spawnSync('node', [CLI, '--out', outPath], { cwd, encoding: 'utf8' })

      expect(result.status).toBe(0)
      expect(existsSync(outPath)).toBe(true)
      const printed = JSON.parse(result.stdout)
      expect(printed.cached).toBe(false)
      expect(printed.bundlePath).toBe(outPath)
      expect(printed.chars).toBeGreaterThan(0)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
      rmSync(outPath, { force: true })
      rmSync(`${outPath}.hash`, { force: true })
    }
  })
})
