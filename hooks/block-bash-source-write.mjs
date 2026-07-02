#!/usr/bin/env node
/**
 * block-bash-source-write — PreToolUse Bash guard: source files must be
 * edited through the Write/Edit tools, never materialized via shell writes.
 *
 * WHY: tdd-guard validates Write|Edit|MultiEdit, and argo's write-hygiene
 * hooks (format-on-write, test-smell) match Edit|Write — a `cat > f.ts`
 * heredoc, `sed -i`, or `tee` bypasses the TDD guard, formatting, and smell
 * checks in one move (observed in a real builder transcript: blocked 3× on
 * Edit, then wrote the file via Bash). This closes the SHELL-WRITE subset of
 * that bypass; NotebookEdit and filesystem-capable MCP tools remain open by
 * design (recorded in the plan, not silently claimed).
 *
 * MUST NOT block: non-source targets (logs, fixtures, /tmp, scratch);
 * program-driven generators (`npx create-...` — they don't use shell
 * redirection); stdout-redirect codegen into conventionally-generated paths
 * (any generated/ dir, .gen.<ext> files) or build-output dirs. Escape hatch:
 * ARGO_DISABLE_BASH_SOURCE_GUARD=1 (mirrors block-dangerous-git).
 *
 * Extension list: stack-agnostic default below; a host project can override
 * it via `.claude/argo-source-extensions.json` (a JSON array of extensions,
 * read from the hook's cwd) — installed/documented by setup-claude.
 * Fail-open on malformed stdin: this runs on every Bash call everywhere.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DEFAULT_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'cpp', 'h', 'dart', 'cs', 'php',
]

// Paths where shell-written "source" is conventional, not a bypass.
const GENERATED_PATH = /(^|\/)(generated|dist|out|build|node_modules|tmp|\.argo)\/|\.gen\.[a-z]+$|(^|\/)\/?tmp\//i

function loadExtensions(cwd) {
  try {
    const override = join(cwd || '.', '.claude', 'argo-source-extensions.json')
    if (existsSync(override)) {
      const list = JSON.parse(readFileSync(override, 'utf8'))
      if (Array.isArray(list) && list.every((e) => typeof e === 'string') && list.length > 0) return list
    }
  } catch {
    /* unreadable override — fall through to default */
  }
  return DEFAULT_EXTENSIONS
}

/** Extract candidate target paths a command segment writes to via shell mechanisms. */
function shellWriteTargets(segment) {
  const targets = []
  // Redirection: > file, >> file, 2> file — but not >&2 / >/dev/null
  const redir = /(?:^|[^>])>{1,2}\s*([^\s;|&<>]+)/g
  let m
  while ((m = redir.exec(segment))) targets.push(m[1])
  // tee [-a] file...
  const tee = /\btee\b\s+(?:-a\s+)?([^\s;|&]+)/g
  while ((m = tee.exec(segment))) targets.push(m[1])
  // in-place edits: sed -i / perl -i — the LAST non-flag arg is the file
  if (/\b(sed|perl)\b[^\n]*\s-\w*i/.test(segment)) {
    const args = segment.trim().split(/\s+/).filter((a) => !a.startsWith('-'))
    if (args.length > 1) targets.push(args[args.length - 1])
  }
  // cp/mv/install/dd: destination is the last arg (or of=... for dd)
  const cpmv = /\b(?:cp|mv|install)\b\s+(?:-\w+\s+)*(?:[^\s;|&]+\s+)+([^\s;|&]+)/
  const cm = cpmv.exec(segment)
  if (cm) targets.push(cm[1])
  const dd = /\bdd\b[^\n]*\bof=([^\s;|&]+)/.exec(segment)
  if (dd) targets.push(dd[1])
  return targets
}

/** Interpreter one-liners that write files: python -c / node -e / ruby -e with a write call. */
function interpreterWritesSource(segment, extRe) {
  if (!/\b(?:python3?\s+-c|node\s+(?:-e|--eval)|ruby\s+-e)\b/.test(segment)) return false
  if (!/(open\s*\([^)]*[wa]|writeFileSync|writeFile|File\.write|Path\([^)]*\)\.write_text)/.test(segment)) return false
  const pathLike = new RegExp(`['"\\\`]([^'"\\\`]+\\.(?:${extRe}))['"\\\`]`)
  const pm = pathLike.exec(segment)
  return pm ? pm[1] : false
}

function main() {
  if (process.env.ARGO_DISABLE_BASH_SOURCE_GUARD === '1') process.exit(0)
  let hook
  try {
    hook = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    process.exit(0)
  }
  const command = hook?.tool_input?.command
  if (typeof command !== 'string') process.exit(0)

  const extensions = loadExtensions(hook?.cwd)
  const extRe = extensions.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const isSource = (p) => new RegExp(`\\.(?:${extRe})$`).test(p) && !GENERATED_PATH.test(p)

  for (const segment of command.split(/(?:&&|\|\||;|\n)+/)) {
    const targets = shellWriteTargets(segment)
    const interp = interpreterWritesSource(segment, extRe)
    if (interp) targets.push(interp)
    const hit = targets.find(isSource)
    if (hit) {
      process.stderr.write(
        `Bash source-write guard: BLOCKED — "${hit}" is a source file being written via shell ` +
          `(redirection/tee/in-place/copy). Edit source through the Write/Edit tools so the TDD guard ` +
          `and write-hygiene hooks see the change. (Generated paths and non-source files are exempt; ` +
          `escape hatch for humans: ARGO_DISABLE_BASH_SOURCE_GUARD=1.)`,
      )
      process.exit(2)
    }
  }
  process.exit(0)
}

main()
