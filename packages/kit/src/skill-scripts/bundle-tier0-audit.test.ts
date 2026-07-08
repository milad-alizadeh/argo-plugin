import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  generateTier0AuditEntry,
  bundleTier0Audit,
  bundleTier0AuditForRecipe,
  kitDistHash,
  tier0CompletionIdentifier,
  generateTier0PrimeScript,
  generateTier0ReplayScript,
  TIER0_CACHE_NAMESPACE
} from './bundle-tier0-audit.js'

// Spawned as a real subprocess — dist, not the sibling .ts source. Requires
// `bun run build` to have produced a current packages/kit/dist/.
const CLI = fileURLToPath(new URL('../../dist/skill-scripts/bundle-tier0-audit.js', import.meta.url))

const PLUGIN_ROOT = join(import.meta.dirname, '..', '..', '..', '..')

function projectDirWithKit() {
  const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-bundle-'))
  // Mirror a real host install: @argohq/kit resolves as a bare specifier
  // from node_modules alongside the generated entry, subpaths via exports.
  mkdirSync(join(cwd, 'node_modules/@argohq'), { recursive: true })
  symlinkSync(join(PLUGIN_ROOT, 'packages/kit'), join(cwd, 'node_modules/@argohq/kit'))
  return cwd
}

describe('generateTier0AuditEntry', () => {
  it('for recipe null, imports only runTier0Audit from @argohq/kit and ends with a bare completion reference', () => {
    const entry = generateTier0AuditEntry(null)
    expect(entry).toContain("from '@argohq/kit/design-kit/tier0-audit'")
    expect(entry.trim().split('\n').at(-1)!.trim()).toMatch(/^[A-Za-z_$][\w$]*$/)
    expect(entry).not.toMatch(/recipes\/shadcn-tailwind/)
  })

  it('never wires the retired geometry pass (folded into per-node tier-0 rules)', () => {
    expect(generateTier0AuditEntry(null)).not.toContain('composeGeometryChecks')
    expect(generateTier0AuditEntry('shadcn-tailwind')).not.toContain('composeGeometryChecks')
  })

  it("for recipe 'shadcn-tailwind', imports the recipe's tier0-walker and curries options data into it", () => {
    const entry = generateTier0AuditEntry('shadcn-tailwind')
    expect(entry).toContain("from '@argohq/kit/design-kit/shadcn-tailwind/tier0-walker'")
    expect(entry).not.toContain('options.kitVariableKeys')
    expect(entry).not.toContain('options.retiredKitVariableKeys')
    expect(entry).not.toContain('options.kitPatches')
    expect(entry).toContain('options.semanticCollectionName')
    expect(entry.trim().split('\n').at(-1)!.trim()).toMatch(/^[A-Za-z_$][\w$]*$/)
  })
})

describe('bundleTier0Audit (real bun build, the actual Defect 1 proof)', () => {
  it('bundles the shadcn-tailwind entry into an import-free, under-cap script containing the mechanism + recipe rule logic', () => {
    const cwd = projectDirWithKit()
    try {
      const entry = generateTier0AuditEntry('shadcn-tailwind')
      const bundled = bundleTier0Audit(entry, { cwd })
      expect(bundled).not.toMatch(/^\s*(import|export)\s/m)
      expect(bundled.length).toBeLessThanOrEqual(50000)
      // Guards against a tree-shaker silently discarding the whole audit
      // body as "unused" because the entry's own completion-value convention
      // (a bare trailing identifier, not a call) reads as dead code to a
      // bundler — the real rule logic must still be present in the output.
      expect(bundled).toContain('unbound-radius')
      // Anti-recreation gate (design-first-council-ruling.md Gate ruling,
      // Option B): guards against compositeRegionNamingViolation being
      // tree-shaken away or never wired into the walker.
      expect(bundled).toContain('composite-region-traced-not-instance')
      // Recipe checks actually made it into the bundle too.
      expect(bundled).toContain('non-semantic-binding')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})

describe('bundleTier0AuditForRecipe (skill-facing entry point — bundle-on-demand, never written into the project)', () => {
  it('writes the bundle outside the host project (a caller-provided outPath, e.g. a tmpdir path) and caches on the second call', () => {
    const cwd = projectDirWithKit()
    const outPath = join(cwd, '..', `${cwd.split('/').pop()}-out.js`)
    try {
      const first = bundleTier0AuditForRecipe({ cwd, recipe: null, outPath })
      expect(first.cached).toBe(false)
      expect(first.bundlePath).toBe(outPath)

      const second = bundleTier0AuditForRecipe({ cwd, recipe: null, outPath })
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
      const kitRoot = join(cwd, 'node_modules/@argohq/kit')
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

  it('folds into bundleTier0AuditForRecipe.hash — a dist change flips cached to false', () => {
    const cwd = projectDirWithKit()
    const outPath = join(cwd, '..', `${cwd.split('/').pop()}-invalidate.js`)
    try {
      const first = bundleTier0AuditForRecipe({ cwd, recipe: null, outPath })
      expect(first.cached).toBe(false)
      expect(bundleTier0AuditForRecipe({ cwd, recipe: null, outPath }).cached).toBe(true)

      const canary = join(cwd, 'node_modules/@argohq/kit', 'dist', '__canary2__.js')
      writeFileSync(canary, `// ${Date.now()}\n`)
      try {
        const afterRebuild = bundleTier0AuditForRecipe({ cwd, recipe: null, outPath })
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

describe('tier0CompletionIdentifier', () => {
  it('extracts the bare trailing completion identifier', () => {
    expect(tier0CompletionIdentifier('const a = 1;\nrunTier0Audit;\n')).toBe('runTier0Audit')
    expect(tier0CompletionIdentifier('foo\n')).toBe('foo')
  })
  it('throws when the output does not end in a bare identifier', () => {
    expect(() => tier0CompletionIdentifier('foo()')).toThrow()
  })
})

describe('in-Figma bundle cache scripts (item A — prime once, replay tiny)', () => {
  it('prime script embeds the bundle once as a JSON string and stores src+hash on figma.root', () => {
    const script = generateTier0PrimeScript('runTier0Audit;', 'HASH123')
    expect(script).toContain(TIER0_CACHE_NAMESPACE)
    expect(script).toContain('setSharedPluginData')
    expect(script).toContain('HASH123')
    expect(script).toContain(JSON.stringify('runTier0Audit;'))
    expect(script).toContain('primed: true')
    // No import/export — must be sandbox-runnable.
    expect(script).not.toMatch(/^\s*(import|export)\s/m)
  })

  it('replay script reads the cache, guards on hash (cache-miss sentinel), and never re-embeds the bundle', () => {
    const bundle = 'x'.repeat(28000) + '\nrunTier0Audit;\n'
    const replay = generateTier0ReplayScript('runTier0Audit', 'HASH123', '{"componentNames":["Button"]}')
    expect(replay).toContain('getSharedPluginData')
    expect(replay).toContain('__tier0CacheMiss')
    expect(replay).toContain('new Function')
    expect(replay).toContain('return runTier0Audit;')
    expect(replay).toContain('{"componentNames":["Button"]}')
    // The whole point: the ~28KB bundle must NOT appear in the replay script.
    expect(replay).not.toContain(bundle)
    expect(replay.length).toBeLessThan(600)
  })

  it('rejects an unsafe completion identifier', () => {
    expect(() => generateTier0ReplayScript('foo(); danger', 'H', '{}')).toThrow()
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

describe('CLI (argo design bundle-tier0-audit)', () => {
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
