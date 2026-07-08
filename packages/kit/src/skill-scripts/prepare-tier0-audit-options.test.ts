import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deriveTier0AuditOptions, parseCliArgs, resolveComponentNodeIds } from './prepare-tier0-audit-options.js'

describe('deriveTier0AuditOptions (figma-audit Node wrapper — anti-recreation gate wiring)', () => {
  it('reads design/registry.json, resolves a requested name to its nodeId, and passes all entries as compositeNames', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(
      join(cwd, 'design', 'registry.json'),
      JSON.stringify({ components: { 'rail-session-card': { nodeId: '126:35' }, 'status-bar': { nodeId: '126:227' } } }),
      'utf8'
    )

    try {
      expect(deriveTier0AuditOptions({ cwd, componentNames: ['rail-session-card'] })).toEqual({
        componentNodeIds: ['126:35'],
        componentNames: [],
        codeOwnedExemptNames: [],
        compositeNames: ['rail-session-card', 'status-bar'],
        semanticCollectionName: 'Semantic',
        additionalAllowedCollectionNames: [],
        recipe: null,
        viewport: undefined,
        sweepNodeIds: [],
        sweepPageNames: []
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('falls back to name-only for a target with no registry entry (e.g. an unregistered foundation frame)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(join(cwd, 'design', 'registry.json'), JSON.stringify({ components: {} }), 'utf8')

    try {
      const options = deriveTier0AuditOptions({ cwd, componentNames: ['foundations/sticker-sheet'] })
      expect(options.componentNodeIds).toEqual([])
      expect(options.componentNames).toEqual(['foundations/sticker-sheet'])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('fails open (empty compositeNames, defaulted semanticCollectionName) when nothing is configured', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-'))
    try {
      expect(deriveTier0AuditOptions({ cwd })).toEqual({
        componentNodeIds: [],
        componentNames: [],
        codeOwnedExemptNames: [],
        compositeNames: [],
        semanticCollectionName: 'Semantic',
        additionalAllowedCollectionNames: [],
        recipe: null,
        viewport: undefined,
        sweepNodeIds: [],
        sweepPageNames: ['Screens']
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it("reads semanticCollectionName and recipe from the app's design.<app> block in .claude/argo.json, and threads the recipe's collection allowlist", () => {
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
      expect(options.additionalAllowedCollectionNames).toContain('tw/gap')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it("reads viewport from the app's design.<app> block when configured", () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-'))
    mkdirSync(join(cwd, '.claude'), { recursive: true })
    writeFileSync(
      join(cwd, '.claude', 'argo.json'),
      JSON.stringify({ design: { '.': { root: '.', viewport: { width: 1440, height: 900 } } } }),
      'utf8'
    )
    try {
      const options = deriveTier0AuditOptions({ cwd })
      expect(options.viewport).toEqual({ width: 1440, height: 900 })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('never reads or emits kit-subscription data (kit.lock / kit-patches.json are dead files)', () => {
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
      expect(options).not.toHaveProperty('kitPatches')
      expect(options).not.toHaveProperty('retiredKitVariableKeys')
      expect(options).not.toHaveProperty('kitVariableKeys')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('a sweep (empty componentNames) scopes to every registry nodeId plus the default Screens page, never a named audit', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-sweep-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(
      join(cwd, 'design', 'registry.json'),
      JSON.stringify({
        components: {
          Buttons: { nodeId: '73:1', kind: 'kit' },
          SessionCard: { nodeId: '50:1', kind: 'custom' },
          Screenshot: { nodeId: '90:1', kind: 'code-owned' }
        }
      }),
      'utf8'
    )
    try {
      const options = deriveTier0AuditOptions({ cwd, componentNames: [] })
      expect(options.sweepNodeIds.sort()).toEqual(['50:1', '73:1'])
      expect(options.sweepPageNames).toEqual(['Screens'])
      expect(options.componentNodeIds).toEqual([])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('a named audit (non-empty componentNames) never populates sweepNodeIds/sweepPageNames', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-sweep-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(join(cwd, 'design', 'registry.json'), JSON.stringify({ components: { Card: { nodeId: '99:1' } } }), 'utf8')
    try {
      const options = deriveTier0AuditOptions({ cwd, componentNames: ['Card'] })
      expect(options.sweepNodeIds).toEqual([])
      expect(options.sweepPageNames).toEqual([])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it("honors a configured design.<app>.sweepPageNames instead of the ['Screens'] default", () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-sweep-'))
    mkdirSync(join(cwd, '.claude'), { recursive: true })
    writeFileSync(
      join(cwd, '.claude', 'argo.json'),
      JSON.stringify({ design: { '.': { root: '.', sweepPageNames: ['Marketing Screens'] } } }),
      'utf8'
    )
    try {
      const options = deriveTier0AuditOptions({ cwd, componentNames: [] })
      expect(options.sweepPageNames).toEqual(['Marketing Screens'])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})

describe('resolveComponentNodeIds (authoritative audit targeting, field bug fix)', () => {
  it('resolves a registered name to its nodeId', () => {
    const registry = { components: { Card: { nodeId: '99:1' } } }
    expect(resolveComponentNodeIds(['Card'], registry)).toEqual({ componentNodeIds: ['99:1'], unresolvedNames: [], codeOwnedExemptNames: [] })
  })

  it('leaves an unregistered name for the name-lookup fallback instead of guessing', () => {
    const registry = { components: {} }
    expect(resolveComponentNodeIds(['foundations/sticker-sheet'], registry)).toEqual({
      componentNodeIds: [],
      unresolvedNames: ['foundations/sticker-sheet'],
      codeOwnedExemptNames: []
    })
  })

  it('fails open (treats every name as unresolved) when the registry is absent', () => {
    expect(resolveComponentNodeIds(['Card'], undefined)).toEqual({ componentNodeIds: [], unresolvedNames: ['Card'], codeOwnedExemptNames: [] })
  })

  it('exempts a code-owned component from audit targeting (never resolves its nodeId)', () => {
    const registry = { components: { SceneWallpaper: { nodeId: '5091:7366', kind: 'code-owned', codePath: 'src/scene/SceneWallpaper.tsx' }, Card: { nodeId: '99:1', kind: 'custom' } } }
    expect(resolveComponentNodeIds(['SceneWallpaper', 'Card'], registry)).toEqual({
      componentNodeIds: ['99:1'],
      unresolvedNames: [],
      codeOwnedExemptNames: ['SceneWallpaper']
    })
  })
})

describe('deriveTier0AuditOptions audits kit components too (directive 3, no blanket exemption)', () => {
  it('resolves both kit and custom named components to their nodeIds', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'audit-opts-kit-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(
      join(cwd, 'design', 'registry.json'),
      JSON.stringify({
        components: {
          Buttons: { nodeId: '73:1', kind: 'kit' },
          SessionCard: { nodeId: '50:1', kind: 'custom' }
        }
      })
    )
    try {
      const options = deriveTier0AuditOptions({ cwd, componentNames: ['Buttons', 'SessionCard'] })
      // Both audited: kit is editable, gated by SCOPE (only changed components are ever passed), not exemption.
      expect(options.componentNodeIds.sort()).toEqual(['50:1', '73:1'])
      expect(options.componentNames).toEqual([])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('keeps code-owned components out of the scoped file-wide sweep', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'audit-opts-codeowned-sweep-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(
      join(cwd, 'design', 'registry.json'),
      JSON.stringify({
        components: {
          Buttons: { nodeId: '73:1', kind: 'kit' },
          SceneWallpaper: { nodeId: '5091:7366', kind: 'code-owned', codePath: 'src/scene/SceneWallpaper.tsx' }
        }
      })
    )
    try {
      const options = deriveTier0AuditOptions({ cwd, componentNames: [] })
      expect(options.sweepNodeIds).toEqual(['73:1']) // SceneWallpaper's nodeId excluded
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
