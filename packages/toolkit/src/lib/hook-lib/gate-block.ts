/** Writes a labeled reason to stderr and exits 2. */
export function makeBlock(label: string): (reason: string) => never {
  return function block(reason: string): never {
    process.stderr.write(`${label}: BLOCKED — ${reason}\n`)
    process.exit(2)
  }
}
