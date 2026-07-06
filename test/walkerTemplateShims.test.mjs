import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Post kit-extraction, the walker TEMPLATES must be thin glob-map shims that
 * call the @argohq/kit/walkers factories — never full walker bodies. A full
 * body in a template forks the gate logic from the kit: hosts templated
 * before a kit fix keep the stale walk forever.
 */

const SHIM_TEMPLATES = [
  '../templates/design/spec-diff-walker/spec-diff.walker.spec-diff.js',
  '../templates/design/vrt-walker/vrt.walker.vrt.js',
]

describe.each(SHIM_TEMPLATES)('walker template %s is a thin factory shim', (rel) => {
  const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  it('imports its factory from @argohq/kit/walkers', () => {
    expect(src).toContain("from '@argohq/kit/walkers'")
    expect(src).toMatch(/run(SpecDiff|Vrt)Walker\(/)
  })

  it('carries no walker body and no pre-extraction package imports', () => {
    expect(src).not.toContain('figma-design-kit')
    expect(src).not.toMatch(/\bdescribe\(/)
    expect(src).not.toMatch(/\bit\(/)
    expect(src).not.toMatch(/\bexpect\(/)
  })
})
