import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * DX hardening (council-hardening.md Wave D): `--help`/`-h` must short-circuit
 * before the real (side-effecting) command runs; bare `argo`/`argo design`/
 * `argo graph`/`argo playbook` must print a usage banner and exit non-zero;
 * unrecognized flags on playbook/design verbs must warn (not silently
 * swallow).
 */

const ARGO_BIN = fileURLToPath(new URL('./argo.js', import.meta.url))

function run(args: string[]) {
  return spawnSync(process.execPath, [ARGO_BIN, ...args], { encoding: 'utf8' })
}

describe('argo --help / -h', () => {
  it('argo --help prints usage and exits 0 without running any real command', () => {
    const res = run(['--help'])
    expect(res.status).toBe(0)
    expect(res.stdout).toMatch(/usage: argo/)
  })

  it('argo playbook status --help prints usage and never runs playbookStatus', () => {
    const res = run(['playbook', 'status', '--help'])
    expect(res.status).toBe(0)
    expect(res.stdout).toMatch(/usage: argo playbook/)
    // playbookStatus would print a JSON object (an object literal `{`); the
    // help short-circuit means we never reach that code path.
    expect(res.stdout).not.toMatch(/^\{/)
  })

  it('argo design sync --help delegates to the verb script\'s own help (design is exempt from the generic banner)', () => {
    const res = run(['design', 'sync', '--help'])
    expect(res.status).toBe(0)
    expect(res.stdout).toMatch(/last-synced committed/i)
  })
})

describe('bare-verb usage banners', () => {
  it('bare "argo" prints a usage banner listing valid top-level verbs and exits non-zero', () => {
    const res = run([])
    expect(res.status).not.toBe(0)
    const out = res.stdout + res.stderr
    expect(out).toMatch(/argo-hook/)
    expect(out).toMatch(/playbook/)
  })

  it('"argo design" with no verb prints usage listing known design verbs and exits non-zero', () => {
    const res = run(['design'])
    expect(res.status).not.toBe(0)
    expect(res.stdout + res.stderr).toMatch(/known/)
  })

  it('"argo graph" with no verb prints usage and exits non-zero', () => {
    const res = run(['graph'])
    expect(res.status).not.toBe(0)
    expect(res.stdout + res.stderr).toMatch(/refresh/)
  })

  it('"argo playbook" with no verb prints usage listing known playbook verbs and exits non-zero', () => {
    const res = run(['playbook'])
    expect(res.status).not.toBe(0)
    expect(res.stdout + res.stderr).toMatch(/start/)
  })
})

describe('unrecognized flags warn instead of silently swallowing', () => {
  it('warns on a misspelled playbook flag', () => {
    const res = run(['playbook', 'status', '--taget', 'foo'])
    expect(res.stderr).toMatch(/unrecognized flag "--taget"/)
  })

  it('warns on a misspelled design flag', () => {
    const res = run(['design', 'record-spec-diff-receipt', '--boguss'])
    expect(res.stderr).toMatch(/unrecognized flag "--boguss"/)
  })
})
