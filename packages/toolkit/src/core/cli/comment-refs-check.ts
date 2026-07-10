/**
 * `comment-refs-check` (council-hardening.md Wave E): INTERFACE-surface
 * checker for templates/rules/comments.md. Docs/SKILL.md/rules are the one
 * place referential naming is the contract — this asserts every reference
 * they make actually resolves, so documentation never points at a file or
 * verb that moved or never existed. Advisory: always returns findings,
 * never throws.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isWaived, type CommentCheckWaiver } from './comment-check-waivers.js'

export interface CommentRefsFinding {
  rule: 'unresolved-file-reference' | 'unresolved-verb'
  file: string
  token: string
}

export interface CommentRefsCheckOptions {
  cwd?: string
  /** Docs/SKILL.md/rule files, relative to `cwd`. */
  paths: string[]
  /** Known `argo <verb>` set. Omit to skip verb resolution entirely (advisory scope: don't guess). */
  knownVerbs?: string[]
  waivers?: CommentCheckWaiver[]
}

const FILE_TOKEN = /`\.{0,2}\/?([\w.-]+(?:\/[\w.-]+)*\.[A-Za-z]{1,5})`/g
const VERB_TOKEN = /`argo\s+([\w-]+)/g

function checkFile(cwd: string, file: string, knownVerbs: string[] | undefined, waivers: CommentCheckWaiver[]): CommentRefsFinding[] {
  const text = readFileSync(join(cwd, file), 'utf8')
  const findings: CommentRefsFinding[] = []
  const dir = dirname(file)

  if (!isWaived(waivers, 'unresolved-file-reference', file)) {
    for (const match of text.matchAll(FILE_TOKEN)) {
      const token = match[1]
      const relTo = dir === '.' ? token : join(dir, token)
      if (!existsSync(join(cwd, relTo)) && !existsSync(join(cwd, token))) {
        findings.push({ rule: 'unresolved-file-reference', file, token })
      }
    }
  }

  if (knownVerbs && !isWaived(waivers, 'unresolved-verb', file)) {
    const known = new Set(knownVerbs)
    for (const match of text.matchAll(VERB_TOKEN)) {
      const token = match[1]
      if (!known.has(token)) {
        findings.push({ rule: 'unresolved-verb', file, token })
      }
    }
  }

  return findings
}

const DOC_EXTENSIONS = new Set(['.md', '.mdx'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'build', 'out', 'coverage'])

function listDocFiles(cwd: string, entryPath: string): string[] {
  const st = statSync(join(cwd, entryPath))
  if (st.isFile()) return [entryPath]
  if (!st.isDirectory()) return []
  const out: string[] = []
  for (const name of readdirSync(join(cwd, entryPath))) {
    if (SKIP_DIRS.has(name)) continue
    const childRel = entryPath === '.' ? name : `${entryPath}/${name}`
    const childSt = statSync(join(cwd, childRel))
    if (childSt.isDirectory()) out.push(...listDocFiles(cwd, childRel))
    else if (DOC_EXTENSIONS.has(name.slice(name.lastIndexOf('.')))) out.push(childRel)
  }
  return out
}

export function runCommentRefsCheck(opts: CommentRefsCheckOptions): { findings: CommentRefsFinding[] } {
  const cwd = opts.cwd ?? process.cwd()
  const waivers = opts.waivers ?? []
  const files = opts.paths.flatMap((p) => listDocFiles(cwd, p))
  const findings = files.flatMap((f) => checkFile(cwd, f, opts.knownVerbs, waivers))
  return { findings }
}
