#!/usr/bin/env node
/**
 * P4b completeness-checklist generator (design-screen SKILL.md §4b). Reads a
 * feature PRD Node-side and emits, for one screen, the deterministic checklist
 * of requirements the design-verifier must rule present/absent against the
 * built screenshot — the requirements the PRD's matrix disposes `covered-by`
 * this screen whose `Visible in build?` is `yes` or `partial`.
 *
 * Selection is mechanical (no judgement) so the verifier only judges pixels,
 * never scope. Output is JSON on stdout; the skill pipes it to the verifier.
 */

import { readFileSync, existsSync } from 'node:fs'
import { selectChecklistForScreen } from '../design-kit/completeness-checklist.js'

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const screen = flagValue(args, '--screen')
  const prdPath = flagValue(args, '--prd')
  if (!screen || !prdPath) {
    process.stderr.write('completeness-checklist: usage: argo design completeness-checklist --screen <name> --prd <path>\n')
    process.exit(1)
  }
  if (!existsSync(prdPath)) {
    process.stderr.write(`completeness-checklist: PRD not found at ${prdPath}\n`)
    process.exit(1)
  }
  const md = readFileSync(prdPath, 'utf8')
  const checklist = selectChecklistForScreen(md, screen)
  if (checklist.length === 0) {
    process.stderr.write(
      `completeness-checklist: no yes|partial requirements covered-by "${screen}" in ${prdPath} — verify the screen name matches the feature→screen matrix\n`
    )
  }
  console.log(JSON.stringify({ screen, checklist }))
}
