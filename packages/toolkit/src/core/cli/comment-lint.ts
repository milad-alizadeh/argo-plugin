import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isWaived, type CommentCheckWaiver } from './comment-check-waivers.js'

export interface CommentLintFinding {
  rule: 'comment-referential' | 'comment-narrative' | 'comment-ratio'
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
const MAX_COMMENT_RATIO = 0.5

// A referential token names a real FILE (known source/asset extension) or an
// explicit path. Restricting to real extensions avoids flagging code symbols
// mentioned in prose (`core.judge`, `e.g.`), which are not file references.
const FILE_EXT = 'ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|html|ya?ml|sh|py|go|rs|toml|txt'
const REFERENTIAL_TOKEN = new RegExp(`(?:^|[\\s"'\`(])(?:\\.{0,2}\\/)?[\\w-]+(?:\\/[\\w.-]+)*\\.(?:${FILE_EXT})\\b`, 'i')

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
  paragraphs: number
  isJsDoc: boolean
}

/** Paragraphs = maximal runs of non-blank content lines. A blank line inside a
 * comment separates paragraphs; two paragraphs is the narrative smell the rule
 * targets, so a single dense multi-line WHY (one paragraph) is not flagged. */
function countParagraphs(contentLines: string[]): number {
  let paragraphs = 0
  let inParagraph = false
  for (const l of contentLines) {
    if (l.trim().length > 0) {
      if (!inParagraph) paragraphs++
      inParagraph = true
    } else {
      inParagraph = false
    }
  }
  return paragraphs
}

/** Extracts `//`/`#` runs (consecutive line comments coalesced into one block)
 * and `/* *​/` blocks, with no per-language string-literal awareness since the
 * check is deliberately language-agnostic. JSDoc (`/**`) is marked so it can be
 * exempted: it is contract documentation on exports, not narrative rationale. */
function extractCommentBlocks(source: string): CommentBlock[] {
  const lines = source.split('\n')
  const blocks: CommentBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const blockStart = line.indexOf('/*')

    if (blockStart !== -1 && !line.slice(0, blockStart).match(/['"`]/)) {
      let text = line.slice(blockStart)
      const startLine = i + 1
      let j = i
      while (!text.includes('*/') && j + 1 < lines.length) {
        j++
        text += '\n' + lines[j]
      }
      const inner = text.split('\n').map((l) => l.replace(/^\s*\/?\*+/, '').replace(/\*\/\s*$/, ''))
      blocks.push({
        startLine,
        lineCount: j - i + 1,
        text,
        paragraphs: countParagraphs(inner),
        isJsDoc: text.trimStart().startsWith('/**')
      })
      i = j + 1
      continue
    }

    if (line.match(/(^|\s)(\/\/|#)/)) {
      const startLine = i + 1
      const contentLines: string[] = []
      let text = ''
      let j = i
      while (j < lines.length) {
        const m = lines[j].match(/(^|\s)(\/\/|#)/)
        if (!m) break
        const marker = m[2]
        const idx = lines[j].indexOf(marker, m.index)
        contentLines.push(lines[j].slice(idx + marker.length))
        text += (text ? '\n' : '') + lines[j].slice(idx)
        j++
      }
      blocks.push({ startLine, lineCount: j - i, text, paragraphs: countParagraphs(contentLines), isJsDoc: false })
      i = j
      continue
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
    if (!block.isJsDoc && !isWaived(waivers, 'comment-referential', file) && REFERENTIAL_TOKEN.test(block.text)) {
      findings.push({
        rule: 'comment-referential',
        file,
        line: block.startLine,
        detail: 'comment names a file/path/"see X" reference — fix the naming instead of pointing at it'
      })
    }
    if (!block.isJsDoc && !isWaived(waivers, 'comment-narrative', file) && block.paragraphs >= 2) {
      findings.push({
        rule: 'comment-narrative',
        file,
        line: block.startLine,
        detail: `comment spans ${block.paragraphs} paragraphs — multi-paragraph rationale belongs in the commit message`
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
