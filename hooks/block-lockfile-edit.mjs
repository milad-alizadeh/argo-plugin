#!/usr/bin/env node
/**
 * block-lockfile-edit — PreToolUse guard on Edit|Write|MultiEdit: lockfiles
 * are machine-written by package managers; a hand edit silently desyncs the
 * dependency graph. Mechanizes the standing rule "never hand-edit a lockfile
 * or version — use the package manager."
 *
 * Always-on safety category (like block-dangerous-git): stack-agnostic
 * lockfile list, inert on anything else. Fail-open on malformed stdin —
 * this runs on every file edit in every host project.
 *
 * ORDERING: this shares the Edit|Write|MultiEdit matcher with other plugins'
 * hooks (e.g. tdd-guard's LLM validator). Claude Code does not document a
 * cross-plugin ordering guarantee, so this hook must stay correct whether it
 * runs before or after them — it is pure, instant, and side-effect-free.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const LOCKFILES = new Set([
  'bun.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'poetry.lock',
  'Gemfile.lock',
  'composer.lock',
  'go.sum',
])
const LOCKFILE_SUFFIXES = ['.lockb']

function main() {
  let hook
  try {
    hook = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    process.exit(0) // malformed stdin — inert
  }
  const filePath = hook?.tool_input?.file_path
  if (typeof filePath !== 'string') process.exit(0)

  const name = basename(filePath)
  const isLockfile = LOCKFILES.has(name) || LOCKFILE_SUFFIXES.some((s) => name.endsWith(s))
  if (!isLockfile) process.exit(0)

  process.stderr.write(
    `Lockfile guard: BLOCKED — "${name}" is machine-written; hand edits desync the dependency graph. ` +
      `Use the package manager (install/add/update) and let it rewrite the lockfile.`,
  )
  process.exit(2)
}

main()
