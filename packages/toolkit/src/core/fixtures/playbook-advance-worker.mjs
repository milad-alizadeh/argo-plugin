// Standalone worker process for playbook-advance.test.ts's non-vacuous
// concurrency test — invoked as `node playbook-advance-worker.mjs <key>
// <playbookName> <gateName> <stateRoot> <cwd>`. A real subprocess (not an
// in-process call), so two workers genuinely race the same instance file's
// stage/status read-modify-write. Plain .mjs importing the BUILT `dist/`
// output (not the .ts source) — playbookAdvance's own runtime imports use
// `.js` specifiers that only resolve against compiled output, unlike
// state.ts's worker sibling, which only needed state.ts's type-only imports.
import { registerGate } from '../../../dist/core/gate.js'
import { definePlaybook, registerPlaybook } from '../../../dist/core/spec.js'
import { playbookAdvance } from '../../../dist/core/cli/playbook-advance.js'

const [key, playbookName, gateName, stateRoot, cwd] = process.argv.slice(2)

registerGate({
  name: gateName,
  async check() {
    return { passed: false, findings: [{ message: 'always fails' }], evidence: [] }
  }
})
registerPlaybook(
  definePlaybook({
    name: playbookName,
    stages: [{ name: 'build', allows: ['file-edit'], gate: gateName, retries: 10 }]
  })
)

await playbookAdvance(key, { cwd, stateRoot })
