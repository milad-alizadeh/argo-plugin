/**
 * Deliberately not a templating engine: splices one included file's literal
 * content in place of a single `<!-- INCLUDE: path -->` marker line. No
 * conditionals, no variables, no nested includes.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
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

const INCLUDE_BLOCK_RE = /^<!--\s*INCLUDE:\s*(.+?)\s*-->\n[\s\S]*?^<!--\s*\/INCLUDE\s*-->\s*$/m

/**
 * Idempotent in-place assembly: the wrapper keeps a begin/end marker pair
 * wrapping the spliced content so it stays re-assemblable after the source
 * changes. A bare single-line marker is upgraded to the block form on first
 * run. Returns the assembled text; `changed` says whether it differs from disk.
 */
export function assembleSkillInPlace({ skillPath, cwd = process.cwd() }: AssembleSkillOptions): {
  assembled: string
  changed: boolean
} {
  const wrapper = readFileSync(skillPath, 'utf8')
  const block = wrapper.match(INCLUDE_BLOCK_RE)
  const single = block ? null : wrapper.match(INCLUDE_MARKER_RE)
  const match = block ?? single
  if (!match) {
    throw new Error(`assembleSkillInPlace: no INCLUDE marker (line or block form) found in ${skillPath}`)
  }
  const includePath = match[1]
  const resolvedIncludePath = isAbsolute(includePath) ? includePath : join(cwd, includePath)
  const included = readFileSync(resolvedIncludePath, 'utf8')
  const replacement = `<!-- INCLUDE: ${includePath} -->\n${included.replace(/\n$/, '')}\n<!-- /INCLUDE -->`
  const raw = wrapper.slice(0, match.index) + replacement + wrapper.slice(match.index! + match[0].length)
  const assembled = raw.endsWith('\n') ? raw : raw + '\n'
  return { assembled, changed: assembled !== wrapper }
}

/**
 * Assemble every `skills/*\/SKILL.md` under `repoRoot` that carries an
 * INCLUDE marker. `write: true` rewrites changed files in place; otherwise
 * this is a drift check. Returns the changed file paths.
 */
export function assembleAllSkills({ repoRoot, write }: { repoRoot: string; write: boolean }): string[] {
  const skillsDir = join(repoRoot, 'skills')
  const changed: string[] = []
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillPath = join(skillsDir, entry.name, 'SKILL.md')
    let wrapper: string
    try {
      wrapper = readFileSync(skillPath, 'utf8')
    } catch {
      continue
    }
    if (!/<!--\s*INCLUDE:/.test(wrapper)) continue
    const result = assembleSkillInPlace({ skillPath, cwd: repoRoot })
    if (result.changed) {
      changed.push(skillPath)
      if (write) writeFileSync(skillPath, result.assembled)
    }
  }
  return changed
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const cwdFlagIndex = args.indexOf('--cwd')
  const cwd = cwdFlagIndex === -1 ? process.cwd() : args[cwdFlagIndex + 1]
  if (args.includes('--all')) {
    const check = args.includes('--check')
    const changed = assembleAllSkills({ repoRoot: cwd, write: !check })
    if (check && changed.length > 0) {
      process.stderr.write(`assemble-skill --check: ${changed.length} skill wrapper(s) out of date with their craft docs:\n${changed.join('\n')}\nRun: argo design assemble-skill --all\n`)
      process.exit(1)
    }
    process.stdout.write(JSON.stringify({ changed }) + '\n')
  } else {
    const [skillPathArg] = args
    if (!skillPathArg || skillPathArg.startsWith('--')) {
      process.stderr.write('usage: assemble-skill <skillPath> [--cwd <repoRoot>] | assemble-skill --all [--check] [--cwd <root>]\n')
      process.exit(1)
    }
    process.stdout.write(assembleSkill({ skillPath: skillPathArg, cwd }))
  }
}
