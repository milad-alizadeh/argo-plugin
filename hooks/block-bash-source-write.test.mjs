import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HOOK = fileURLToPath(new URL('./block-bash-source-write.mjs', import.meta.url))

/** Run the hook as Claude Code does: hook-input JSON on stdin, observe exit code. */
function runHook(stdin, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [HOOK], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('exit', (code) => resolve({ code, stderr }))
    child.stdin.end(stdin)
  })
}

const bashInput = (command) =>
  JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } })

describe('block-bash-source-write — closes the shell-write subset of the guard bypass', () => {
  it('BLOCK: heredoc redirection into a source file (the observed bypass)', async () => {
    const r = await runHook(bashInput("cat > src/expandHome.ts <<'EOF'\nexport const x = 1\nEOF"))
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/Write\/Edit/)
  })

  it('BLOCK: sed -i in-place edit of a source file', async () => {
    expect((await runHook(bashInput("sed -i '' 's/foo/bar/' src/main/harness.py"))).code).toBe(2)
  })

  it('BLOCK: tee into a source file', async () => {
    expect((await runHook(bashInput('echo "x" | tee src/util.go'))).code).toBe(2)
  })

  it('BLOCK: cp staging a source file into place', async () => {
    expect((await runHook(bashInput('cp /tmp/staged.rs src/lib/parser.rs'))).code).toBe(2)
  })

  // R8: "never patch the bundled audit locally" is enforced by this same
  // guard, since design/tier0-audit.js is a plain .js source file in a
  // non-exempt path — no separate hook needed.
  it('BLOCK: shell-writing the assembled tier-0 audit script (R8 never-patch-locally)', async () => {
    const r = await runHook(bashInput("cat > design/tier0-audit.js <<'EOF'\nexport default 1\nEOF"))
    expect(r.code).toBe(2)
  })

  it('BLOCK: interpreter one-liner writing a source file (node -e writeFileSync)', async () => {
    expect(
      (await runHook(bashInput(`node -e "require('fs').writeFileSync('src/gen.ts','export {}')"`))).code,
    ).toBe(2)
  })

  it('PASS: shell writes to non-source targets (logs, JSON, markdown, /tmp) stay allowed', async () => {
    for (const cmd of [
      'echo done > build.log',
      'cat > .argo/build-mode.json <<EOF\n{}\nEOF',
      'python3 - <<EOF\nopen("notes.md","w").write("x")\nEOF',
      'cat > /tmp/scratch.ts <<EOF\nconst x=1\nEOF',
      'node -e "require(\'fs\').writeFileSync(\'.argo/red-proof.json\',\'{}\')"',
    ]) {
      expect((await runHook(bashInput(cmd))).code).toBe(0)
    }
  })

  it('PASS: stdout-redirect codegen into generated paths (the mainstream pattern)', async () => {
    for (const cmd of [
      'npx openapi-typescript spec.yaml > src/generated/api.ts',
      'bunx graphql-codegen > src/types/schema.gen.ts',
      'node scripts/build.js > dist/bundle.js',
    ]) {
      expect((await runHook(bashInput(cmd))).code).toBe(0)
    }
  })

  it('PASS: ARGO_DISABLE_BASH_SOURCE_GUARD=1 escape hatch disables the guard entirely', async () => {
    const r = await runHook(bashInput('cat > src/anything.ts <<EOF\nx\nEOF'), {
      ARGO_DISABLE_BASH_SOURCE_GUARD: '1',
    })
    expect(r.code).toBe(0)
  })

  it('PASS: corpus of real builder commands from actual transcripts — zero false positives', async () => {
    // Curated from real argo-v2 build sessions (2026-07-02): the everyday
    // shapes a builder actually runs. The plan's FP budget on this corpus is zero.
    const corpus = [
      'git add plugin/hooks/session-context.mjs plugin/hooks/hooks.json && git commit -q -m "feat: x"',
      'git status --short | head -5',
      'git log --oneline -3',
      'git merge --ff-only main',
      'git worktree list',
      'bun install',
      'bun run lint 2>&1 | tail -2',
      'bunx vitest run test/redProofGate.test.mjs 2>&1 | grep -E "Tests"',
      'bunx playwright test --config e2e/playwright.config.ts persistence.spec.ts 2>&1 | tail -3',
      'grep -n "roster-panel" e2e/dock-and-panel-headers.spec.ts',
      'grep -rn "instructions" dist/ 2>/dev/null | grep -iv ".map" | head -10',
      'ls -la out/renderer/assets/*.js 2>/dev/null | head -3',
      'mkdir -p .argo && cat > .argo/build-mode.json <<EOF\n{"slice":"s1"}\nEOF',
      "node -e \"const fs=require('fs'); fs.writeFileSync('../.argo/red-proof.json', JSON.stringify({slice:'s1'}))\"",
      'cp worktree/.claude/tdd-guard/data/test.json main/.claude/tdd-guard/data/test.json',
      'python3 - <<EOF\nimport json\nprint(json.dumps({"a":1}))\nEOF',
      'which typescript-language-server',
      'sed -n 1,40p plugin/hooks/hooks.json',
      'cd plugin && bunx vitest run 2>&1 | tail -4; echo "exit=$?"',
      'curl -fsSL https://example.com/data.json -o /tmp/data.json',
    ]
    for (const cmd of corpus) {
      const r = await runHook(bashInput(cmd))
      expect(r.code, `false positive on: ${cmd}\n${r.stderr}`).toBe(0)
    }
  })

  it('BLOCK: output-dir names nested inside source trees are NOT exempt (src/build/, src/layout/out/)', async () => {
    expect((await runHook(bashInput('cat > src/build/config.ts <<EOF\nx\nEOF'))).code).toBe(2)
    expect((await runHook(bashInput("sed -i '' 's/a/b/' src/layout/out/panel.ts"))).code).toBe(2)
  })

  it('PASS: malformed stdin / missing command — fail open, never crashes', async () => {
    for (const stdin of ['not json', '', JSON.stringify({ tool_input: {} })]) {
      expect((await runHook(stdin)).code).toBe(0)
    }
  })
})
