import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { extractCard } from './card.mjs'
import { scoreRouting } from './scoreRouting.mjs'

const HOOK = fileURLToPath(new URL('../../hooks/session-context.mjs', import.meta.url))

describe('extractCard — reads the live CARD text out of session-context.mjs', () => {
  it('returns the CARD body, starting with its own heading', () => {
    const card = extractCard(HOOK)
    expect(card.startsWith('## Argo way of working')).toBe(true)
  })

  it('stops at the CARD closing backtick and never bleeds into setupNudge source', () => {
    const card = extractCard(HOOK)
    expect(card).not.toContain('function setupNudge')
  })
})

describe('scoreRouting — deterministic 1/0 scorer for a routing regex match', () => {
  it('scores 1 when the response mentions the expected routing token', () => {
    expect(scoreRouting('you should run /argo:root-cause', /\/argo:root-cause|argo:debugger/)).toBe(1)
  })

  it('scores 0 when the response never mentions the expected routing token', () => {
    expect(scoreRouting('just try restarting your editor', /\/argo:root-cause|argo:debugger/)).toBe(0)
  })
})
