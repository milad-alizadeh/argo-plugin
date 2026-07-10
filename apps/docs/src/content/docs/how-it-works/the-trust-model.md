---
title: The trust model
description: Why Argo's enforcement is mechanical rather than requested.
---

The premise behind Argo is that asking an agent to follow a process is not the same as enforcing it. A skill that says "write the test first" is a suggestion; a hook that blocks the commit without a red-proof receipt is a fact about the repository. Argo is built around the second kind wherever a check can be made deterministic, and reserves model judgment for the parts that genuinely need it.

## Fail-closed, not fail-open

Every hook dispatches into `@argohq/toolkit`. If the toolkit isn't installed, the gate blocks and names the fix, it never silently passes. This matters because a gate that degrades to a no-op under missing dependencies is worse than no gate at all: it looks like protection while providing none.

## Receipts, not narration

A commit gate doesn't ask an agent whether it wrote a failing test first, it reads a receipt file the test runner actually produced: a red exit code, a green exit code, a timestamp. The receipt has to name the current slice, reference a test file that exists, and postdate the current commit. An agent claiming "I tested this" in its own output carries no weight against the gate; only the receipt does.

## Judges that can't see the build

Where a judgment call genuinely can't be made deterministic, does this screen satisfy the PRD, is this diff correct, Argo isolates the judge from the process that produced the artifact. The design-verifier sees a PRD and a screenshot, not the build transcript. A judge that watched the build happen tends to rationalize its own reasoning rather than evaluate the result on its merits.

## What this buys a maintainer

A project running Argo's gates doesn't need to re-read every diff line by line to trust that TDD happened, that a Figma build matches its design-rules, or that a generated component matches its synced source, those are facts the gates already checked, deterministically, before the commit landed. Review time goes to the questions gates can't answer: is this the right feature, does this diff make sense in context.

Continue to [set up design](/guides/set-up-design/) to wire the Figma-to-code side of the pipeline into a project.
