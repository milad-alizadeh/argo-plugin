import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONFIG_SCHEMA } from './config-schema.js'

describe('CONFIG_SCHEMA', () => {
  it('has a matching entry for every field in init/SKILL.md §9 example JSON', () => {
    const skillMd = readFileSync(join(import.meta.dirname, '../../../../../skills/init/SKILL.md'), 'utf8')
    const section9 = skillMd.slice(skillMd.indexOf('## 9.'))
    const match = section9.match(/```json\n(\{[\s\S]*?\})\n```/)
    if (!match) throw new Error('could not find §9 example JSON block in init/SKILL.md')
    const exampleFields = Object.keys(JSON.parse(match[1]))
    const schemaFields = CONFIG_SCHEMA.map((entry) => entry.field)
    for (const field of exampleFields) {
      expect(schemaFields).toContain(field)
    }
  })
})
