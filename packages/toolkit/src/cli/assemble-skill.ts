/**
 * `argo design assemble-skill` — the "wrapper includes craft file at build
 * time" mechanism (playbook-engine-phase1.md Slice 12, step 37).
 *
 * Deliberately NOT a templating engine: a `skills/<name>/SKILL.md` file
 * checked into the repo IS the wrapper — frontmatter plus a single
 * `<!-- INCLUDE: <repo-relative-path> -->` marker line. This module's only
 * job is a literal string include: read the wrapper, find the marker, read
 * the named file, splice its content in place of the marker line, return the
 * assembled markdown. No conditionals, no variables, no nested includes.
 *
 * Confirmed absent before adding this: no existing script in the repo reads
 * `skills/*\/SKILL.md` to assemble it from another source (grep for
 * "assemble"/"INCLUDE" over `packages/toolkit/src` and the repo root turned up
 * nothing touching SKILL.md).
 *
 * This does not rewrite the checked-in wrapper in place — the wrapper stays
 * the marker form as the source of truth in git; running this script is the
 * documented build/prepare step a consumer (a published-plugin packaging
 * step, a docs site, a future runtime loader) uses to get the fully
 * assembled skill text. Phase 1 scope stops at "the mechanism exists and is
 * tested" per the plan's own risk note — wiring it into the live plugin skill
 * load path is explicitly left to whoever reviews this slice.
 */
import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

const INCLUDE_MARKER_RE = /^<!--\s*INCLUDE:\s*(.+?)\s*-->\s*$/m

export interface AssembleSkillOptions {
  /** Absolute path to the wrapper `SKILL.md` file. */
  skillPath: string
  /** Root the marker's include path is resolved against (repo root). Defaults to `process.cwd()`. */
  cwd?: string
}

/**
 * Reads a wrapper SKILL.md, resolves its `<!-- INCLUDE: path -->` marker
 * against `cwd`, and returns the assembled markdown with the marker line
 * replaced by the included file's exact content.
 *
 * Throws if the wrapper has no marker, or the included file doesn't exist —
 * fail loud rather than silently emitting a half-assembled skill.
 */
export function assembleSkill({ skillPath, cwd = process.cwd() }: AssembleSkillOptions): string {
  const wrapper = readFileSync(skillPath, 'utf8')
  const match = wrapper.match(INCLUDE_MARKER_RE)
  if (!match) {
    throw new Error(`assembleSkill: no "<!-- INCLUDE: path -->" marker found in ${skillPath}`)
  }
  const includePath = match[1]
  const resolvedIncludePath = isAbsolute(includePath) ? includePath : join(cwd, includePath)
  const included = readFileSync(resolvedIncludePath, 'utf8')
  return wrapper.slice(0, match.index) + included + wrapper.slice(match.index! + match[0].length)
}

// CLI: `node assemble-skill.js <skillPath> [--cwd <repoRoot>]` — prints the
// assembled markdown to stdout. Kept as a thin argv reader so this module
// stays testable as a pure function above; `bin/argo.js` wires the verb.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [skillPathArg, ...rest] = process.argv.slice(2)
  if (!skillPathArg) {
    process.stderr.write('usage: assemble-skill <skillPath> [--cwd <repoRoot>]\n')
    process.exit(1)
  }
  const cwdFlagIndex = rest.indexOf('--cwd')
  const cwd = cwdFlagIndex === -1 ? undefined : rest[cwdFlagIndex + 1]
  process.stdout.write(assembleSkill({ skillPath: skillPathArg, cwd }))
}
