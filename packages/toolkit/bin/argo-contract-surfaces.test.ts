import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * End-to-end coverage for the host-app contract surfaces (argo-v2 PRD
 * `playbooks-and-runs.md` RUNS-R24 / RUNS-R27): `argo playbook list --json`
 * and `argo design sync --check --json`. Spawns the real `bin/argo.js`
 * (dist-dispatching), so `bun run build` in packages/toolkit must precede it —
 * same convention as `argo-playbook.test.ts`.
 */
const ARGO_BIN = fileURLToPath(new URL('./argo.js', import.meta.url))

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'argo-contract-cli-'))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

describe('argo playbook list --json', () => {
  it('emits the full registered catalog with pack, version, stage gates, and input contract', () => {
    const result = spawnSync(process.execPath, [ARGO_BIN, 'playbook', 'list', '--json'], { encoding: 'utf8' })
    expect(result.status).toBe(0)
    const catalog = JSON.parse(result.stdout)
    expect(catalog.map((e: { name: string }) => e.name)).toEqual(
      expect.arrayContaining(['screen-create', 'design-to-code', 'code-to-design'])
    )
    const screenCreate = catalog.find((e: { name: string }) => e.name === 'screen-create')
    expect(screenCreate.pack).toBe('design')
    expect(screenCreate.displayName).toBe('Create screen')
    expect(screenCreate.versionSource).toBe('toolkit-package')
    expect(typeof screenCreate.version).toBe('string')
    expect(screenCreate.input.target.required).toBe(true)
    for (const stage of screenCreate.stages) {
      expect(stage).toHaveProperty('gate')
      expect(Array.isArray(stage.allows)).toBe(true)
    }
  })
})

describe('argo design sync --check --json', () => {
  it('refuses without --check and states the artifact-only limitation in --help', () => {
    const bare = spawnSync(process.execPath, [ARGO_BIN, 'design', 'sync'], { encoding: 'utf8', cwd })
    expect(bare.status).toBe(1)

    const help = spawnSync(process.execPath, [ARGO_BIN, 'design', 'sync', '--help'], { encoding: 'utf8', cwd })
    expect(help.status).toBe(0)
    expect(help.stdout).toMatch(/last-synced committed/i)
    expect(help.stdout).toMatch(/NOT visible/)
  })

  it('reports dirty with findings on a project whose adopted entry lost its spec', () => {
    mkdirSync(join(cwd, 'design', 'specs'), { recursive: true })
    writeFileSync(
      join(cwd, 'design', 'registry.json'),
      JSON.stringify({
        components: {
          Card: {
            nodeId: '1:1',
            kind: 'custom',
            status: 'audit-clean',
            lastSyncedAt: '2026-07-01T00:00:00.000Z',
            variantMatrix: {}
          }
        }
      })
    )
    writeFileSync(join(cwd, 'design', 'spec-diff-receipt.json'), JSON.stringify({ recordedAt: 1, exitCode: 0 }))

    const result = spawnSync(process.execPath, [ARGO_BIN, 'design', 'sync', '--check', '--json'], {
      encoding: 'utf8',
      cwd
    })
    expect(result.status).toBe(1)
    const report = JSON.parse(result.stdout)
    expect(report.status).toBe('dirty')
    expect(report.findings).toEqual([expect.objectContaining({ rule: 'missing-spec', component: 'Card' })])
  })

  it('reports clean (exit 0) when the committed artifacts are consistent', () => {
    mkdirSync(join(cwd, 'design', 'specs'), { recursive: true })
    writeFileSync(
      join(cwd, 'design', 'registry.json'),
      JSON.stringify({
        components: {
          Card: {
            nodeId: '1:1',
            kind: 'custom',
            status: 'audit-clean',
            lastSyncedAt: '2026-07-01T00:00:00.000Z',
            variantMatrix: {}
          }
        }
      })
    )
    writeFileSync(join(cwd, 'design', 'specs', 'Card.json'), JSON.stringify({ variants: {} }))
    writeFileSync(join(cwd, 'design', 'spec-diff-receipt.json'), JSON.stringify({ recordedAt: 1, exitCode: 0 }))

    const result = spawnSync(process.execPath, [ARGO_BIN, 'design', 'sync', '--check', '--json'], {
      encoding: 'utf8',
      cwd
    })
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).status).toBe('clean')
  })
})
