---
name: prd
description: Read .ralph/prompt.md and generate .ralph/prd.json. Ask clarifying questions if needed. Does not implement anything.
---

Generate a PRD. Do NOT implement anything in this turn.

Read the enriched feature request from `.ralph/prompt.md`.
If `.ralph/prompt.md` does not exist, stop and tell the user to run `/enrich <feature request>` first.

Steps:

1. Read `.ralph/prompt.md` in full
2. If the Open Questions section lists unresolved ambiguities, ask the user those questions and wait for answers before writing `prd.json`
3. Once clear, write `.ralph/prd.json` following this structure:

```json
{
  "project": "<project-name>",
  "branchName": "ralph/<kebab-case-feature>",
  "description": "<one-line summary>",
  "userStories": [
    {
      "id": "US-001",
      "title": "<story title>",
      "description": "As a <role>, I want <goal> so that <benefit>",
      "acceptanceCriteria": ["<testable criterion>"],
      "priority": 1,
      "passes": false
    }
  ]
}
```

Sizing rules:

- Each story must be completable within a single context window
- Order by dependency: schema/models → business logic → API → UI
- Acceptance criteria must be concrete and testable, not aspirational
- Set all `passes` to `false`

Do not write any application code, run commands, or make git commits in this turn.
