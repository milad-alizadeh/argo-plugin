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

## Conventions

- Project skills live in `.claude/skills/<name>/SKILL.md`; plugin-shipped skills in
  the plugin's `skills/<name>/`. Match the house style of surrounding skills.
- Keep the determinism boundary clear: process that must be guaranteed belongs in
  code (a script, a hook), not in skill prose.

## Checklist

- [ ] Description includes "Use when..." triggers; SKILL.md under ~100 lines (else split)
- [ ] No time-sensitive info; consistent terminology; a concrete example
- [ ] Provenance line if adapted from another source

<!-- Adapted from mattpocock/skills (MIT). -->
