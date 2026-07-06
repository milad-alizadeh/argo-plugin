/**
 * Playwright reporter for TDD Guard (https://github.com/nizos/tdd-guard).
 *
 * Writes the same JSON contract as tdd-guard-vitest / tdd-guard-jest to
 * `<projectRoot>/.claude/tdd-guard/data/test.json` via tdd-guard's FileStorage:
 *
 *   {
 *     "testModules": [{ "moduleId": "<abs test file>", "tests": [
 *       { "name", "fullName", "state": "passed"|"failed"|"skipped",
 *         "errors"?: [{ "message", "stack"? }] }
 *     ]}],
 *     "unhandledErrors": [{ "name", "message", "stack"? }],
 *     "reason": "passed"|"failed"|"interrupted"
 *   }
 *
 * Semantics: retries report the LAST result only; timedOut/interrupted tests are
 * failures; skipped tests are "skipped"; multi-project runs (chromium/electron)
 * prefix fullName with the project name so duplicates stay distinguishable.
 *
 * Reporter/test/result params are typed loosely (`any`) rather than against
 * `@playwright/test/reporter`'s full `Reporter`/`TestCase`/`TestResult`
 * interfaces — this migration adds compile-time typing to the module's own
 * logic, not a full Playwright reporter-API model.
 */
import { FileStorage, Config } from 'tdd-guard'

// eslint-disable-next-line no-control-regex -- ANSI escape sequences are control chars by definition
const ANSI_PATTERN = /\[[0-9;]*m/g

const STATE_BY_STATUS: Record<string, string> = {
  passed: 'passed',
  failed: 'failed',
  timedOut: 'failed',
  interrupted: 'failed',
  skipped: 'skipped',
}

export class PlaywrightReporter {
  private storage: { saveTest: (contents: string) => Promise<void> }
  private modules: Map<string, Map<string, any>>
  private unhandledErrors: any[]

  constructor(options: { storage?: { saveTest: (contents: string) => Promise<void> }; projectRoot?: string } = {}) {
    this.storage =
      options.storage ?? new (FileStorage as any)(new (Config as any)({ projectRoot: options.projectRoot }))
    // moduleId -> Map(testId -> formatted test); insertion order preserved
    this.modules = new Map()
    this.unhandledErrors = []
  }

  // Keep Playwright's default terminal reporters intact when this is one of several.
  printsToStdio() {
    return false
  }

  onTestEnd(test: any, result: any) {
    const moduleId = test.location?.file ?? 'unknown'
    if (!this.modules.has(moduleId)) {
      this.modules.set(moduleId, new Map())
    }
    // Keyed by test id: a retry's later onTestEnd overwrites the earlier attempt,
    // so only the final attempt is reported.
    this.modules.get(moduleId)!.set(test.id, formatTest(test, result))
  }

  onError(error: any) {
    this.unhandledErrors.push({
      name: typeof error?.name === 'string' ? error.name : 'Error',
      message: stripAnsi(String(error?.message ?? error?.value ?? 'Unknown error')),
      stack: typeof error?.stack === 'string' ? stripAnsi(error.stack) : undefined,
    })
  }

  // Last-write-wins is intentional: tdd-guard reads a single current snapshot, not a
  // merged history — a later reporter instance's onEnd fully replaces this file's contents.
  async onEnd(result: any) {
    const output = {
      testModules: Array.from(this.modules.entries()).map(([moduleId, tests]) => ({
        moduleId,
        tests: Array.from(tests.values()),
      })),
      unhandledErrors: this.unhandledErrors,
      reason: runReason(result),
    }
    await this.storage.saveTest(JSON.stringify(output, null, 2))
  }
}

function formatTest(test: any, result: any) {
  const formatted: any = {
    name: test.title,
    fullName: fullName(test),
    state: STATE_BY_STATUS[result.status] ?? 'failed',
  }
  const errors = collectErrors(result)
  if (errors.length > 0) {
    formatted.errors = errors
  }
  return formatted
}

// titlePath() is ['', projectName, file, ...describe titles, test title].
// Drop the empty root and the file path (already carried by moduleId); keep the
// project name so chromium/electron runs of the same test stay distinguishable.
function fullName(test: any): string {
  const path = typeof test.titlePath === 'function' ? test.titlePath() : [test.title]
  const file = test.location?.file ?? ''
  const parts = path.filter((part: string) => part !== '' && part !== file && !file.endsWith(part))
  return parts.join(' > ') || test.title
}

function collectErrors(result: any) {
  const errors = result.errors?.length ? result.errors : result.error ? [result.error] : []
  const formatted = errors.map((error: any) => {
    const entry: any = {
      message: stripAnsi(String(error?.message ?? error?.value ?? 'Unknown error')),
    }
    if (typeof error?.stack === 'string') {
      entry.stack = stripAnsi(error.stack)
    }
    return entry
  })
  // A timeout may carry no error object — the schema still needs a failure message.
  if (formatted.length === 0 && result.status === 'timedOut') {
    formatted.push({ message: `Test timed out after ${result.duration}ms` })
  }
  return formatted
}

function runReason(result: any): string {
  if (result?.status === 'interrupted') return 'interrupted'
  if (result?.status === 'passed') return 'passed'
  return 'failed'
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}
