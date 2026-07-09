// Canned page-resolution + surface-classification for resolve-comments.
//
// This runs INSIDE the Figma `use_figma` Plugin API sandbox — it is not a Node
// script and cannot be run standalone. The skill injects the pin node ids and
// passes this body verbatim to `use_figma`; it must NOT be re-authored from
// prose each run. Freezing it here gives one tested shape for the three
// properties the council fixed on: per-id fault isolation, a deterministic
// surface lookup, and a strictly read-only (non-page-switching) traversal.
//
// Contract: the skill prepends a single line defining the input, e.g.
//   const NODE_IDS = ["123:45", "678:90", …]
// then this body. It returns, per id, either
//   { page, surface, nodeName, nodeType }   (resolved)
// or
//   { error }                               (missing / threw — isolated)
//
// READ-ONLY: uses getNodeByIdAsync + a .parent walk ONLY. It never calls
// setCurrentPageAsync — that would bump the repo-global design-guard write
// counter (a "read" must not look like a write) and would move the current
// page under a human viewing the live file. getNodeByIdAsync resolves nodes on
// any page whether or not the file is in dynamic-page mode (a normal file has
// all pages loaded; a dynamic-page file loads the target on demand), so no page
// switch is ever needed here.

// Surface classification — the routing table from SKILL.md, as a pure function
// of the page name. Keep in lockstep with the "Two-way routing" table.
// Legacy W##/Cover pages deliberately fall through to 'unmatched' (→ ❓).
function classifySurface(page) {
  if (page == null) return 'file-note'
  if (/^D\d{2}(\b|\s)/.test(page)) return 'screen'
  if (page === 'Custom Components' || page.startsWith('foundations/')) return 'master'
  return 'unmatched' // a page the table doesn't cover → the skill posts a ❓, never guesses
}

const ids = Array.isArray(typeof NODE_IDS !== 'undefined' ? NODE_IDS : null) ? NODE_IDS : []
const out = {}
for (const id of ids) {
  try {
    const node = await figma.getNodeByIdAsync(id)
    if (!node) {
      out[id] = { error: 'not-found' } // pin on a since-deleted/reworked node — common, isolated
      continue
    }
    let p = node
    while (p && p.type !== 'PAGE') p = p.parent
    const page = p && p.type === 'PAGE' ? p.name : null
    out[id] = { page, surface: classifySurface(page), nodeName: node.name, nodeType: node.type }
  } catch (e) {
    out[id] = { error: String((e && e.message) || e) } // one bad id must not sink the batch
  }
}
return out
