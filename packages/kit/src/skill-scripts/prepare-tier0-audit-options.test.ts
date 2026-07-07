import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deriveTier0AuditOptions, parseCliArgs } from './prepare-tier0-audit-options.js'

describe('deriveTier0AuditOptions (figma-audit Node wrapper — anti-recreation gate wiring)', () => {
  it('reads design/registry.json and passes its component names as compositeNames', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(
      join(cwd, 'design', 'registry.json'),
      JSON.stringify({ components: { 'rail-session-card': { nodeId: '126:35' }, 'status-bar': { nodeId: '126:227' } } }),
      'utf8'
    )

    try {
      expect(deriveTier0AuditOptions({ cwd, componentNames: ['rail-session-card'] })).toEqual({
        componentNames: ['rail-session-card'],
        compositeNames: ['rail-session-card', 'status-bar'],
        semanticCollectionName: 'Semantic',
        recipe: null,
        kitPatches: {},
        retiredKitVariableKeys: []
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('fails open (empty compositeNames, {} kitPatches, [] retired variable keys, defaulted semanticCollectionName) when nothing is configured', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-'))
    try {
      expect(deriveTier0AuditOptions({ cwd })).toEqual({
        componentNames: [],
        compositeNames: [],
        semanticCollectionName: 'Semantic',
        recipe: null,
        kitPatches: {},
        retiredKitVariableKeys: []
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it("reads semanticCollectionName and recipe from the app's design.<app> block in .claude/argo.json", () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-'))
    mkdirSync(join(cwd, '.claude'), { recursive: true })
    writeFileSync(
      join(cwd, '.claude', 'argo.json'),
      JSON.stringify({ design: { '.': { root: '.', recipe: 'shadcn-tailwind', semanticCollectionName: 'Argo Semantic' } } }),
      'utf8'
    )

    try {
      const options = deriveTier0AuditOptions({ cwd })
      expect(options.semanticCollectionName).toBe('Argo Semantic')
      expect(options.recipe).toBe('shadcn-tailwind')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('reads kitPatches and retiredKitVariableKeys from design/kit-patches.json + design/kit.lock, ignoring kit.lock variableKeys entirely', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(join(cwd, 'design', 'kit-patches.json'), JSON.stringify({ Button: ['button.tsx'] }), 'utf8')
    writeFileSync(
      join(cwd, 'design', 'kit.lock'),
      JSON.stringify({ variableKeys: ['abc123'], retiredVariableKeys: ['def456'] }),
      'utf8'
    )

    try {
      const options = deriveTier0AuditOptions({ cwd })
      expect(options.kitPatches).toEqual({ Button: ['button.tsx'] })
      expect(options.retiredKitVariableKeys).toEqual(['def456'])
      expect(options).not.toHaveProperty('kitVariableKeys')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})

describe('parseCliArgs (CLI flag parsing — must not silently no-op on a typo)', () => {
  it('parses --componentNames as a JSON array', () => {
    expect(parseCliArgs(['--componentNames', '["rail-session-card"]'])).toEqual({ componentNames: ['rail-session-card'] })
  })

  it('defaults to an empty array when no flag is given (the intentional file-wide-sweep case)', () => {
    expect(parseCliArgs([])).toEqual({ componentNames: [] })
  })

  it('throws on an unrecognized flag instead of silently defaulting (e.g. the kebab-case typo --component-names)', () => {
    expect(() => parseCliArgs(['--component-names', '["rail-session-card"]'])).toThrow(/unrecognized flag.*--component-names/)
  })
})
