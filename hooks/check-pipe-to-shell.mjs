#!/usr/bin/env node
/**
 * Pipe-to-shell guard (PreToolUse hook).
 *
 * Blocks Bash commands that download and immediately execute code —
 * the "curl | bash" / "wget | sh" pattern. This is a common supply-chain
 * attack vector: the downloaded script runs with full shell privileges
 * without any review step.
 *
 * Exits 2 (block) with a message when the pattern is detected.
 * Exits 0 (allow) for everything else.
 */

function read(stream) {
  return new Promise((resolve) => {
    let data = ''
    stream.setEncoding('utf8')
    stream.on('data', (c) => (data += c))
    stream.on('end', () => resolve(data))
  })
}

const raw = await read(process.stdin).catch(() => '')
let command = ''
try {
  command = JSON.parse(raw)?.tool_input?.command ?? ''
} catch {
  process.exit(0) // malformed input — don't block
}

// Detect pipe-to-shell: curl/wget output piped into a shell or interpreter
const PIPE_TO_SHELL = /\b(curl|wget)\b[^|]*\|\s*(bash|sh|zsh|fish|node|python[23]?|ruby|perl)\b/i

if (PIPE_TO_SHELL.test(command)) {
  process.stderr.write(
    `Blocked: pipe-to-shell pattern detected.\n\n` +
      `  Command: ${command.slice(0, 200)}\n\n` +
      `Downloading and immediately executing code is a supply-chain risk — ` +
      `the script runs with full shell privileges before it can be reviewed.\n\n` +
      `Alternative: download to a file first, inspect it, then run it.\n` +
      `  curl -fsSL <url> -o install.sh && cat install.sh && bash install.sh\n`
  )
  process.exit(2)
}

process.exit(0)
