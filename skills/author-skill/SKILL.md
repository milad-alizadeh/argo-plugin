---
name: author-skill
description: Create a new Claude Code skill with proper structure, a trigger-rich description, and progressive disclosure. Use when the user wants to author, write, create, or scaffold a new skill.
---

# Author a Skill

## Process

1. **Gather requirements** — what task/domain it covers, the specific triggers,
   whether it needs scripts or just instructions, any reference material.
2. **Draft** SKILL.md (concise), plus reference files only if content exceeds
   ~100 lines, plus scripts only for deterministic operations.
3. **Review with the user** — does it cover the cases, anything missing.

## Structure

```
skill-name/
├── SKILL.md        # required
├── REFERENCE.md    # only if SKILL.md would exceed ~100 lines
└── scripts/        # only for deterministic ops
```

## Frontmatter description — the only thing the agent sees

The description is surfaced in the system prompt; the agent picks the skill from
it alone. Max ~1024 chars, third person. First sentence: what it does. Second:
"Use when [specific triggers — keywords, contexts, file types]". A vague
description ("helps with code") gives the agent no way to choose it.

## When to add scripts

Only when the operation is deterministic (validation, formatting) and the same
code would otherwise be regenerated each time. Scripts save tokens and are
reliable; prose is for judgment.

## TDD for skills — a skill is code for agents; test it like code

Never ship a skill on inspection alone. Run RED–GREEN–REFACTOR on the
documentation itself:

1. **RED — baseline first.** Before writing a word of the skill, run the
   pressure scenario it targets with an agent that does NOT have the skill
   (a subagent keeps your context clean). Capture the agent's exact failure
   and — for discipline skills — its exact rationalizations, verbatim. No
   baseline = you don't know what you're fixing.
2. **GREEN — minimal skill.** Write the least skill that flips that observed
   behavior. Re-run the same scenario with the skill present; it passes or
   the skill isn't done.
3. **REFACTOR — close observed loopholes.** New rationalizations and
   workarounds discovered in testing go back into the skill. Repeat under
   harder pressure (time + sunk cost + authority combined).

## Match the form to the failure

Classify the baseline failure BEFORE choosing how to write the guidance —
the form that fixes one failure type measurably backfires on another:

| Baseline failure | Right form | Wrong form |
|---|---|---|
| Knows the rule, skips it under pressure | Prohibition + the captured rationalization table + red flags | Soft guidance ("prefer…", "consider…") |
| Complies, but output is the wrong shape | Positive recipe/contract: state what the output IS — parts, in order | Prohibition list ("don't restate", "never narrate") |
| Omits an element it already produces | Structural: a REQUIRED slot in the template it fills | Prose reminders near the template |

Never reach for a prohibition by default: in head-to-head wording tests the
prohibition arm produced MORE of the unwanted output than the recipe arm.
And no nuance clauses — "don't X unless it matters" reopens the negotiation
and degrades a winning recipe to noise; express a real exception as its own
conditional on an observable predicate.

## Invocation control

- `disable-model-invocation: true` — user-only skills, for anything
  side-effectful (deploy, commit, send, publish): the model must never
  self-trigger them.
- `user-invocable: false` — background knowledge the model applies but a
  user would never type as a command.
- Omit both — the default: either can invoke.

## Conventions

- Project skills live in `.claude/skills/<name>/SKILL.md`; plugin-shipped skills in
  the plugin's `skills/<name>/`. Match the house style of surrounding skills.
- Keep the determinism boundary clear: process that must be guaranteed belongs in
  code (a script, a hook), not in skill prose.

## Checklist

- [ ] Description includes "Use when..." triggers ONLY — never a workflow
      summary (a summarizing description becomes a shortcut agents take
      instead of reading the skill body)
- [ ] Baseline (RED) run captured before writing; GREEN re-run recorded
- [ ] Form matches the failure type (recipe vs prohibition vs structural)
- [ ] Side-effectful skill? `disable-model-invocation: true`
- [ ] No time-sensitive info; consistent terminology; a concrete example
- [ ] Provenance line if adapted from another source

<!-- Adapted from mattpocock/skills (MIT); TDD-for-skills methodology and
     form-matching table adapted from obra/superpowers writing-skills (MIT). -->
