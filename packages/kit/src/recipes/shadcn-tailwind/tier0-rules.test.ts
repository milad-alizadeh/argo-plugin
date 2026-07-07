import { describe, it, expect } from 'vitest'
import { nonSemanticBindingViolation } from './tier0-rules.js'

describe('nonSemanticBindingViolation (starter-file model: local Semantic bindings only)', () => {
  it('passes a local variable bound to the Semantic collection', () => {
    const variable = { remote: false, key: 'local:1:2', collectionName: 'Semantic' }
    expect(nonSemanticBindingViolation(variable, 'Semantic')).toBeNull()
  })

  it('passes a component-scoped token that lives inside Semantic (e.g. button/primary-bg)', () => {
    const variable = { remote: false, key: 'local:1:3', collectionName: 'Semantic' }
    expect(nonSemanticBindingViolation(variable, 'Semantic')).toBeNull()
  })

  it('flags a remote/library-sourced binding — no subscribed kit library exists anymore', () => {
    const variable = { remote: true, key: 'some-librarys-key', collectionName: 'Kit Colors' }
    expect(nonSemanticBindingViolation(variable, 'Semantic')).toEqual({
      rule: 'non-semantic-binding',
      detail: 'bound to a variable outside the local Semantic collection'
    })
  })

  it('flags a LOCAL variable bound to a local Primitives collection (confirmed live: Slice 14)', () => {
    const variable = { remote: false, key: 'local:1:2', collectionName: 'Primitives' }
    expect(nonSemanticBindingViolation(variable, 'Semantic')).toEqual({
      rule: 'non-semantic-binding',
      detail: 'bound to a variable outside the local Semantic collection'
    })
  })

  it('flags a local variable with no resolvable collection name', () => {
    const variable = { remote: false, key: 'local:1:2', collectionName: null }
    expect(nonSemanticBindingViolation(variable, 'Semantic')).toEqual({
      rule: 'non-semantic-binding',
      detail: 'bound to a variable outside the local Semantic collection'
    })
  })

  // Field bug regression (2026-07-07, live D01 build: a stock kit duplicate
  // deliberately splits tokens across a tw/* collection family — the check
  // hard-failed every one of the kit's own untouched components before this
  // allowlist existed).
  it('passes a local variable bound to a recipe-declared tw/* family collection', () => {
    const variable = { remote: false, key: 'local:1:2', collectionName: 'tw/font' }
    expect(nonSemanticBindingViolation(variable, 'Semantic')).toBeNull()
  })

  it('uses the project-configured Semantic collection name for both the comparison and the message', () => {
    const variable = { remote: false, key: 'local:1:2', collectionName: 'Theme' }
    expect(nonSemanticBindingViolation(variable, 'Theme')).toBeNull()

    const primitiveVariable = { remote: false, key: 'local:1:2', collectionName: 'Primitives' }
    expect(nonSemanticBindingViolation(primitiveVariable, 'Theme')).toEqual({
      rule: 'non-semantic-binding',
      detail: 'bound to a variable outside the local Theme collection'
    })
  })
})
