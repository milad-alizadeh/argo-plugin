import { spawnSync } from 'node:child_process'
import { type GateVerdict, type JudgeRequest, registerJudge } from '../core/index.js'

// The adapter's `core.judge` implementation. Spawns a FRESH, blind session
// fed only the spec's artifact URIs, never a working transcript. The spawn
// mechanism is injected as a `SessionSpawner` so this module stays testable
// without a live session.

/** What actually gets sent to the spawned session. Deliberately has no
 * transcript-shaped field, so a caller cannot widen this without editing
 * this module. */
export interface SessionSpawnRequest {
  artifacts: Record<string, string>
}

export type SessionSpawner = (request: SessionSpawnRequest) => Promise<GateVerdict>

/** Builds a `core.judge`-shaped function around an injected session spawner.
 * Exported standalone (not just via `registerClaudeJudge`) so tests can
 * exercise the request-shaping logic without touching the module-level
 * judge registry singleton. */
export function createJudgeImpl(spawnSession: SessionSpawner) {
  return async (request: JudgeRequest): Promise<GateVerdict> => {
    // Forward ONLY `artifacts`, so a future caller widening JudgeRequest can't
    // accidentally leak extra fields into the spawned session.
    return spawnSession({ artifacts: request.artifacts })
  }
}

/** Registers the Claude-adapter's `core.judge` implementation at adapter startup. */
export function registerClaudeJudge(spawnSession: SessionSpawner): void {
  registerJudge(createJudgeImpl(spawnSession))
}

/** Production `SessionSpawner`: spawns a headless, blind `claude -p` process
 * fed ONLY the request's artifact URIs, never a transcript, instructed to
 * respond with JSON only, and parses that JSON into a `GateVerdict`. The
 * subprocess call is injected as `runClaude` so this stays unit-testable
 * without shelling out for real. */
export interface ClaudeProcessResult {
  stdout: string
  status: number | null
}

export type RunClaudeFn = (args: string[]) => ClaudeProcessResult

/** Default `runClaude`: `spawnSync('claude', ['-p', prompt])`. Not called by
 * any test — tests inject a fake `runClaude` instead. */
function defaultRunClaude(args: string[]): ClaudeProcessResult {
  const result = spawnSync('claude', args, { encoding: 'utf8' })
  return { stdout: result.stdout ?? '', status: result.status }
}

/** Builds the headless judge prompt: lists each artifact by key + URI/path
 * and instructs JSON-only output shaped like `GateVerdict`. Deliberately
 * carries no transcript/working-session content — only what's already in
 * `request.artifacts`. */
export function buildJudgePrompt(request: SessionSpawnRequest): string {
  const artifactLines = Object.entries(request.artifacts)
    .map(([key, uri]) => `- ${key}: ${uri}`)
    .join('\n')
  return [
    'You are a blind reviewer judging a finished artifact against a brief/spec.',
    'You have NOT seen any working session or transcript — judge only from the artifacts below.',
    '',
    'Artifacts:',
    artifactLines,
    '',
    'Respond with ONLY a single JSON object, no prose, no markdown fences, matching exactly:',
    '{"passed": boolean, "findings": [{"message": string}], "evidence": [string]}',
    '`passed` is true only if the finished artifact satisfies the brief/spec. `findings` lists',
    'any mismatches (empty array if none). `evidence` lists the artifact URIs you judged from.'
  ].join('\n')
}

/** Parses a headless judge process's stdout into a `GateVerdict`. Tolerates
 * the model wrapping the JSON in prose or markdown fences by extracting the
 * first `{...}` block. Throws if no valid JSON object is found — a judge gate
 * failing to produce a verdict is a hard error, not a silent pass/fail. */
export function parseJudgeVerdict(stdout: string): GateVerdict {
  const match = stdout.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error(`judge-impl: no JSON object found in headless claude output: ${stdout.slice(0, 200)}`)
  }
  const parsed = JSON.parse(match[0]) as {
    passed?: unknown
    findings?: unknown
    evidence?: unknown
    rerunnable?: unknown
  }
  const verdict: GateVerdict = {
    passed: parsed.passed === true,
    findings: Array.isArray(parsed.findings) ? parsed.findings : [],
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence : []
  }
  if (typeof parsed.rerunnable === 'boolean') verdict.rerunnable = parsed.rerunnable
  return verdict
}

/** Builds a `SessionSpawner` around a headless `claude -p` invocation.
 * `runClaude` defaults to a real `spawnSync('claude', ...)` call; tests
 * inject a fake to avoid shelling out. */
export function createHeadlessClaudeSpawner(runClaude: RunClaudeFn = defaultRunClaude): SessionSpawner {
  return async (request: SessionSpawnRequest): Promise<GateVerdict> => {
    const prompt = buildJudgePrompt(request)
    const result = runClaude(['-p', prompt])
    // A judge process that exited non-zero could not actually judge — surface
    // that as a hard failure rather than trusting whatever landed on stdout,
    // so a crashed/killed judge never silently reads as a passing verdict.
    if (result.status !== 0) {
      throw new Error(`judge-impl: headless claude process exited with status ${result.status}`)
    }
    return parseJudgeVerdict(result.stdout)
  }
}
