/**
 * §7 — chain the code-enforced trust gate (hooks/trust-gate.mjs) onto a slice's
 * Verify command. Only slices that ship launchable app behaviour (requiresLaunch)
 * are gated: after the test suite goes green, the gate reads the launch evidence
 * receipt and the whole command goes RED unless the app was actually launched AND
 * exercised. Pure-logic / library / config slices are returned unchanged.
 *
 * build-slice.mjs mirrors `gatedVerify` inline (workflow scripts can't import local
 * modules); this is the tested source of truth for that one-liner.
 */

/** Shell command that pipes a Stop-hook payload (carrying cwd) into the trust gate. */
export function gateCommand(gatePath) {
  // Build the hook payload with node's JSON.stringify (NOT printf) so a cwd containing
  // a double-quote can't produce invalid JSON and wedge the gate permanently RED.
  return `node -e 'process.stdout.write(JSON.stringify({cwd:process.cwd()}))' | node ${JSON.stringify(gatePath)}`
}

/** Chain the gate onto `baseCmd` for launch-requiring slices; leave others as-is. */
export function gatedVerify(baseCmd, requiresLaunch, gatePath) {
  return requiresLaunch ? `${baseCmd} && ${gateCommand(gatePath)}` : baseCmd
}
