// Standalone worker process, kept as a real subprocess entry point (not
// inlined) because the point of its test is genuine OS-level contention on
// the advisory lock, which two in-process calls can never exercise:
// synchronous fs calls never yield the event loop.
import { recordAttempt } from '../state.ts'

const [key, round, stateRoot, cwd] = process.argv.slice(2)

recordAttempt(key, { round: Number(round), gate: 'concurrency-fixture-gate', findings: [], whatWasTried: `writer-${round}` }, { stateRoot, cwd })
