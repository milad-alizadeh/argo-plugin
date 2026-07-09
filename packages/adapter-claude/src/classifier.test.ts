import { GIT_HISTORY_MUTATION } from '@argohq/core'
import { describe, expect, it } from 'vitest'
import {
  FIGMA_READ,
  FIGMA_WRITE,
  FILE_EDIT,
  FILE_READ,
  GIT_COMMIT,
  TEST_RUN,
  UNCLASSIFIED,
  WEB_FETCH,
  classifyAction,
  classifyBashCommand,
  classifyFigmaScript
} from './classifier.js'

describe('classifyBashCommand — git-history-mutation (audit 1.2)', () => {
  it('classifies `git reset` as git-history-mutation', () => {
    expect(classifyBashCommand('git reset --hard HEAD~1')).toBe(GIT_HISTORY_MUTATION)
  })

  it('classifies `git commit --amend` as git-history-mutation', () => {
    expect(classifyBashCommand('git commit --amend -m "oops"')).toBe(GIT_HISTORY_MUTATION)
  })

  it('classifies `git rebase` as git-history-mutation', () => {
    expect(classifyBashCommand('git rebase main')).toBe(GIT_HISTORY_MUTATION)
  })

  it('classifies `git checkout -- <path>` (tracked-path revert) as git-history-mutation', () => {
    expect(classifyBashCommand('git checkout -- src/tests/foo.test.ts')).toBe(GIT_HISTORY_MUTATION)
  })

  it('classifies `git filter-branch` as git-history-mutation', () => {
    expect(classifyBashCommand('git filter-branch --force --index-filter "git rm --cached x"')).toBe(
      GIT_HISTORY_MUTATION
    )
  })

  it('classifies a benign `git status` as unclassified', () => {
    expect(classifyBashCommand('git status')).toBe(UNCLASSIFIED)
  })

  it('fails closed to git-history-mutation on an ambiguous compound command', () => {
    expect(classifyBashCommand('git status && git commit --amend -m "sneaky"')).toBe(GIT_HISTORY_MUTATION)
  })

  it('fails closed to git-history-mutation on a compound command with the destructive half first', () => {
    expect(classifyBashCommand('git reset --hard && git status')).toBe(GIT_HISTORY_MUTATION)
  })

  it('classifies a plain `git commit` as git-commit', () => {
    expect(classifyBashCommand('git commit -m "add feature"')).toBe(GIT_COMMIT)
  })

  it('classifies a test-runner invocation as test-run', () => {
    expect(classifyBashCommand('bun test packages/core')).toBe(TEST_RUN)
    expect(classifyBashCommand('npm run test')).toBe(TEST_RUN)
    expect(classifyBashCommand('vitest run')).toBe(TEST_RUN)
  })

  it('classifies an unrelated command as unclassified', () => {
    expect(classifyBashCommand('ls -la')).toBe(UNCLASSIFIED)
  })

  it('does NOT enumerate a hypothetical future destructive command not in the list (documented, not a bug)', () => {
    // `git purge-history` is not a real git subcommand and is not in
    // GIT_HISTORY_MUTATION_PATTERNS — this asserts the fall-through is
    // UNCLASSIFIED, proving the classifier's safety rests on the enumerated
    // list being deny-tagged, not on catching everything unrecognized.
    expect(classifyBashCommand('git purge-history --everything')).toBe(UNCLASSIFIED)
  })
})

describe('classifyFigmaScript', () => {
  it('classifies a node-creation script as figma-write', () => {
    expect(classifyFigmaScript('const frame = figma.currentPage.appendChild(figma.createFrame())')).toBe(FIGMA_WRITE)
  })

  it('classifies a node-removal script as figma-write', () => {
    expect(classifyFigmaScript('node.remove()')).toBe(FIGMA_WRITE)
  })

  it('classifies a property-assignment script as figma-write', () => {
    expect(classifyFigmaScript('node.fills = [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }]')).toBe(FIGMA_WRITE)
  })

  it('classifies a read-only lookup script as figma-read', () => {
    expect(classifyFigmaScript('const node = figma.getNodeById("123:456")')).toBe(FIGMA_READ)
  })

  it('classifies a findAll traversal as figma-read', () => {
    expect(classifyFigmaScript('figma.currentPage.findAll(n => n.type === "TEXT")')).toBe(FIGMA_READ)
  })

  it('classifies a script with both read and write calls as figma-write (stricter wins)', () => {
    expect(classifyFigmaScript('const node = figma.getNodeById("1:2"); node.remove()')).toBe(FIGMA_WRITE)
  })

  it('classifies an unrecognized script as unclassified', () => {
    expect(classifyFigmaScript('console.log("hello")')).toBe(UNCLASSIFIED)
  })
})

describe('classifyAction', () => {
  it('classifies Edit/Write/NotebookEdit tool calls as file-edit', () => {
    expect(classifyAction('Edit', { file_path: '/x', old_string: 'a', new_string: 'b' })).toBe(FILE_EDIT)
    expect(classifyAction('Write', { file_path: '/x', content: 'y' })).toBe(FILE_EDIT)
    expect(classifyAction('NotebookEdit', { notebook_path: '/x.ipynb' })).toBe(FILE_EDIT)
  })

  it('classifies Read tool calls as file-read', () => {
    expect(classifyAction('Read', { file_path: '/x' })).toBe(FILE_READ)
  })

  it('classifies WebFetch tool calls as web-fetch', () => {
    expect(classifyAction('WebFetch', { url: 'https://example.com' })).toBe(WEB_FETCH)
  })

  it('classifies Bash tool calls by delegating to classifyBashCommand', () => {
    expect(classifyAction('Bash', { command: 'git commit --amend' })).toBe(GIT_HISTORY_MUTATION)
    expect(classifyAction('Bash', { command: 'git status' })).toBe(UNCLASSIFIED)
  })

  it('classifies mcp__plugin_figma_figma__use_figma tool calls by script-sniffing the script/code field', () => {
    expect(classifyAction('mcp__plugin_figma_figma__use_figma', { script: 'figma.createFrame()' })).toBe(FIGMA_WRITE)
    expect(classifyAction('mcp__plugin_figma_figma__use_figma', { code: 'figma.getNodeById("1:1")' })).toBe(FIGMA_READ)
  })

  it('classifies an unrecognized tool name as unclassified', () => {
    expect(classifyAction('SomeFutureTool', { anything: true })).toBe(UNCLASSIFIED)
  })

  it('classifies a Bash call with a non-string command as unclassified rather than throwing', () => {
    expect(classifyAction('Bash', {})).toBe(UNCLASSIFIED)
    expect(classifyAction('Bash', undefined)).toBe(UNCLASSIFIED)
  })
})
