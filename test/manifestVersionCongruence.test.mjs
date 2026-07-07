import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

// Release-time self-check (defect class killed 2026-07-07): `argo doctor`
// enforces that a host project's installed @argohq/kit major.minor equals the
// plugin manifest's `designLibrary`. But NOTHING enforced that the plugin repo's
// OWN manifest tracks its OWN kit — so a kit minor bump (0.3.0 → 0.4.0 → 0.5.0)
// shipped twice with `designLibrary` left behind at 0.3, meaning every freshly
// updated host would fail `argo doctor` until the next accidental fix. This test
// makes that mismatch a red suite, so a forgotten designLibrary bump can never
// be tagged/released. No pre-push hook (no-prepush-hooks ruling) — `bun run
// test` is the release gate.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function majorMinor(version) {
  const m = /^(\d+)\.(\d+)/.exec(String(version ?? ''))
  return m ? `${m[1]}.${m[2]}` : null
}

describe('manifest version congruence', () => {
  it('plugin.json designLibrary equals @argohq/kit major.minor', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, '.claude-plugin', 'plugin.json'), 'utf8'))
    const kitPkg = JSON.parse(readFileSync(join(repoRoot, 'packages', 'kit', 'package.json'), 'utf8'))

    const declared = majorMinor(manifest.designLibrary)
    const kit = majorMinor(kitPkg.version)

    expect(declared, 'plugin.json must declare a designLibrary major.minor').not.toBeNull()
    expect(kit, 'packages/kit must declare a version').not.toBeNull()
    expect(
      declared,
      `designLibrary "${manifest.designLibrary}" must track @argohq/kit "${kitPkg.version}" (major.minor). ` +
        `Bump designLibrary to "${kit}" whenever the kit minor moves — this is what argo doctor checks in host projects.`
    ).toBe(kit)
  })
})
