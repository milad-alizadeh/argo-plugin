#!/usr/bin/env node
/**
 * The anti-recreation hard gate (design-first-council-ruling.md Gate ruling
 * — "the ONE hard check promoted now"), wired into figma-create/SKILL.md's
 * component-first screen path: before authoring any brief-tagged NEW
 * component, run this against its proposed name. A collision is a HARD
 * stop-the-line — never build a second component for something that
 * already exists under another name (`design/component-aliases.json`'s
 * canonical name or alias); reuse or extend it instead. Deliberately NOT
 * folded into `record-audit-receipt.js`'s per-run `violationCount` — that
 * flow re-checks the SAME `componentNames` on every re-audit of an already-
 * built component, which would self-collide against its own alias-map entry
 * (`findNewNameAliasCollision` has no self-exclusion — by design, since it
 * only ever runs once, before a name is committed to anything).
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { findNewNameAliasCollision } from '../design-kit/component-names.js'

function readOptionalJson(path: string): any {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

export function checkNewNameAliasCollision(newName: string, { cwd }: { cwd: string }) {
  const aliasMap = readOptionalJson(join(cwd, 'design', 'component-aliases.json'))
  return findNewNameAliasCollision(newName, aliasMap)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const nameIndex = args.indexOf('--name')
  if (nameIndex === -1 || !args[nameIndex + 1]) {
    console.error('check-anti-recreation: usage: argo design check-anti-recreation --name "<NEW component name>"')
    process.exit(1)
  }
  const collision = checkNewNameAliasCollision(args[nameIndex + 1], { cwd: process.cwd() })
  console.log(JSON.stringify({ collision }))
  process.exit(collision ? 1 : 0)
}
