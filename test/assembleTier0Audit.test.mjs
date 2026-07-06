import { describe, it, expect } from 'vitest'
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  spliceRecipeChecks,
  fillSlots,
  bundleTier0Audit,
  bundleTier0AuditToFile
} from '../scripts/assemble-tier0-audit.mjs'

const PLUGIN_ROOT = join(import.meta.dirname, '..')

describe('spliceRecipeChecks', () => {
  it('replaces the marker line with the recipe checks source verbatim', () => {
    const mechanism = ['const a = 1', '// {{RECIPE_TIER0_CHECKS}}', 'const b = 2'].join('\n')
    const recipe = 'function runRecipeTier0Checks() {}'
    expect(spliceRecipeChecks(mechanism, recipe)).toBe(['const a = 1', 'function runRecipeTier0Checks() {}', 'const b = 2'].join('\n'))
  })

  it('deletes the marker line when recipeChecksSource is null (baseSource: none)', () => {
    const mechanism = ['const a = 1', '// {{RECIPE_TIER0_CHECKS}}', 'const b = 2'].join('\n')
    expect(spliceRecipeChecks(mechanism, null)).toBe(['const a = 1', 'const b = 2'].join('\n'))
  })
})

describe('fillSlots', () => {
  it('replaces every occurrence of a {{TOKEN}} with its value', () => {
    const source = "const a = '{{NAME}}'\nconst b = '{{NAME}}-suffix'"
    expect(fillSlots(source, { NAME: 'Semantic' })).toBe("const a = 'Semantic'\nconst b = 'Semantic-suffix'")
  })
})

describe('bundleTier0AuditToFile (bundle cache)', () => {
  it('skips re-bundling when the assembled source is unchanged (cached: true, identical output)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-bundle-cache-'))
    const sourcePath = join(cwd, 'tier0-audit.js')
    const bundlePath = join(cwd, 'tier0-audit.bundle.js')
    writeFileSync(sourcePath, 'const auditResult = { ok: true }\nauditResult\n', 'utf8')

    try {
      const first = bundleTier0AuditToFile(sourcePath, bundlePath)
      expect(first.cached).toBe(false)
      const second = bundleTier0AuditToFile(sourcePath, bundlePath)
      expect(second.cached).toBe(true)
      expect(second.bundled).toBe(first.bundled)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})

describe('bundleTier0Audit (real assembly, real bun build — the actual Defect 1 proof)', () => {
  it('bundles the real canonical mechanism + recipe into an import-free, under-cap script', () => {
    const mechanismSource = readFileSync(join(PLUGIN_ROOT, 'templates/design/tier0-audit.js'), 'utf8')
    const recipeChecksSource = readFileSync(
      join(PLUGIN_ROOT, 'templates/design/recipes/shadcn-tailwind-external-kit/design-source/tier0-recipe-checks.js'),
      'utf8'
    )

    let assembled = spliceRecipeChecks(mechanismSource, recipeChecksSource)
    assembled = fillSlots(assembled, {
      SEMANTIC_COLLECTION_NAME: 'Semantic',
      KIT_VARIABLE_KEYS_JSON: '[]',
      RETIRED_KIT_VARIABLE_KEYS_JSON: '[]'
    })

    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-assemble-'))
    writeFileSync(join(cwd, 'kit-patches.json'), '{}', 'utf8')
    // Mirror a real vendored install (setup-design §5): both packages resolve
    // as bare specifiers from node_modules alongside the assembled script.
    mkdirSync(join(cwd, 'node_modules'), { recursive: true })
    symlinkSync(join(PLUGIN_ROOT, 'packages/figma-design-kit'), join(cwd, 'node_modules/figma-design-kit'))
    symlinkSync(
      join(PLUGIN_ROOT, 'packages/figma-design-kit-shadcn-tailwind'),
      join(cwd, 'node_modules/figma-design-kit-shadcn-tailwind')
    )

    try {
      const bundled = bundleTier0Audit(assembled, { cwd })
      expect(bundled).not.toMatch(/^\s*import\s/m)
      expect(bundled.length).toBeLessThanOrEqual(50000)
      // Guards against a tree-shaker silently discarding the whole audit body
      // as "unused" because the mechanism's own completion-value convention
      // (a bare trailing identifier, not a call) reads as dead code to a
      // bundler — the real rule logic must still be present in the output.
      expect(bundled).toContain('unbound-radius')
      // Anti-recreation gate (design-first-council-ruling.md Gate ruling,
      // Option B): guards against the compositeRegionNamingViolation import
      // being tree-shaken away or never wired into the walker.
      expect(bundled).toContain('composite-region-traced-not-instance')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
