import { describe, it, expect } from 'vitest'
import { upsertScreenEntry } from './register-screen.js'

describe('upsertScreenEntry', () => {
  it('adds a new kind:"screen" entry defaulting status to audit-clean', () => {
    const out = upsertScreenEntry({ components: {} }, { nodeId: '5319:1712', name: 'D02.6 Chat' })
    expect(out.components['D02.6 Chat']).toEqual({ nodeId: '5319:1712', kind: 'screen', status: 'audit-clean' })
  })

  it('honors an explicit --status', () => {
    const out = upsertScreenEntry({ components: {} }, { nodeId: '5319:1712', name: 'Chat', status: 'draft' })
    expect(out.components.Chat.status).toBe('draft')
  })

  it('is idempotent and preserves human extras (notes) on an existing entry', () => {
    const registry = { components: { Chat: { nodeId: '5319:1712', kind: 'screen', status: 'audit-clean', notes: 'keep me' } } }
    const out = upsertScreenEntry(registry, { nodeId: '5319:1712', name: 'Chat' })
    expect(out.components.Chat).toEqual({ nodeId: '5319:1712', kind: 'screen', status: 'audit-clean', notes: 'keep me' })
  })

  it('updates the nodeId while keeping the prior status when re-registering', () => {
    const registry = { components: { Chat: { nodeId: 'old', kind: 'screen', status: 'out-of-sync' } } }
    const out = upsertScreenEntry(registry, { nodeId: 'new', name: 'Chat' })
    expect(out.components.Chat).toEqual({ nodeId: 'new', kind: 'screen', status: 'out-of-sync' })
  })

  it('does not clobber unrelated entries or the registry header', () => {
    const registry = { header: { x: 1 }, components: { Button: { nodeId: '1:1', kind: 'kit' } } }
    const out = upsertScreenEntry(registry, { nodeId: '5:5', name: 'Chat' })
    expect(out.header).toEqual({ x: 1 })
    expect(out.components.Button).toEqual({ nodeId: '1:1', kind: 'kit' })
    expect(out.components.Chat.kind).toBe('screen')
  })

  it('tolerates a registry with no components key', () => {
    const out = upsertScreenEntry({}, { nodeId: '5:5', name: 'Chat' })
    expect(out.components.Chat).toEqual({ nodeId: '5:5', kind: 'screen', status: 'audit-clean' })
  })
})
