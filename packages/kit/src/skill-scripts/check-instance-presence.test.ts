import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkInstancePresence } from './check-instance-presence.js'

describe('checkInstancePresence (P4a Node wrapper)', () => {
  function withRegistry(components: Record<string, unknown>, fn: (cwd: string) => void) {
    const cwd = mkdtempSync(join(tmpdir(), 'p4a-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(join(cwd, 'design', 'registry.json'), JSON.stringify({ components }), 'utf8')
    try {
      fn(cwd)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  }

  it('reports an instance with no registry match as unresolved and not clean', () => {
    withRegistry({ topbar: { nodeId: '1:2' } }, (cwd) => {
      const { summary } = checkInstancePresence({
        cwd,
        built: [{ nodeId: '9:9', name: 'rail-session-card', type: 'INSTANCE' }]
      })
      expect(summary.clean).toBe(false)
      expect(summary.unresolved).toEqual(['rail-session-card'])
    })
  })

  it('is clean when every built instance resolves by nodeId', () => {
    withRegistry({ topbar: { nodeId: '1:2' } }, (cwd) => {
      const { summary } = checkInstancePresence({
        cwd,
        built: [{ nodeId: '1:2', name: 'topbar', type: 'INSTANCE' }]
      })
      expect(summary.clean).toBe(true)
      expect(summary.resolved).toEqual(['topbar'])
    })
  })

  it('is clean (nothing to check) when the built inventory is empty', () => {
    withRegistry({ topbar: { nodeId: '1:2' } }, (cwd) => {
      const { results, summary } = checkInstancePresence({ cwd, built: [] })
      expect(results).toEqual([])
      expect(summary.clean).toBe(true)
    })
  })
})
