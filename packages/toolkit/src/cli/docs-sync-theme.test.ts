import { describe, expect, it } from 'vitest'
import { extractThemeStaticBlock } from './docs-sync-theme.js'

const FIXTURE = `
:root {
  --ev-c-black: #000;
}

@theme inline {
  --decoy-inline: #ffffff;
}

@theme static {
  --color-slate: #151c2b;
  --color-cloud: #7fa8d9;
}

.dark {
  --sidebar-primary: #ff0000;
}
`

describe('extractThemeStaticBlock', () => {
  it('extracts only the @theme static block content', () => {
    const result = extractThemeStaticBlock(FIXTURE)
    expect(result).toContain('--color-slate: #151c2b')
  })

  it('excludes the decoy @theme inline block', () => {
    const result = extractThemeStaticBlock(FIXTURE)
    expect(result).not.toContain('--decoy-inline')
  })

  it('excludes the decoy .dark block', () => {
    const result = extractThemeStaticBlock(FIXTURE)
    expect(result).not.toContain('--sidebar-primary')
  })

  it('throws when no @theme static block is present', () => {
    expect(() => extractThemeStaticBlock(':root { --x: 1; }')).toThrow()
  })
})
