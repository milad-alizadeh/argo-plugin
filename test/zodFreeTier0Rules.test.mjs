import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Council-mandated hard gate: the tier0-rules subpaths run inside the Figma
 * sandbox bundle, where zod (or any dependency) must never be pulled in. Bundle
 * each subpath and assert the output never mentions zod — an import would
 * appear literally whether inlined or left as a bare specifier.
 */

const KIT_ROOT = fileURLToPath(new URL('../packages/kit', import.meta.url))
const SANDBOX_SUBPATHS = ['./design-kit/tier0-rules', './design-kit/shadcn-tailwind/tier0-rules']

describe('zod-free tier0-rules subpaths', () => {
  const pkg = JSON.parse(readFileSync(join(KIT_ROOT, 'package.json'), 'utf8'))

  it('exports both sandbox subpaths', () => {
    for (const subpath of SANDBOX_SUBPATHS) {
      expect(pkg.exports?.[subpath], `missing exports["${subpath}"]`).toBeTruthy()
    }
  })

  it.each(SANDBOX_SUBPATHS)('bundling %s pulls in no zod', (subpath) => {
    const entry = resolve(KIT_ROOT, pkg.exports[subpath])
    expect(existsSync(entry), `${entry} does not exist`).toBe(true)
    const outDir = mkdtempSync(join(tmpdir(), 'argo-zodfree-'))
    try {
      const outFile = join(outDir, 'bundle.js')
      execFileSync('bun', ['build', '--bundle', '--format=esm', entry, '--outfile', outFile], {
        encoding: 'utf8',
      })
      const bundled = readFileSync(outFile, 'utf8')
      expect(bundled).not.toContain('zod')
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
