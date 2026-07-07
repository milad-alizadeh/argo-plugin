import { describe, it, expect } from 'vitest'
import {
  nonSemanticBindingViolation,
  retiredFileKeyBindingViolation,
  kitPatchesConformanceViolations
} from './tier0-rules.js'

describe('nonSemanticBindingViolation', () => {
  it('passes any remote/library-sourced binding, no manifest required', () => {
    const variable = { remote: true, key: 'some-other-librarys-key', collectionName: 'Kit Colors' }
    expect(nonSemanticBindingViolation(variable, 'Semantic')).toBeNull()
  })

  it('passes a variable actually bound to the Semantic collection', () => {
    const variable = { remote: false, key: 'local:1:2', collectionName: 'Semantic' }
    expect(nonSemanticBindingViolation(variable, 'Semantic')).toBeNull()
  })

  it('flags a LOCAL variable bound to a local Primitives collection — not the Semantic collection, not remote (confirmed live: Slice 14)', () => {
    const variable = { remote: false, key: 'local:1:2', collectionName: 'Primitives' }
    expect(nonSemanticBindingViolation(variable, 'Semantic')).toEqual({
      rule: 'non-semantic-binding',
      detail: 'bound to a non-Semantic variable outside the kit library'
    })
  })

  it('flags a local variable with no resolvable collection name', () => {
    const variable = { remote: false, key: 'local:1:2', collectionName: null }
    expect(nonSemanticBindingViolation(variable, 'Semantic')).toEqual({
      rule: 'non-semantic-binding',
      detail: 'bound to a non-Semantic variable outside the kit library'
    })
  })

  it('uses the project-configured Semantic collection name for both the comparison and the message', () => {
    const variable = { remote: false, key: 'local:1:2', collectionName: 'Theme' }
    expect(nonSemanticBindingViolation(variable, 'Theme')).toBeNull()

    const primitiveVariable = { remote: false, key: 'local:1:2', collectionName: 'Primitives' }
    expect(nonSemanticBindingViolation(primitiveVariable, 'Theme')).toEqual({
      rule: 'non-semantic-binding',
      detail: 'bound to a non-Theme variable outside the kit library'
    })
  })
})

describe('retiredFileKeyBindingViolation', () => {
  // Real variable keys are plain hashes with no file-key prefix (2026-07-05):
  // retirement matches by exact variable key recorded at Library Swap time.
  it('flags a variable whose exact key is in the retired variable key list', () => {
    const variable = { remote: true, key: 'old-kit-variable-key-hash' }
    expect(retiredFileKeyBindingViolation(variable, ['old-kit-variable-key-hash'])).toEqual({
      rule: 'retired-file-key-binding',
      detail: 'bound variable "old-kit-variable-key-hash" belongs to a retired kit library version'
    })
  })

  it('passes a variable bound to the current kit key', () => {
    const variable = { remote: true, key: 'current-kit-variable-key-hash' }
    expect(retiredFileKeyBindingViolation(variable, ['old-kit-variable-key-hash'])).toBeNull()
  })

  it('passes when there are no retired keys', () => {
    const variable = { remote: true, key: 'current-kit-key:1:2' }
    expect(retiredFileKeyBindingViolation(variable, [])).toBeNull()
  })
})

describe('kitPatchesConformanceViolations', () => {
  it('flags a modified kit-copy node not recorded in kit-patches.json', () => {
    const modifiedNodes = [{ component: 'Button', file: 'button.tsx' }]
    expect(kitPatchesConformanceViolations(modifiedNodes, {})).toEqual([
      { rule: 'kit-patches-conformance', detail: 'edit to kit copy "Button"/"button.tsx" is not recorded in kit-patches.json' }
    ])
  })

  it('passes a modified node recorded in kit-patches.json', () => {
    const modifiedNodes = [{ component: 'Button', file: 'button.tsx' }]
    const kitPatches = { Button: ['button.tsx'] }
    expect(kitPatchesConformanceViolations(modifiedNodes, kitPatches)).toEqual([])
  })

  it('passes when there are no modified nodes', () => {
    expect(kitPatchesConformanceViolations([], {})).toEqual([])
  })
})
