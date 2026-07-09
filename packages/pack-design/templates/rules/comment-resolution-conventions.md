# Figma comment-resolution conventions

Concrete conventions for turning pinned Figma comments into fixes.

- **Reply markers are load-bearing.** A fix reply always starts with
  `✅ Fixed — <what changed>`; a reply that needs more information always
  starts with `❓ <the one specific question>`. Never omit the prefix — a
  reply without it will be re-triaged on the next sweep.
- **One line, one clause.** No restating the comment, no rationale, no
  before/after prose. A caveat (a gap, a partial fix, a blast radius) is a
  second short clause at most.
- **Route by the pin's page, not the file.** A pin on a screen page uses the
  screen-composition convention + a hard hygiene check on the touched
  screen node; a pin on the components/foundations page uses the
  component-authoring convention + a hard hygiene check on the master. Any
  other page → `❓`, never guess a surface.
- **Master edits are conservative; new components are not.** A clear master
  fix is applied directly (plus a blast-radius report — which other screens
  instance it, and any detached instances that won't inherit the change). A
  master's *variant structure* (add/remove a variant, rename a property,
  restructure the set) is never auto-applied — post a `❓` describing the
  proposed structural change first. A request to turn a node INTO a new
  component ("componentize this") is the opposite case: apply it directly —
  create the component, replace the original with an instance, run the hard
  check — because minting something new is additive, not a restructuring
  risk.
- **Only the human resolves a thread.** There is no resolve-thread API; the
  fix/question reply is the deliverable, and the human's resolve click is
  their confirmation the fix is right.
