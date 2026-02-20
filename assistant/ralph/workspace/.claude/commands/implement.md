---
name: implement
description: Implement a specific user story from .ralph/prd.json. Usage: /implement US-001 or /implement (picks the next incomplete story).
argument-hint: "[US-xxx]"
---

Implement a user story from `.ralph/prd.json`.

<% if ($ARGUMENTS) { %>
Target story: **$ARGUMENTS\*\*

Read `.ralph/prd.json` and find the story with id `$ARGUMENTS`.
If it does not exist or already has `passes: true`, stop and report.
<% } else { %>
Read `.ralph/prd.json` and find the single incomplete story with the lowest `priority` number (lowest = first).
If all stories have `passes: true`, emit `<promise>COMPLETE</promise>` and stop.
<% } %>

Execute these steps in order:

### 1. Orient

Read `.ralph/prd.json` and `.ralph/progress.txt`.
State which story you are implementing (ID + title) and what you will do at a high level (2–4 sentences).
Do not ask for confirmation. Proceed immediately.

### 2. Implement

- Work only within the scope of this story's acceptance criteria
- Keep changes minimal and targeted — do not refactor adjacent code
- Do not implement future stories speculatively

### 3. Quality Gates

Run the project's type check, lint, and test commands.
Discover them from `package.json` scripts, `Makefile`, `pyproject.toml`, `go.mod`, `Cargo.toml`, or equivalent.
Fix every failure before moving on.

### 4. Commit

Commit with: `feat: $STORY_ID - $STORY_TITLE`
One commit per story.

### 5. Update Ralph State

1. In `.ralph/prd.json`: set this story's `passes` to `true`
2. In `.ralph/progress.txt`: append:

```
## US-XXX - Story Title
Completed: <date>
Implemented: <what was built>
Files changed: <list>
Learnings: <patterns, gotchas, conventions worth remembering>
```

### 6. Signal

- If this was the last story (all `passes: true`) → emit `<promise>COMPLETE</promise>`
- Otherwise → output `/implement US-xxx done` (replacing `US-xxx` with the story ID you just finished) on its own line
