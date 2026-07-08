import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { generateTier0AuditEntry, bundleTier0Audit, bundleTier0AuditForRecipe } from './bundle-tier0-audit.js'

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
