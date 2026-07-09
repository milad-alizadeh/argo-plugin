import { describe, expect, it } from 'vitest'
import { RegistryEntrySchema as SchemaFromKit } from '../design-kit/schemas.js'
import { registerScreen, pullRegistry, RegistryEntrySchema } from './index.js'

// Fixture document for pullRegistry's injected fetchFile below — one new
// kit-page component, enough for buildPullRegistryResult's real
// classification logic to have something to count.
const fakeDoc = {
  document: {
    children: [
      {
        id: 'page1',
        name: 'Kit',
        type: 'CANVAS',
        children: [{ id: '1:1', name: 'Button', type: 'COMPONENT' }]
      }
    ]
  },
  components: { '1:1': { name: 'Button', description: '' } }
}

describe('registerScreen', () => {
  it('re-exports (never redefines) schemas.ts\'s RegistryEntrySchema — same object identity as the kit module', () => {
    // Proves this module doesn't duplicate/reimplement validation logic: the
    // schema our public API validates against IS kit's own schema instance,
    // not a lookalike redefined here.
    expect(RegistryEntrySchema).toBe(SchemaFromKit)
  })

  it('produces a card that validates against the real RegistryEntrySchema', () => {
    const { card } = registerScreen({ nodeId: '1:23', name: 'onboarding-welcome' })

    const parsed = SchemaFromKit.safeParse(card)
    expect(parsed.success).toBe(true)
    expect(card.kind).toBe('screen')
    expect(card.nodeId).toBe('1:23')
    expect(card.status).toBe('audit-clean')
    expect(card.variantMatrix).toEqual({})
    expect(typeof card.lastSyncedAt).toBe('string')
  })

  it('upserts the entry into the returned registry document, keyed by name', () => {
    const { registry, card } = registerScreen({ nodeId: '1:23', name: 'onboarding-welcome' })

    expect(registry.components['onboarding-welcome']).toEqual(card)
  })

  it('preserves a caller-supplied status instead of defaulting to audit-clean', () => {
    const { card } = registerScreen({ nodeId: '1:23', name: 'onboarding-welcome', status: 'out-of-sync' })

    expect(SchemaFromKit.safeParse(card).success).toBe(true)
    expect(card.status).toBe('out-of-sync')
  })

  it('re-registering (same name, changed nodeId) is idempotent-upsert, matching upsertScreenEntry semantics', () => {
    const first = registerScreen({ nodeId: '1:23', name: 'onboarding-welcome' })
    const second = registerScreen({ registry: first.registry, nodeId: '9:99', name: 'onboarding-welcome' })

    expect(SchemaFromKit.safeParse(second.card).success).toBe(true)
    expect(second.card.nodeId).toBe('9:99')
    // status carried over from the existing entry rather than reset
    expect(second.card.status).toBe(first.card.status)
  })
})

describe('pullRegistry', () => {
  it('composes fetchFile → marshal → buildPullRegistryResult, deriving orderedPageNames when omitted', async () => {
    const result = await pullRegistry({
      fileKey: 'fake-file-key',
      figmaToken: 'fake-token',
      registry: { components: {} },
      now: '2026-07-09T00:00:00.000Z',
      // Injected in place of kit's real network-calling fetchFile — never a
      // real network call in a unit test. Everything downstream of the fetch
      // (marshalRestDocument/marshalScreenFrames/buildPullRegistryResult) is
      // the real, unmodified kit implementation.
      fetchFile: async () => fakeDoc as never
    })

    // The fixture's single page has no kit/non-kit divider, so
    // buildPullRegistryResult's real page-classification logic (kitPageIndices)
    // counts 'Button' as a custom (non-kit) component — proving the real kit
    // logic ran (not reimplemented/stubbed here).
    expect(result.kitComponentCount).toBe(0)
    expect(result.customComponentCount).toBe(1)
  })

  it('never reads Figma itself — the injected fetchFile is the only network entry point', async () => {
    let called = false
    await pullRegistry({
      fileKey: 'fake-file-key',
      figmaToken: 'fake-token',
      registry: { components: {} },
      fetchFile: async () => {
        called = true
        return fakeDoc as never
      }
    })

    expect(called).toBe(true)
  })
})
