import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { PlaywrightReporter } from '../packages/kit/src/reporters/playwright/index.js'

// Validate against the real tdd-guard contract, resolved from the reporter's own deps.
const requireFromReporter = createRequire(
  fileURLToPath(new URL('../packages/kit/src/reporters/playwright/index.js', import.meta.url)),
)
const { TestResultSchema, isTestPassing } = requireFromReporter(
  'tdd-guard/dist/contracts/schemas/reporterSchemas.js',
)

const FILE_A = '/repo/e2e/roster.spec.ts'
const FILE_B = '/repo/e2e/detail.spec.ts'

function fakeTest({ id = 't1', title = 'shows roster', file = FILE_A, project = 'chromium', suites = [] } = {}) {
  return {
    id,
    title,
    location: { file, line: 1, column: 1 },
    titlePath: () => ['', project, 'e2e/roster.spec.ts', ...suites, title],
  }
}

function fakeResult(over = {}) {
  return { status: 'passed', errors: [], duration: 10, retry: 0, ...over }
}

describe('tdd-guard-playwright reporter — writes the tdd-guard test.json contract', () => {
  let root, reporter

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'argo-tgpw-'))
    reporter = new PlaywrightReporter({ projectRoot: root })
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const written = () =>
    JSON.parse(readFileSync(join(root, '.claude', 'tdd-guard', 'data', 'test.json'), 'utf8'))

  async function run(events, endStatus = 'failed') {
    for (const [test, result] of events) reporter.onTestEnd(test, result)
    await reporter.onEnd({ status: endStatus })
  }

  it('writes to <projectRoot>/.claude/tdd-guard/data/test.json and matches the zod schema', async () => {
    await run([[fakeTest(), fakeResult()]], 'passed')
    const output = written()
    expect(TestResultSchema.safeParse(output).success).toBe(true)
    expect(isTestPassing(output)).toBe(true)
  })

  it('passing test → state "passed", no errors key, project-prefixed fullName', async () => {
    await run([[fakeTest({ suites: ['fleet'] }), fakeResult()]], 'passed')
    expect(written().testModules).toEqual([
      {
        moduleId: FILE_A,
        tests: [
          { name: 'shows roster', fullName: 'chromium > fleet > shows roster', state: 'passed' },
        ],
      },
    ])
  })

  it('failing test → state "failed" with message and stack, ANSI stripped', async () => {
    const result = fakeResult({
      status: 'failed',
      errors: [{ message: 'expect(\u001b[31mreceived\u001b[39m).toBe(5)', stack: '\u001b[2mat roster.spec.ts:9\u001b[22m' }],
    })
    await run([[fakeTest(), result]])
    const [test] = written().testModules[0].tests
    expect(test.state).toBe('failed')
    expect(test.errors).toEqual([
      { message: 'expect(received).toBe(5)', stack: 'at roster.spec.ts:9' },
    ])
    expect(isTestPassing(written())).toBe(false)
  })

  it('skipped test → state "skipped"', async () => {
    await run([[fakeTest(), fakeResult({ status: 'skipped' })]], 'passed')
    expect(written().testModules[0].tests[0].state).toBe('skipped')
  })

  it('timedOut → failed, with a synthesized message when Playwright attaches no error', async () => {
    await run([[fakeTest(), fakeResult({ status: 'timedOut', duration: 500 })]])
    const [test] = written().testModules[0].tests
    expect(test.state).toBe('failed')
    expect(test.errors[0].message).toMatch(/timed out after 500ms/)
  })

  it('interrupted test status → failed', async () => {
    await run([[fakeTest(), fakeResult({ status: 'interrupted' })]])
    expect(written().testModules[0].tests[0].state).toBe('failed')
  })

  it('retries: only the LAST result for a test id is reported (failed attempt superseded)', async () => {
    const test = fakeTest()
    await run(
      [
        [test, fakeResult({ status: 'failed', retry: 0, errors: [{ message: 'boom' }] })],
        [test, fakeResult({ status: 'passed', retry: 1 })],
      ],
      'passed',
    )
    const tests = written().testModules[0].tests
    expect(tests).toHaveLength(1)
    expect(tests[0].state).toBe('passed')
    expect(tests[0].errors).toBeUndefined()
  })

  it('multiple projects: same title reported per-project, distinguishable via fullName', async () => {
    await run(
      [
        [fakeTest({ id: 'p1' }), fakeResult()],
        [fakeTest({ id: 'p2', project: 'electron' }), fakeResult({ status: 'failed', errors: [{ message: 'nope' }] })],
      ],
    )
    const tests = written().testModules[0].tests
    expect(tests.map((t) => t.fullName)).toEqual([
      'chromium > shows roster',
      'electron > shows roster',
    ])
    expect(tests.map((t) => t.state)).toEqual(['passed', 'failed'])
  })

  it('groups tests by file into separate testModules', async () => {
    await run(
      [
        [fakeTest({ id: 'a' }), fakeResult()],
        [fakeTest({ id: 'b', file: FILE_B, title: 'shows detail' }), fakeResult()],
      ],
      'passed',
    )
    expect(written().testModules.map((m) => m.moduleId)).toEqual([FILE_A, FILE_B])
  })

  it('onError → unhandledErrors entries with name/message/stack', async () => {
    reporter.onError({ name: 'TypeError', message: 'x is not a function', stack: 'TypeError: x…' })
    await run([[fakeTest(), fakeResult()]], 'passed')
    expect(written().unhandledErrors).toEqual([
      { name: 'TypeError', message: 'x is not a function', stack: 'TypeError: x…' },
    ])
    expect(TestResultSchema.safeParse(written()).success).toBe(true)
  })

  it('run reason maps: passed → passed, failed → failed, interrupted → interrupted', async () => {
    await run([[fakeTest(), fakeResult()]], 'passed')
    expect(written().reason).toBe('passed')
    await reporter.onEnd({ status: 'timedout' })
    expect(written().reason).toBe('failed')
    await reporter.onEnd({ status: 'interrupted' })
    expect(written().reason).toBe('interrupted')
  })

  it('empty run still writes a schema-valid file that is NOT passing (no vacuous green)', async () => {
    await run([], 'passed')
    const output = written()
    expect(TestResultSchema.safeParse(output).success).toBe(true)
    expect(isTestPassing(output)).toBe(false)
  })

  it('two reporter instances run sequentially: the file holds only the SECOND instance\'s results (last-write-wins, no merge)', async () => {
    // beforeEach's `reporter` stands in for the FIRST run
    await run([[fakeTest({ id: 'a' }), fakeResult()]], 'passed')
    // a second, independent run (e.g. a re-run) uses a fresh reporter instance
    const second = new PlaywrightReporter({ projectRoot: root })
    second.onTestEnd(fakeTest({ id: 'b', title: 'shows detail' }), fakeResult())
    await second.onEnd({ status: 'passed' })
    expect(written().testModules).toEqual([
      { moduleId: FILE_A, tests: [{ name: 'shows detail', fullName: 'chromium > shows detail', state: 'passed' }] },
    ])
  })

  it('accepts an injected storage (sibling-reporter convention)', async () => {
    const saved = []
    const custom = new PlaywrightReporter({ storage: { saveTest: async (c) => saved.push(c) } })
    custom.onTestEnd(fakeTest(), fakeResult())
    await custom.onEnd({ status: 'passed' })
    expect(saved).toHaveLength(1)
    expect(JSON.parse(saved[0]).reason).toBe('passed')
  })
})
