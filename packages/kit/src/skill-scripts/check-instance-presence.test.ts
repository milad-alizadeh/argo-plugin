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

  it('reads registry.json and reports a MISSING declared component as not clean', () => {
    withRegistry({ 'rail-session-card': { nodeId: '1:1' }, topbar: { nodeId: '1:2' } }, (cwd) => {
      const { summary } = checkInstancePresence({
        cwd,
        annotationText: '```argo-screen\ntopbar\n```',
        built: []
      })
      expect(summary.clean).toBe(false)
      expect(summary.MISSING).toEqual(['topbar'])
    })
  })

  it('is clean when the declared instance is present and built', () => {
    withRegistry({ topbar: { nodeId: '1:2' } }, (cwd) => {
      const { summary } = checkInstancePresence({
        cwd,
        annotationText: '```argo-screen\ntopbar\n```',
        built: [{ name: 'topbar', type: 'INSTANCE', componentName: 'topbar', childCount: 3 }]
      })
      expect(summary.clean).toBe(true)
      expect(summary.present).toEqual(['topbar'])
    })
  })

  it('is clean (nothing to check) when the frame has no manifest block', () => {
    withRegistry({ topbar: { nodeId: '1:2' } }, (cwd) => {
      const { manifest, summary } = checkInstancePresence({ cwd, annotationText: 'just prose', built: [] })
      expect(manifest).toEqual([])
      expect(summary.clean).toBe(true)
    })
  })
})
