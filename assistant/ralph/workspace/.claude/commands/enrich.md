---
name: enrich
description: Deeply analyse a feature request and write an enriched version to .ralph/prompt.md. Does not ask questions or implement anything.
argument-hint: '[feature request text]'
---

Deeply understand and enrich the following feature request. Do NOT ask questions, implement anything, or write `prd.json`.

Feature request: "$ARGUMENTS"

Steps:

1. Create `.ralph/` in the workspace if it does not exist
2. Think carefully about the request — identify:
   - The core goal the user is trying to achieve
   - Implicit requirements not stated but clearly needed
   - Likely edge cases and constraints
   - Ambiguities that will need clarification before building
   - Natural story boundaries (what depends on what)
3. Write `.ralph/prompt.md` with this structure:

```markdown
# Feature Request

## Original Request

<user's raw request verbatim>

## Goal

<restate the goal clearly in one paragraph>

## Implicit Requirements

- <requirement inferred from context>
- ...

## Edge Cases & Constraints

- <edge case or constraint>
- ...

## Open Questions

- <ambiguity that needs user clarification before writing the PRD>
- ...

## Story Boundaries

<brief notes on how this naturally decomposes — what must come first, what depends on what>
```

Do not write application code, run commands, or make git commits in this turn.
