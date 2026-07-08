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
        rawKitExemptNames: [],
        compositeNames: ['rail-session-card', 'status-bar'],
        semanticCollectionName: 'Semantic',
        additionalAllowedCollectionNames: [],
        recipe: null,
        viewport: undefined,
        sweepNodeIds: [],
        sweepPageNames: [],
        screenNodeIds: []
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
        rawKitExemptNames: [],
        compositeNames: [],
        semanticCollectionName: 'Semantic',
        additionalAllowedCollectionNames: [],
        recipe: null,
        viewport: undefined,
        sweepNodeIds: [],
        sweepPageNames: ['Screens'],
        screenNodeIds: []
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
          Buttons: { nodeId: '73:1', kind: 'kit', adopted: true },
          SessionCard: { nodeId: '50:1', kind: 'custom' },
          Screenshot: { nodeId: '90:1', kind: 'code-owned' }
        }
      }),
      'utf8'
    )
    try {
      const options = deriveTier0AuditOptions({ cwd, componentNames: [] })
      // adopted kit + custom included; code-owned excluded.
      expect(options.sweepNodeIds.sort()).toEqual(['50:1', '73:1'])
      expect(options.sweepPageNames).toEqual(['Screens'])
      expect(options.componentNodeIds).toEqual([])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('derives screenNodeIds from kind:"screen" registry entries (both sweep and named audits)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-screen-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(
      join(cwd, 'design', 'registry.json'),
      JSON.stringify({
        components: {
          Buttons: { nodeId: '73:1', kind: 'kit', adopted: true },
          'D02.6 · Chat': { nodeId: '5319:1712', kind: 'screen', status: 'audit-clean' },
          'D02.2 · Planner': { nodeId: '5319:3651', kind: 'screen', status: 'audit-clean' }
        }
      }),
      'utf8'
    )
    try {
      // Screen ids resolve in a sweep...
      expect(deriveTier0AuditOptions({ cwd, componentNames: [] }).screenNodeIds.sort()).toEqual(['5319:1712', '5319:3651'])
      // ...and in a named audit (so a screen audited by nodeId still gets its exemptions).
      expect(deriveTier0AuditOptions({ cwd, componentNames: ['D02.6 · Chat'] }).screenNodeIds.sort()).toEqual(['5319:1712', '5319:3651'])
      // Screens are NOT swept as ordinary components.
      expect(deriveTier0AuditOptions({ cwd, componentNames: [] }).sweepNodeIds).toEqual(['73:1'])
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
    expect(resolveComponentNodeIds(['Card'], registry)).toEqual({ componentNodeIds: ['99:1'], unresolvedNames: [], codeOwnedExemptNames: [], rawKitExemptNames: [] })
  })

  it('leaves an unregistered name for the name-lookup fallback instead of guessing', () => {
    const registry = { components: {} }
    expect(resolveComponentNodeIds(['foundations/sticker-sheet'], registry)).toEqual({
      componentNodeIds: [],
      unresolvedNames: ['foundations/sticker-sheet'],
      codeOwnedExemptNames: [],
      rawKitExemptNames: []
    })
  })

  it('fails open (treats every name as unresolved) when the registry is absent', () => {
    expect(resolveComponentNodeIds(['Card'], undefined)).toEqual({ componentNodeIds: [], unresolvedNames: ['Card'], codeOwnedExemptNames: [], rawKitExemptNames: [] })
  })

  it('exempts a code-owned component from audit targeting (never resolves its nodeId)', () => {
    const registry = { components: { SceneWallpaper: { nodeId: '5091:7366', kind: 'code-owned', codePath: 'src/scene/SceneWallpaper.tsx' }, Card: { nodeId: '99:1', kind: 'custom' } } }
    expect(resolveComponentNodeIds(['SceneWallpaper', 'Card'], registry)).toEqual({
      componentNodeIds: ['99:1'],
      unresolvedNames: [],
      codeOwnedExemptNames: ['SceneWallpaper'],
      rawKitExemptNames: []
    })
  })

  it('exempts an un-adopted (raw) kit component but audits an adopted one', () => {
    const registry = {
      components: {
        Sonner: { nodeId: '77:7', kind: 'kit' },
        Card: { nodeId: '73:1', kind: 'kit', adopted: true },
        SessionCard: { nodeId: '50:1', kind: 'custom' }
      }
    }
    expect(resolveComponentNodeIds(['Sonner', 'Card', 'SessionCard'], registry)).toEqual({
      componentNodeIds: ['73:1', '50:1'],
      unresolvedNames: [],
      codeOwnedExemptNames: [],
      rawKitExemptNames: ['Sonner']
    })
  })
})

