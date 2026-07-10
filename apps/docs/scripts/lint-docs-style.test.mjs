import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, afterEach } from 'vitest'

const SCRIPT = fileURLToPath(new URL('./lint-docs-style.mjs', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

function runLintAgainst(contentDir) {
  try {
    const stdout = execFileSync('node', [SCRIPT, '--content-dir', contentDir, '--repo-root', REPO_ROOT], {
      encoding: 'utf8'
    })
    return { status: 0, stdout }
  } catch (err) {
    return { status: err.status, stdout: err.stdout, stderr: err.stderr }
  }
}

describe('lint-docs-style', () => {
  let tmpDir
  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  })

  it('flags a fixture file containing a forbidden phrase', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'docs-style-'))
    mkdirSync(join(tmpDir, 'docs'), { recursive: true })
    writeFileSync(join(tmpDir, 'docs', 'bad.md'), '# Bad\n\nLet me delve into the details.\n')
    const result = runLintAgainst(join(tmpDir, 'docs'))
    expect(result.status).not.toBe(0)
  })
})
