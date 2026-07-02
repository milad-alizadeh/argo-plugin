# TDD Guard Vitest Reporter

Vitest reporter that captures test results for TDD Guard validation.

## Requirements

- Node.js 18+
- Vitest 3.2.0+
- [TDD Guard](https://github.com/nizos/tdd-guard) installed globally

## Installation

```bash
npm install --save-dev tdd-guard-vitest
```

## Configuration

### Vitest Configuration

Add the reporter to your `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: ['default', ['tdd-guard-vitest']],
  },
})
```

### Workspace/Monorepo Configuration

For workspaces or monorepos, pass the project root path in the reporter options:

```typescript
// vitest.config.ts in project root
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    reporters: [
      'default',
      ['tdd-guard-vitest', { projectRoot: path.resolve(__dirname) }],
    ],
  },
})
```

If your vitest config is in a workspace subdirectory, specify the absolute path to your project root in the options, for example `{ projectRoot: '/Users/username/projects/my-app' }`.

## More Information

- Test results are saved to `.claude/tdd-guard/data/test.json`
- See [TDD Guard documentation](https://github.com/nizos/tdd-guard) for complete setup

## License

MIT
