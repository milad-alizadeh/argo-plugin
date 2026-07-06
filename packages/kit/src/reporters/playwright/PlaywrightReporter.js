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
 */
import { FileStorage, Config } from 'tdd-guard'

// eslint-disable-next-line no-control-regex -- ANSI escape sequences are control chars by definition
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g

const STATE_BY_STATUS = {
  passed: 'passed',
  failed: 'failed',
  timedOut: 'failed',
  interrupted: 'failed',
  skipped: 'skipped',
}

export class PlaywrightReporter {
  constructor(options = {}) {
    this.storage =
      options.storage ?? new FileStorage(new Config({ projectRoot: options.projectRoot }))
    // moduleId -> Map(testId -> formatted test); insertion order preserved
    this.modules = new Map()
    this.unhandledErrors = []
  }

  // Keep Playwright's default terminal reporters intact when this is one of several.
  printsToStdio() {
    return false
  }

  onTestEnd(test, result) {
    const moduleId = test.location?.file ?? 'unknown'
    if (!this.modules.has(moduleId)) {
      this.modules.set(moduleId, new Map())
    }
    // Keyed by test id: a retry's later onTestEnd overwrites the earlier attempt,
    // so only the final attempt is reported.
    this.modules.get(moduleId).set(test.id, formatTest(test, result))
  }

  onError(error) {
    this.unhandledErrors.push({
      name: typeof error?.name === 'string' ? error.name : 'Error',
      message: stripAnsi(String(error?.message ?? error?.value ?? 'Unknown error')),
      stack: typeof error?.stack === 'string' ? stripAnsi(error.stack) : undefined,
    })
  }

  // Last-write-wins is intentional: tdd-guard reads a single current snapshot, not a
  // merged history — a later reporter instance's onEnd fully replaces this file's contents.
  async onEnd(result) {
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

function formatTest(test, result) {
  const formatted = {
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
function fullName(test) {
  const path = typeof test.titlePath === 'function' ? test.titlePath() : [test.title]
  const file = test.location?.file ?? ''
  const parts = path.filter((part) => part !== '' && part !== file && !file.endsWith(part))
  return parts.join(' > ') || test.title
}

function collectErrors(result) {
  const errors = result.errors?.length ? result.errors : result.error ? [result.error] : []
  const formatted = errors.map((error) => {
    const entry = {
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

function runReason(result) {
  if (result?.status === 'interrupted') return 'interrupted'
  if (result?.status === 'passed') return 'passed'
  return 'failed'
}

function stripAnsi(text) {
  return text.replace(ANSI_PATTERN, '')
}
