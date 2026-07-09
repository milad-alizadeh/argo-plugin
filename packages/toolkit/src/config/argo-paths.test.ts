import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import {
  ARGO_CONFIG_RELPATH,
  GITIGNORE_BLOCK,
  argoConfigPath,
  buildModePath,
  designDocsDir,
  evidenceDir,
  launchReceiptPath,
  plansDir,
  redProofPath
} from './argo-paths.js'

describe('argo-paths — the single .argo/ resolver', () => {
  const root = '/repo'

  it('resolves the config at .argo/config.json', () => {
    expect(argoConfigPath(root)).toBe(join(root, '.argo', 'config.json'))
    expect(ARGO_CONFIG_RELPATH).toBe(join('.argo', 'config.json'))
  })

  it('resolves plans and design docs under .argo/', () => {
    expect(plansDir(root)).toBe(join(root, '.argo', 'plans'))
    expect(designDocsDir(root)).toBe(join(root, '.argo', 'design'))
  })

  it('resolves the three evidence files under .argo/evidence/', () => {
    expect(evidenceDir(root)).toBe(join(root, '.argo', 'evidence'))
    expect(buildModePath(root)).toBe(join(root, '.argo', 'evidence', 'build-mode.json'))
    expect(redProofPath(root)).toBe(join(root, '.argo', 'evidence', 'red-proof.json'))
    expect(launchReceiptPath(root)).toBe(join(root, '.argo', 'evidence', 'launch-receipt.json'))
  })

  it('gitignore block is deny-by-default with explicit re-includes only', () => {
    expect(GITIGNORE_BLOCK[0]).toBe('/.argo/*')
    expect(GITIGNORE_BLOCK).toContain('!/.argo/config.json')
    expect(GITIGNORE_BLOCK).toContain('!/.argo/plans/')
    expect(GITIGNORE_BLOCK).toContain('!/.argo/design/')
    // evidence/ and secrets stay ignored: no re-include beyond the three
    expect(GITIGNORE_BLOCK.filter((l) => l.startsWith('!'))).toHaveLength(3)
  })
})
