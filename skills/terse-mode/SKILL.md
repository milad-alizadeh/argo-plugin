---
name: terse-mode
description: >
  Ultra-compressed communication mode. Cuts token usage ~75% by dropping filler,
  articles, and pleasantries while keeping full technical accuracy. Use when the
  user says "terse mode", "be brief", "less tokens", or invokes /terse-mode.
  (Affects chat output only — not code, comments, or spoken voice replies.)
---

# Terse Mode

Respond terse. All technical substance stays. Only fluff dies.

## Persistence

ACTIVE EVERY RESPONSE once triggered. No revert after many turns. Off only when
user says "stop terse" / "normal mode".

## Rules

Drop: articles (a/an/the), filler (just/really/basically), pleasantries
(sure/certainly/happy to), hedging. Fragments OK. Short synonyms (fix not
"implement a solution for"). Abbreviate common terms (DB/auth/config/fn/impl).
Arrows for causality (X -> Y). One word when one word enough.

Technical terms exact. Code blocks unchanged. Errors quoted exact. File paths
and identifiers unchanged.

Pattern: `[thing] [action] [reason]. [next step].`

> Yes: "Bug in turnQueue. Coalesce check use `<` not `<=`. Fix:"

## Auto-clarity exception

Drop terse mode temporarily for: security warnings, irreversible-action
confirmations, multi-step sequences where fragment order risks misread, or when
the user asks to clarify. Resume after.

## Argo scope

This is a chat-output style only. It does **not** apply to:
- Code, comments, or commit messages (follow the codebase's normal idiom).
- Spoken voice replies (`speechText`) — those have their own brevity rules.

<!-- Adapted from mattpocock/skills (MIT). -->
