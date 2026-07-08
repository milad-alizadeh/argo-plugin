import { describe, it, expect } from 'vitest'
import { roleTagOf, findByRole, findAllByRole, hasAnyRoleTag } from './role-tags.js'

describe('roleTagOf', () => {
  it('recognizes #content-start', () => {
    expect(roleTagOf({ name: 'Row Content #content-start' })).toBe('content-start')
  })

  it('recognizes #rail', () => {
    expect(roleTagOf({ name: 'Connector #rail' })).toBe('rail')
  })

  it('recognizes #anchor', () => {
    expect(roleTagOf({ name: 'Icon #anchor' })).toBe('anchor')
  })

  it('recognizes #hit-target', () => {
    expect(roleTagOf({ name: 'Checkbox #hit-target' })).toBe('hit-target')
  })

  it('returns null for an untagged name', () => {
    expect(roleTagOf({ name: 'Row Content' })).toBe(null)
  })

  it('returns null for an unknown #foo suffix (fails closed, never guesses)', () => {
    expect(roleTagOf({ name: 'Row Content #foo' })).toBe(null)
  })
})

describe('findByRole / findAllByRole', () => {
  const tree = {
    name: 'Row',
    children: [
      { name: 'Icon #anchor' },
      { name: 'Content #content-start', children: [{ name: 'Label #anchor' }] }
    ]
  }

  it('findByRole returns the first depth-first match', () => {
    expect(findByRole(tree, 'anchor')?.name).toBe('Icon #anchor')
  })

  it('findByRole returns null when no descendant carries the role', () => {
    expect(findByRole(tree, 'rail')).toBe(null)
  })

  it('findAllByRole returns every matching descendant, depth-first order', () => {
    const matches = findAllByRole(tree, 'anchor').map((n) => n.name)
    expect(matches).toEqual(['Icon #anchor', 'Label #anchor'])
  })
})

describe('hasAnyRoleTag', () => {
  it('is true when at least one descendant carries any of the 4 roles', () => {
    expect(hasAnyRoleTag({ name: 'Row', children: [{ name: 'Icon #anchor' }] })).toBe(true)
  })

  it('is false when no descendant carries any role', () => {
    expect(hasAnyRoleTag({ name: 'Row', children: [{ name: 'Icon' }] })).toBe(false)
  })
})
