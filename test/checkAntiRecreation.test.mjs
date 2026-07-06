import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkNewNameAliasCollision } from '../scripts/check-anti-recreation.mjs'

describe('checkNewNameAliasCollision (figma-create brief-read flow — anti-recreation hard gate)', () => {
  it('hard-fails a NEW name that collides with design/component-aliases.json', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'anti-recreation-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(
      join(cwd, 'design', 'component-aliases.json'),
      JSON.stringify({ components: [{ name: 'AskRow', aliases: ['PromptCard', 'InterruptCard'] }] }),
      'utf8'
    )

    try {
      expect(checkNewNameAliasCollision('PromptCard', { cwd })).toEqual({
        rule: 'new-name-alias-collision',
        detail: 'NEW name "PromptCard" collides with existing component "AskRow" — reuse or extend it instead of recreating it'
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('fails open (returns null) when design/component-aliases.json is absent', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'anti-recreation-'))
    try {
      expect(checkNewNameAliasCollision('PromptCard', { cwd })).toBeNull()
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
