/**
 * Syncs the argo-v2 palette (`@theme static { ... }` block of
 * apps/desktop/src/renderer/src/assets/base.css) into
 * apps/docs/src/styles/argo-theme.generated.css, following the
 * `runGraphRefresh` shape: on-device, single-writer, precondition-gated,
 * `{ skipped: reason }` instead of throwing so a machine without argo-v2
 * access degrades safely.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ARGO_V2_REPO = 'milad-alizadeh/argo-v2'
const ARGO_V2_BASE_CSS_PATH = 'apps/desktop/src/renderer/src/assets/base.css'
const GENERATED_CSS_PATH = 'apps/docs/src/styles/argo-theme.generated.css'

const GENERATED_HEADER = `/* GENERATED — do not edit; regenerate via \`argo docs sync-theme\`.
   Source: ${ARGO_V2_REPO}'s ${ARGO_V2_BASE_CSS_PATH} (@theme static block). */

`

export function runDocsSyncTheme({ cwd = process.cwd(), env = process.env }: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const sh = (cmd: string, args: string[]) => spawnSync(cmd, args, { cwd, encoding: 'utf8', env })

  if (sh('sh', ['-c', 'command -v gh']).status !== 0) {
    return { skipped: 'gh-not-installed' }
  }

  const fetched = sh('gh', ['api', `repos/${ARGO_V2_REPO}/contents/${ARGO_V2_BASE_CSS_PATH}`, '--jq', '.content'])
  if (fetched.status !== 0 || !fetched.stdout?.trim()) {
    return { skipped: 'argo-v2-unreachable' }
  }

  const cssSource = Buffer.from(fetched.stdout.trim(), 'base64').toString('utf8')
  let themeBlock: string
  try {
    themeBlock = extractThemeStaticBlock(cssSource)
  } catch {
    return { skipped: 'theme-static-block-not-found' }
  }

  const outPath = join(cwd, GENERATED_CSS_PATH)
  const newContent = `${GENERATED_HEADER}:root {\n${themeBlock}\n}\n`
  const existing = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null
  if (existing === newContent) {
    return { skipped: 'no-change' }
  }

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, newContent, 'utf8')

  const gitAtRoot = (args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8', env })
  gitAtRoot(['add', '--', GENERATED_CSS_PATH])
  const commit = gitAtRoot(['commit', '-m', 'chore(docs): sync theme from argo-v2', '--', GENERATED_CSS_PATH])

  return { committed: commit.status === 0, path: GENERATED_CSS_PATH }
}

/**
 * Extracts the `@theme static { ... }` block from an argo-v2 base.css-shaped
 * source string by brace-matching on the opener — never a hardcoded line
 * range, since the source file drifts. Must not match `@theme inline` or any
 * `:root`/`.dark` block.
 */
export function extractThemeStaticBlock(cssSource: string): string {
  const opener = '@theme static {'
  const start = cssSource.indexOf(opener)
  if (start === -1) throw new Error('extractThemeStaticBlock: no "@theme static {" block found')

  let depth = 0
  let i = start + opener.length - 1 // position of the opening brace
  const bodyStart = i + 1
  for (; i < cssSource.length; i++) {
    if (cssSource[i] === '{') depth++
    else if (cssSource[i] === '}') {
      depth--
      if (depth === 0) return cssSource.slice(bodyStart, i).trim()
    }
  }
  throw new Error('extractThemeStaticBlock: unterminated "@theme static {" block')
}
