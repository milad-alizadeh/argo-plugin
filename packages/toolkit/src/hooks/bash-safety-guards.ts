#!/usr/bin/env node
// PreToolUse guard on Bash|Monitor: dangerous-git, then pipe-to-shell, then bash-source-write, first violation wins. Fail-open on malformed stdin/no command.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function block(reason: string): never {
  process.stderr.write(reason)
  process.exit(2)
}

// --- block-dangerous-git ---------------------------------------------------

// Each pattern requires the literal `git <subcommand>` so it won't match the
// same words inside a commit message, path, or unrelated substring.
const DANGEROUS_GIT_PATTERNS = [
  /git\s+reset\s+--hard/,
  /git\s+clean\s+-[a-zA-Z]*f/,
  /git\s+branch\s+-D/,
  /git\s+checkout\s+(--\s+)?\./,
  /git\s+restore\s+\./,
  /git\s+push\s+.*(--force|-f(\s|$))/,
]

export function dangerousGitViolation(command: string): string | null {
  for (const pattern of DANGEROUS_GIT_PATTERNS) {
    if (pattern.test(command)) {
      return (
        `Argo guardrail blocked a destructive git command — '${command}' matches '${pattern}'. ` +
        `If this is intentional, run it yourself, or set ARGO_DISABLE_GIT_GUARD=1 to disable this guard.`
      )
    }
  }
  return null
}

// --- check-pipe-to-shell -----------------------------------------------------

const PIPE_TO_SHELL = /\b(curl|wget)\b[^|]*\|\s*(bash|sh|zsh|fish|node|python[23]?|ruby|perl)\b/i

export function pipeToShellViolation(command: string): string | null {
  if (!PIPE_TO_SHELL.test(command)) return null
  return (
    `Blocked: pipe-to-shell pattern detected.\n\n` +
    `  Command: ${command.slice(0, 200)}\n\n` +
    `Downloading and immediately executing code is a supply-chain risk — ` +
    `the script runs with full shell privileges before it can be reviewed.\n\n` +
    `Alternative: download to a file first, inspect it, then run it.\n` +
    `  curl -fsSL <url> -o install.sh && cat install.sh && bash install.sh\n`
  )
}

// --- block-bash-source-write -------------------------------------------------

const DEFAULT_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'cpp', 'h', 'dart', 'cs', 'php',
]

const GENERATED_PATH =
  /(^|\/)generated\/|\.gen\.[a-z]+$|^(?:\.\/)?(dist|out|build|node_modules|tmp|\.argo)\/|^\/tmp\//i

function loadExtensions(cwd?: string): string[] {
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

function shellWriteTargets(segment: string): string[] {
  const targets: string[] = []
  const redir = /(?:^|[^>])>{1,2}\s*([^\s;|&<>]+)/g
  let m: RegExpExecArray | null
  while ((m = redir.exec(segment))) targets.push(m[1])
  const tee = /\btee\b\s+(?:-a\s+)?([^\s;|&]+)/g
  while ((m = tee.exec(segment))) targets.push(m[1])
  if (/\b(sed|perl)\b[^\n]*\s-\w*i/.test(segment)) {
    const args = segment.trim().split(/\s+/).filter((a) => !a.startsWith('-'))
    if (args.length > 1) targets.push(args[args.length - 1])
  }
  const cpmv = /\b(?:cp|mv|install)\b\s+(?:-\w+\s+)*(?:[^\s;|&]+\s+)+([^\s;|&]+)/
  const cm = cpmv.exec(segment)
  if (cm) targets.push(cm[1])
  const dd = /\bdd\b[^\n]*\bof=([^\s;|&]+)/.exec(segment)
  if (dd) targets.push(dd[1])
  return targets
}

function interpreterWritesSource(segment: string, extRe: string): string | false {
  if (!/\b(?:python3?\s+-c|node\s+(?:-e|--eval)|ruby\s+-e)\b/.test(segment)) return false
  if (!/(open\s*\([^)]*[wa]|writeFileSync|writeFile|File\.write|Path\([^)]*\)\.write_text)/.test(segment)) return false
  const pathLike = new RegExp(`['"\\\`]([^'"\\\`]+\\.(?:${extRe}))['"\\\`]`)
  const pm = pathLike.exec(segment)
  return pm ? pm[1] : false
}

export function bashSourceWriteViolation(command: string, cwd?: string): string | null {
  const extensions = loadExtensions(cwd)
  const extRe = extensions.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const isSource = (p: string) => new RegExp(`\\.(?:${extRe})$`).test(p) && !GENERATED_PATH.test(p)

  for (const segment of command.split(/(?:&&|\|\||;|\n)+/)) {
    const targets = shellWriteTargets(segment)
    const interp = interpreterWritesSource(segment, extRe)
    if (interp) targets.push(interp)
    const hit = targets.find(isSource)
    if (hit) {
      return (
        `Bash source-write guard: BLOCKED — "${hit}" is a source file being written via shell ` +
        `(redirection/tee/in-place/copy). Edit source through the Write/Edit tools so the TDD guard ` +
        `and write-hygiene hooks see the change. (Generated paths and non-source files are exempt; ` +
        `escape hatch for humans: ARGO_DISABLE_BASH_SOURCE_GUARD=1.)`
      )
    }
  }
  return null
}

function main(): void {
  let hook: any
  try {
    hook = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    process.exit(0) // malformed stdin — fail open
  }
  const command = hook?.tool_input?.command
  if (typeof command !== 'string') process.exit(0)

  if (process.env.ARGO_DISABLE_GIT_GUARD !== '1') {
    const gitViolation = dangerousGitViolation(command)
    if (gitViolation) block(gitViolation)
  }

  const pipeViolation = pipeToShellViolation(command)
  if (pipeViolation) block(pipeViolation)

  if (process.env.ARGO_DISABLE_BASH_SOURCE_GUARD !== '1') {
    const sourceViolation = bashSourceWriteViolation(command, hook?.cwd)
    if (sourceViolation) block(sourceViolation)
  }

  process.exit(0)
}

main()
