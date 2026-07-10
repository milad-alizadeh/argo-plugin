import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isWaived, type CommentCheckWaiver } from './comment-check-waivers.js'

export interface CommentLintFinding {
  rule: 'comment-referential' | 'comment-block-length' | 'comment-ratio'
  file: string
  line: number
  detail: string
}

export interface CommentLintOptions {
  cwd?: string
  /** Files or directories, relative to `cwd`. Directories are walked recursively. */
  paths: string[]
  waivers?: CommentCheckWaiver[]
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.sh', '.rb'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'build', 'out', 'coverage'])
const MAX_BLOCK_LINES = 2
const MAX_COMMENT_RATIO = 0.5

const REFERENTIAL_TOKEN = /(?:^|[\s"'`(])(?:see\s+)?(?:\.{0,2}\/)?[\w-]+(?:\/[\w.-]+)*\.[A-Za-z]{1,5}\b|\bsee\s+[\w.]+/i

function listSourceFiles(cwd: string, entryPath: string): string[] {
  const abs = join(cwd, entryPath)
  const st = statSync(abs)
  if (st.isFile()) return [entryPath]
  if (!st.isDirectory()) return []

  const out: string[] = []
  for (const name of readdirSync(abs)) {
    if (SKIP_DIRS.has(name)) continue
    const childRel = entryPath === '.' ? name : `${entryPath}/${name}`
    const childAbs = join(cwd, childRel)
    const childSt = statSync(childAbs)
    if (childSt.isDirectory()) {
      out.push(...listSourceFiles(cwd, childRel))
    } else if (SOURCE_EXTENSIONS.has(extensionOf(name))) {
      out.push(childRel)
    }
  }
  return out
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '' : name.slice(idx)
}

interface CommentBlock {
  startLine: number
  lineCount: number
  text: string
}

/** Extracts `//`, `#`, and block comments line by line, with no per-language string-literal awareness, since the check is deliberately language-agnostic. */
function extractCommentBlocks(source: string): CommentBlock[] {
  const lines = source.split('\n')
  const blocks: CommentBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const blockStart = line.indexOf('/*')
    const lineStart = line.match(/(^|\s)(\/\/|#)/)

    if (blockStart !== -1 && !line.slice(0, blockStart).match(/['"`]/)) {
      let text = line.slice(blockStart)
      const startLine = i + 1
      let j = i
      while (!text.includes('*/') && j + 1 < lines.length) {
        j++
        text += '\n' + lines[j]
      }
      blocks.push({ startLine, lineCount: j - i + 1, text })
      i = j + 1
      continue
    }

    if (lineStart) {
      const marker = lineStart[2]
      const idx = line.indexOf(marker, lineStart.index)
      blocks.push({ startLine: i + 1, lineCount: 1, text: line.slice(idx) })
    }
    i++
  }
  return blocks
}

function checkFile(cwd: string, file: string, waivers: CommentCheckWaiver[]): CommentLintFinding[] {
  const source = readFileSync(join(cwd, file), 'utf8')
  const blocks = extractCommentBlocks(source)
  const findings: CommentLintFinding[] = []

  for (const block of blocks) {
    if (!isWaived(waivers, 'comment-referential', file) && REFERENTIAL_TOKEN.test(block.text)) {
      findings.push({
        rule: 'comment-referential',
        file,
        line: block.startLine,
        detail: 'comment names a file/path/"see X" reference — fix the naming instead of pointing at it'
      })
    }
    if (!isWaived(waivers, 'comment-block-length', file) && block.lineCount > MAX_BLOCK_LINES) {
      findings.push({
        rule: 'comment-block-length',
        file,
        line: block.startLine,
        detail: `comment block spans ${block.lineCount} lines (max ${MAX_BLOCK_LINES}) — move rationale to the commit message`
      })
    }
  }

  if (!isWaived(waivers, 'comment-ratio', file)) {
    const totalLines = source.split('\n').filter((l) => l.trim().length > 0).length
    const commentLines = blocks.reduce((sum, b) => sum + b.lineCount, 0)
    if (totalLines > 0 && commentLines / totalLines > MAX_COMMENT_RATIO) {
      findings.push({
        rule: 'comment-ratio',
        file,
        line: 1,
        detail: `comment-to-code ratio ${(commentLines / totalLines).toFixed(2)} exceeds advisory ceiling ${MAX_COMMENT_RATIO}`
      })
    }
  }

  return findings
}

export function runCommentLint(opts: CommentLintOptions): { findings: CommentLintFinding[] } {
  const cwd = opts.cwd ?? process.cwd()
  const waivers = opts.waivers ?? []
  const files = opts.paths.flatMap((p) => listSourceFiles(cwd, p))
  const findings = files.flatMap((f) => checkFile(cwd, f, waivers))
  return { findings }
}
