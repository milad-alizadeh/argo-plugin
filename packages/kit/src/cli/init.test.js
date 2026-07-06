import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInit } from './init.js'

/**
 * Deterministic half of /argo:init (plan step 14, amended): dep placement is
 * the dev-phase link protocol ("link:@argohq/kit"), settings.json gets
 * enabledPlugins (+ extraKnownMarketplaces when a source is supplied), and
 * .claude/argo.json is seeded per mode with INERT design keys (no
 * componentsPath — gates must not arm until setup-design fills them).
 */

let host

beforeEach(() => {
  host = mkdtempSync(join(tmpdir(), 'argo-init-'))
})
afterEach(() => rmSync(host, { recursive: true, force: true }))

const readJson = (...p) => JSON.parse(readFileSync(join(host, ...p), 'utf8'))

describe('runInit — monorepo mode', () => {
  beforeEach(() => {
    writeFileSync(
      join(host, 'package.json'),
      JSON.stringify({ name: 'host', private: true, workspaces: ['apps/*'] }),
    )
    mkdirSync(join(host, 'apps', 'a'), { recursive: true })
    mkdirSync(join(host, 'apps', 'b'), { recursive: true })
    writeFileSync(join(host, 'apps', 'a', 'package.json'), JSON.stringify({ name: 'a' }))
    writeFileSync(join(host, 'apps', 'b', 'package.json'), JSON.stringify({ name: 'b' }))
  })

  it('places the link: dep at the WORKSPACE ROOT package.json', () => {
    const report = runInit({ hostRoot: host })
    expect(report.mode).toBe('monorepo')
    expect(readJson('package.json').dependencies['@argohq/kit']).toBe('link:@argohq/kit')
    expect(readJson('apps/a/package.json').dependencies).toBeUndefined()
  })

  it('seeds .claude/argo.json with one INERT design key per workspace app', () => {
    runInit({ hostRoot: host })
    const argoJson = readJson('.claude', 'argo.json')
    expect(Object.keys(argoJson.design).sort()).toEqual(['apps/a', 'apps/b'])
    // inert: no componentsPath until setup-design fills it — gates must not arm
    expect(argoJson.design['apps/a'].componentsPath).toBeUndefined()
  })

  it('writes enabledPlugins into .claude/settings.json, preserving existing settings', () => {
    mkdirSync(join(host, '.claude'), { recursive: true })
    writeFileSync(join(host, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] } }))
    runInit({ hostRoot: host })
    const settings = readJson('.claude', 'settings.json')
    expect(settings.enabledPlugins['argo@argo']).toBe(true)
    expect(settings.permissions.allow).toEqual(['Bash(ls:*)'])
  })

  it('records extraKnownMarketplaces only when a marketplace source is supplied', () => {
    runInit({ hostRoot: host, marketplaceSource: { source: 'github', repo: 'example/argo-plugin' } })
    const settings = readJson('.claude', 'settings.json')
    expect(settings.extraKnownMarketplaces.argo.source).toEqual({ source: 'github', repo: 'example/argo-plugin' })

    rmSync(join(host, '.claude', 'settings.json'))
    runInit({ hostRoot: host })
    expect(readJson('.claude', 'settings.json').extraKnownMarketplaces).toBeUndefined()
  })
})

describe('runInit — single-repo mode', () => {
  beforeEach(() => {
    writeFileSync(join(host, 'package.json'), JSON.stringify({ name: 'solo', dependencies: { react: '^19.0.0' } }))
  })

  it('places the link: dep in the single package.json, preserving existing deps', () => {
    const report = runInit({ hostRoot: host })
    expect(report.mode).toBe('single-repo')
    const pkg = readJson('package.json')
    expect(pkg.dependencies['@argohq/kit']).toBe('link:@argohq/kit')
    expect(pkg.dependencies.react).toBe('^19.0.0')
  })

  it('seeds .claude/argo.json with a single inert "." design key', () => {
    runInit({ hostRoot: host })
    expect(Object.keys(readJson('.claude', 'argo.json').design)).toEqual(['.'])
  })

  it('is idempotent and preserves user-set argo.json fields on re-run', () => {
    runInit({ hostRoot: host })
    const argoPath = join(host, '.claude', 'argo.json')
    const edited = JSON.parse(readFileSync(argoPath, 'utf8'))
    edited.landing = 'merge'
    edited.design['.'] = { root: '.', componentsPath: 'src/components' }
    writeFileSync(argoPath, JSON.stringify(edited))

    const report = runInit({ hostRoot: host })
    const after = JSON.parse(readFileSync(argoPath, 'utf8'))
    expect(after.landing).toBe('merge')
    expect(after.design['.'].componentsPath).toBe('src/components')
    expect(readJson('package.json').dependencies['@argohq/kit']).toBe('link:@argohq/kit')
    expect(report.depAlreadyPresent).toBe(true)
  })
})
