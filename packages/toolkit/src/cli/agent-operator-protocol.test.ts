import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assembleSkillInPlace } from './assemble-skill.js'

// Fix 1 (agent-boilerplate consolidation): 9 of 11 agents/*.md repeat the
// anti-spiral + turn-discipline operator-protocol boilerplate. Rather than a
// pointer the agent reads at runtime (unproven — no agent currently resolves
// CLAUDE_PLUGIN_ROOT, and none is guaranteed Read access to a path outside
// its own system prompt), this reuses the repo's existing INCLUDE-marker
// build-time splice (assemble-skill.ts, used for skills/*/SKILL.md) so the
// committed agent file carries the REAL text (loads verbatim, no packaging
// step) while staying re-assemblable from one canonical source.
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..')

const AGENTS_WITH_OPERATOR_PROTOCOL = [
  'auditor',
  'builder',
  'debugger',
  'designer',
  'integrator',
  'planner',
  'product',
  'reviewer',
  'scaffolder',
] as const

describe('agents/*.md operator-protocol (anti-spiral + turn discipline) stays in sync', () => {
  const canonicalPath = join(REPO_ROOT, 'agents', '_operator-protocol.md')
  const canonical = readFileSync(canonicalPath, 'utf8')

  for (const name of AGENTS_WITH_OPERATOR_PROTOCOL) {
    it(`agents/${name}.md carries the canonical operator-protocol block verbatim (no drift)`, () => {
      const agentPath = join(REPO_ROOT, 'agents', `${name}.md`)
      const committed = readFileSync(agentPath, 'utf8')

      expect(committed).toContain(canonical.replace(/\n$/, ''))

      const { changed } = assembleSkillInPlace({ skillPath: agentPath, cwd: REPO_ROOT })
      expect(changed).toBe(false)
    })
  }

  it('design-verifier and fidelity-verifier carry no operator-protocol block (narrow, no boilerplate)', () => {
    for (const name of ['design-verifier', 'fidelity-verifier']) {
      const committed = readFileSync(join(REPO_ROOT, 'agents', `${name}.md`), 'utf8')
      expect(committed).not.toContain('INCLUDE: agents/_operator-protocol.md')
    }
  })
})
