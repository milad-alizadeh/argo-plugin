import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assembleSkill, assembleSkillInPlace } from './assemble-skill.js'

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..')

describe('assembleSkill', () => {
  it('splices the included file in place of the marker line (fixture)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assemble-skill-'))
    mkdirSync(join(dir, 'craft'), { recursive: true })
    writeFileSync(join(dir, 'craft', 'example.md'), '# Craft body\n\nSome craft content.\n')
    const wrapperPath = join(dir, 'SKILL.md')
    writeFileSync(
      wrapperPath,
      '---\nname: example\ndescription: An example skill.\n---\n\n<!-- INCLUDE: craft/example.md -->\n'
    )

    const assembled = assembleSkill({ skillPath: wrapperPath, cwd: dir })

    expect(assembled).toBe(
      '---\nname: example\ndescription: An example skill.\n---\n\n# Craft body\n\nSome craft content.\n'
    )
    expect(assembled).not.toContain('INCLUDE:')
  })

  it('throws when the wrapper has no INCLUDE marker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assemble-skill-'))
    const wrapperPath = join(dir, 'SKILL.md')
    writeFileSync(wrapperPath, '---\nname: example\n---\n\nNo marker here.\n')

    expect(() => assembleSkill({ skillPath: wrapperPath, cwd: dir })).toThrow(/no.*INCLUDE.*marker/i)
  })

  it('throws when the included file does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assemble-skill-'))
    const wrapperPath = join(dir, 'SKILL.md')
    writeFileSync(wrapperPath, '---\nname: example\n---\n\n<!-- INCLUDE: craft/missing.md -->\n')

    expect(() => assembleSkill({ skillPath: wrapperPath, cwd: dir })).toThrow()
  })

  describe('real skills (repo snapshot)', () => {
    const skills = [
      ['design-screen', 'design-screen'],
      ['design-component', 'design-component'],
      ['figma-audit', 'figma-audit'],
      ['figma-sync', 'figma-sync'],
      ['figma-to-code', 'figma-to-code'],
      ['resolve-comments', 'resolve-comments'],
    ] as const

    for (const [skillDir, craftName] of skills) {
      it(`${skillDir}/SKILL.md is committed IN SYNC with its craft file (block form, no drift)`, () => {
        const skillPath = join(REPO_ROOT, 'skills', skillDir, 'SKILL.md')
        const craftPath = join(REPO_ROOT, 'packages', 'toolkit', 'packs', 'design', 'craft', `${craftName}.md`)
        const craftContent = readFileSync(craftPath, 'utf8')

        const committed = readFileSync(skillPath, 'utf8')
        expect(committed).toContain(craftContent.replace(/\n$/, ''))

        const { changed } = assembleSkillInPlace({ skillPath, cwd: REPO_ROOT })
        expect(changed).toBe(false)
      })
    }
  })

  it('assembleSkillInPlace upgrades a bare marker to the block form and is then idempotent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assemble-skill-'))
    mkdirSync(join(dir, 'craft'), { recursive: true })
    writeFileSync(join(dir, 'craft', 'example.md'), '# Craft body\n\nSome craft content.\n')
    const wrapperPath = join(dir, 'SKILL.md')
    writeFileSync(wrapperPath, '---\nname: example\n---\n\n<!-- INCLUDE: craft/example.md -->\n')

    const first = assembleSkillInPlace({ skillPath: wrapperPath, cwd: dir })
    expect(first.changed).toBe(true)
    expect(first.assembled).toBe(
      '---\nname: example\n---\n\n<!-- INCLUDE: craft/example.md -->\n# Craft body\n\nSome craft content.\n<!-- /INCLUDE -->\n'
    )

    writeFileSync(wrapperPath, first.assembled)
    const second = assembleSkillInPlace({ skillPath: wrapperPath, cwd: dir })
    expect(second.changed).toBe(false)

    writeFileSync(join(dir, 'craft', 'example.md'), '# Craft body v2\n')
    const third = assembleSkillInPlace({ skillPath: wrapperPath, cwd: dir })
    expect(third.changed).toBe(true)
    expect(third.assembled).toContain('# Craft body v2')
    expect(third.assembled).not.toContain('Some craft content.')
  })
})
