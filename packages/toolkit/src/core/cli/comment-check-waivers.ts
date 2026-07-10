/**
 * Shared waiver shape for both comment checkers (Wave E, council-hardening.md
 * "comment discipline"), reusing the boundary-lint ignorelist convention
 * (file-structure.md "per-project waivers"): one rule + one path glob + one
 * reason, empty by default. No new shape invented.
 */
export interface CommentCheckWaiver {
  rule: string
  glob: string
  reason: string
}

function globToRegExp(glob: string): RegExp {
  let pattern = ''
  for (let i = 0; i < glob.length; i++) {
    const rest = glob.slice(i)
    if (rest.startsWith('**/')) {
      pattern += '(?:.*/)?'
      i += 2
    } else if (rest.startsWith('**')) {
      pattern += '.*'
      i += 1
    } else {
      const c = glob[i]
      if (c === '*') pattern += '[^/]*'
      else if (c === '?') pattern += '[^/]'
      else if ('.+^${}()|[]\\'.includes(c)) pattern += `\\${c}`
      else pattern += c
    }
  }
  return new RegExp(`^${pattern}$`)
}

/** `filePath` is repo-relative, forward-slashed, to match glob authoring conventions. */
export function isWaived(waivers: CommentCheckWaiver[], rule: string, filePath: string): boolean {
  return waivers.some((w) => w.rule === rule && globToRegExp(w.glob).test(filePath))
}
