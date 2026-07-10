import type { GateVerdict, JudgeRequest } from '../core/index.js'
import { core } from '../core/index.js'
import { describe, expect, it } from 'vitest'
import {
  buildJudgePrompt,
  createHeadlessClaudeSpawner,
  createJudgeImpl,
  parseJudgeVerdict,
  registerClaudeJudge,
  type ClaudeProcessResult
} from './judge-impl.js'

describe('createJudgeImpl', () => {
  it('never passes a transcript-shaped field to the spawned session, only artifact URIs', async () => {
    let received: unknown
    const fakeVerdict: GateVerdict = { passed: true, findings: [], evidence: ['file:///tmp/shot.png'] }

    const judge = createJudgeImpl(async (request) => {
      received = request
      return fakeVerdict
    })

    // Simulate a caller that (incorrectly) widened the request with a
    // transcript-shaped field — createJudgeImpl must not forward it.
    const request = {
      artifacts: { screenshot: 'file:///tmp/shot.png' },
      transcript: ['some', 'working', 'session', 'messages']
    } as JudgeRequest & { transcript: string[] }

    await judge(request)

    expect(received).toEqual({ artifacts: { screenshot: 'file:///tmp/shot.png' } })
    expect(received).not.toHaveProperty('transcript')
  })

  it("round-trips the fake spawner's verdict through the returned function", async () => {
    const fakeVerdict: GateVerdict = {
      passed: false,
      findings: [{ message: 'brief mismatch' }],
      evidence: ['file:///tmp/shot.png'],
      rerunnable: true
    }
    const judge = createJudgeImpl(async () => fakeVerdict)

    const result = await judge({ artifacts: { screenshot: 'file:///tmp/shot.png' } })

    expect(result).toBe(fakeVerdict)
  })
})

describe('registerClaudeJudge', () => {
  it("registers the adapter's judge implementation so core.judge forwards to it, transcript-free", async () => {
    let received: unknown
    const fakeVerdict: GateVerdict = { passed: true, findings: [], evidence: [] }

    registerClaudeJudge(async (request) => {
      received = request
      return fakeVerdict
    })

    const result = await core.judge({ artifacts: { brief: 'file:///tmp/brief.md' } })

    expect(received).toEqual({ artifacts: { brief: 'file:///tmp/brief.md' } })
    expect(received).not.toHaveProperty('transcript')
    expect(result).toBe(fakeVerdict)
  })
})

describe('buildJudgePrompt', () => {
  it('lists every artifact by key + URI and instructs JSON-only output, carrying no working-session content', () => {
    const prompt = buildJudgePrompt({ artifacts: { brief: 'file:///tmp/brief.md', screenshot: 'file:///tmp/shot.png' } })

    expect(prompt).toContain('brief: file:///tmp/brief.md')
    expect(prompt).toContain('screenshot: file:///tmp/shot.png')
    expect(prompt).toContain('JSON')
    // The prompt itself only ever carries `SessionSpawnRequest.artifacts` —
    // no field on that type could smuggle transcript content in even if a
    // caller tried.
    expect(Object.keys({ artifacts: {} })).toEqual(['artifacts'])
  })
})

describe('parseJudgeVerdict', () => {
  it('parses a bare JSON verdict', () => {
    const verdict = parseJudgeVerdict('{"passed": true, "findings": [], "evidence": ["file:///tmp/shot.png"]}')
    expect(verdict).toEqual({ passed: true, findings: [], evidence: ['file:///tmp/shot.png'] })
  })

  it('extracts JSON wrapped in prose/markdown fences', () => {
    const raw = 'Here is my verdict:\n```json\n{"passed": false, "findings": [{"message": "off"}], "evidence": []}\n```'
    const verdict = parseJudgeVerdict(raw)
    expect(verdict).toEqual({ passed: false, findings: [{ message: 'off' }], evidence: [] })
  })

  it('carries rerunnable through when present', () => {
    const verdict = parseJudgeVerdict('{"passed": true, "findings": [], "evidence": [], "rerunnable": false}')
    expect(verdict.rerunnable).toBe(false)
  })

  it('throws when no JSON object is present', () => {
    expect(() => parseJudgeVerdict('no json here')).toThrow(/no JSON object/)
  })
})

describe('createHeadlessClaudeSpawner', () => {
  it('spawns `claude -p <prompt>` (via the injected runner, never a real shell-out) and parses its stdout', async () => {
    let capturedArgs: string[] = []
    const fakeRunClaude = (args: string[]): ClaudeProcessResult => {
      capturedArgs = args
      return { stdout: '{"passed": true, "findings": [], "evidence": ["file:///tmp/shot.png"]}', status: 0 }
    }
    const spawner = createHeadlessClaudeSpawner(fakeRunClaude)

    const verdict = await spawner({ artifacts: { brief: 'file:///tmp/brief.md', screenshot: 'file:///tmp/shot.png' } })

    expect(capturedArgs[0]).toBe('-p')
    expect(capturedArgs[1]).toContain('brief: file:///tmp/brief.md')
    expect(verdict).toEqual({ passed: true, findings: [], evidence: ['file:///tmp/shot.png'] })
  })
})

describe('createHeadlessClaudeSpawner exit status', () => {
  it('throws rather than silently passing when the spawned process exits non-zero, even with parseable stdout', async () => {
    const fakeRunClaude = (): ClaudeProcessResult => ({
      stdout: '{"passed": true, "findings": [], "evidence": []}',
      status: 1
    })
    const spawner = createHeadlessClaudeSpawner(fakeRunClaude)

    await expect(spawner({ artifacts: { brief: 'file:///tmp/brief.md' } })).rejects.toThrow(/exited with status 1/)
  })
})

describe('registerClaudeJudge wired to the headless spawner', () => {
  it("reaches core.judge through registerClaudeJudge(createHeadlessClaudeSpawner(...)) end-to-end, mocking the subprocess", async () => {
    const fakeRunClaude = (): ClaudeProcessResult => ({
      stdout: '{"passed": false, "findings": [{"message": "brief mismatch"}], "evidence": []}',
      status: 0
    })
    registerClaudeJudge(createHeadlessClaudeSpawner(fakeRunClaude))

    const result = await core.judge({ artifacts: { brief: 'file:///tmp/brief.md' } })

    expect(result).toEqual({ passed: false, findings: [{ message: 'brief mismatch' }], evidence: [] })
  })
})
