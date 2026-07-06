import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runDoctor } from './doctor.js'

/**
 * Decision 11: single-version lockstep, bidirectional. The plugin's
 * plugin.json declares `designLibrary: "<major.minor>"`; the installed kit's
 * own version's major.minor must EQUAL it exactly (never a range check), and
 * a mismatch in either direction fails loud naming that direction's exact
 * fix command.
 */

let pluginRoot

function writePluginManifest(designLibrary) {
  mkdirSync(join(pluginRoot, '.claude-plugin'), { recursive: true })
  writeFileSync(
    join(pluginRoot, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'argo', version: '0.19.0', designLibrary }),
  )
}

beforeEach(() => {
  pluginRoot = mkdtempSync(join(tmpdir(), 'argo-doctor-'))
})
afterEach(() => rmSync(pluginRoot, { recursive: true, force: true }))

describe('runDoctor — bidirectional lockstep check', () => {
  it('passes when installed kit major.minor equals the declared designLibrary', () => {
    writePluginManifest('0.1')
    expect(runDoctor({ pluginRoot, kitVersion: '0.1.0' })).toEqual({ ok: true, declared: '0.1', installed: '0.1' })
  })

  it('fails loud when the kit is BEHIND, naming bun update as the fix', () => {
    writePluginManifest('0.2')
    const result = runDoctor({ pluginRoot, kitVersion: '0.1.5' })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/bun update @argohq\/kit/)
  })

  it('fails loud when the kit is AHEAD of what the plugin declares, naming plugin update as the fix', () => {
    writePluginManifest('0.1')
    const result = runDoctor({ pluginRoot, kitVersion: '0.2.0' })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/claude plugin update argo@argo/)
  })

  it('fails loud (not silently ok) when the plugin manifest is missing or undeclared', () => {
    expect(runDoctor({ pluginRoot, kitVersion: '0.1.0' }).ok).toBe(false)
    writeFileSync(join(pluginRoot, 'plugin.json'), '{}') // wrong location — still missing
    expect(runDoctor({ pluginRoot, kitVersion: '0.1.0' }).ok).toBe(false)
  })
})