describe('deriveTier0AuditOptions gates kit by ADOPTION (directive 3 refined, 2026-07-08)', () => {
  it('audits an ADOPTED kit component and a custom one, but exempts an un-adopted (raw) kit master', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'audit-opts-kit-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(
      join(cwd, 'design', 'registry.json'),
      JSON.stringify({
        components: {
          Card: { nodeId: '73:1', kind: 'kit', adopted: true },
          Sonner: { nodeId: '99:9', kind: 'kit' },
          SessionCard: { nodeId: '50:1', kind: 'custom' }
        }
      })
    )
    try {
      const options = deriveTier0AuditOptions({ cwd, componentNames: ['Card', 'Sonner', 'SessionCard'] })
      // Adopted kit (Card) + custom (SessionCard) are hard targets; raw kit (Sonner) is exempt.
      expect(options.componentNodeIds.sort()).toEqual(['50:1', '73:1'])
      expect(options.rawKitExemptNames).toEqual(['Sonner'])
      expect(options.componentNames).toEqual([])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('keeps both code-owned and un-adopted kit out of the scoped file-wide sweep, but includes adopted kit', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'audit-opts-codeowned-sweep-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(
      join(cwd, 'design', 'registry.json'),
      JSON.stringify({
        components: {
          Card: { nodeId: '73:1', kind: 'kit', adopted: true },
          Sonner: { nodeId: '77:7', kind: 'kit' },
          SceneWallpaper: { nodeId: '5091:7366', kind: 'code-owned', codePath: 'src/scene/SceneWallpaper.tsx' }
        }
      })
    )
    try {
      const options = deriveTier0AuditOptions({ cwd, componentNames: [] })
      // adopted kit (73:1) in; raw kit (77:7) and code-owned (5091:7366) excluded.
      expect(options.sweepNodeIds).toEqual(['73:1'])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})

describe('parseCliArgs (CLI flag parsing — must not silently no-op on a typo)', () => {
  it('parses --componentNames as a JSON array', () => {
    expect(parseCliArgs(['--componentNames', '["rail-session-card"]'])).toMatchObject({ componentNames: ['rail-session-card'] })
  })

  it('defaults to an empty array when no flag is given (the intentional file-wide-sweep case)', () => {
    expect(parseCliArgs([])).toMatchObject({ componentNames: [] })
  })

  it('accepts --component-names (kebab) as an alias for --componentNames instead of throwing', () => {
    expect(parseCliArgs(['--component-names', '["rail-session-card"]'])).toMatchObject({ componentNames: ['rail-session-card'] })
  })

  it('accepts --cwd so a caller need not chdir into apps/web first', () => {
    expect(parseCliArgs(['--cwd', '/repo/apps/web', '--componentNames', '["Card"]'])).toMatchObject({
      cwd: '/repo/apps/web',
      componentNames: ['Card']
    })
  })

  it('surfaces --help without throwing or requiring other flags', () => {
    expect(parseCliArgs(['--help'])).toMatchObject({ help: true })
  })

  it('still throws on a genuinely unrecognized flag (not a known alias)', () => {
    expect(() => parseCliArgs(['--bogus', 'x'])).toThrow(/unrecognized flag.*--bogus/)
  })
})
