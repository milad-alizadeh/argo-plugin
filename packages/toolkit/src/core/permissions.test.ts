import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GIT_HISTORY_MUTATION, isActionAllowed, isProtectedPath } from './permissions.js'

describe('isActionAllowed', () => {
  it('passes when the kind is in allows', () => {
    expect(isActionAllowed('file-edit', ['file-edit', 'git-commit'])).toBe(true)
  })

  it('fails when the kind is absent from allows', () => {
    expect(isActionAllowed('git-commit', ['file-edit'])).toBe(false)
  })

  it('fails everything when allows is empty', () => {
    expect(isActionAllowed('file-edit', [])).toBe(false)
    expect(isActionAllowed('git-commit', [])).toBe(false)
  })
})

describe('isProtectedPath', () => {
  it('matches ~/.argo/state/** (absolute home-anchored path)', () => {
    expect(isProtectedPath(join(homedir(), '.argo', 'state', 'proj-id', 'playbooks', 'key.json'))).toBe(true)
  })

  it('matches ~/.argo/state/** (literal ~ form)', () => {
    expect(isProtectedPath('~/.argo/state/proj-id/playbooks/key.json')).toBe(true)
  })

  it('matches .argo/config.json', () => {
    expect(isProtectedPath('.argo/config.json')).toBe(true)
    expect(isProtectedPath('/repo/root/.argo/config.json')).toBe(true)
  })

  it('matches probity.config.ts at repo root, outside .argo/', () => {
    expect(isProtectedPath('probity.config.ts')).toBe(true)
    expect(isProtectedPath('/repo/root/probity.config.ts')).toBe(true)
  })

  it('matches registry.json', () => {
    expect(isProtectedPath('registry.json')).toBe(true)
    expect(isProtectedPath('workspaces/my-workspace/registry.json')).toBe(true)
  })

  it('matches manifests/**', () => {
    expect(isProtectedPath('manifests/some-manifest.json')).toBe(true)
    expect(isProtectedPath('/repo/root/manifests/nested/some-manifest.json')).toBe(true)
  })

  it('does not match an adjacent non-protected path', () => {
    expect(isProtectedPath('.argo/design/brief.md')).toBe(false)
  })
})

describe('GIT_HISTORY_MUTATION', () => {
  it('is a stable string constant, reachable by import', () => {
    expect(typeof GIT_HISTORY_MUTATION).toBe('string')
    expect(GIT_HISTORY_MUTATION).toBe('git-history-mutation')
  })
})
