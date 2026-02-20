---
name: retry
description: Retry the last failed or incomplete user story. Re-runs quality gates and fixes failures. Usage: /retry or /retry US-xxx.
argument-hint: "[US-xxx]"
---

Retry a user story that previously failed or was left incomplete.

<% if ($ARGUMENTS) { %>
Target story: **$ARGUMENTS\*\*

Read `.ralph/prd.json` and find the story with id `$ARGUMENTS`.
Treat it as incomplete regardless of its current `passes` value — reset `passes` to `false` before retrying.
<% } else { %>
Read `.ralph/prd.json`. Find the most recently attempted incomplete story:

1. Check `.ralph/progress.txt` for the last story that was started but not marked complete
2. If that is ambiguous, pick the incomplete story with the lowest `priority` number

If all stories already have `passes: true`, report success and stop.
<% } %>

Execute these steps:

### 1. Diagnose

State which story you are retrying and why it was incomplete or failed.
Read any relevant error output or notes from `.ralph/progress.txt`.

### 2. Fix

Address the root cause:

- If quality gates failed: fix the failing code
- If implementation was partial: complete the missing pieces
- If tests are missing: write them

### 3. Quality Gates

Run the project's type check, lint, and test commands.
Fix every failure before proceeding.

### 4. Commit

If new changes were made: commit with `fix: US-XXX - retry <brief reason>`

### 5. Update Ralph State

1. In `.ralph/prd.json`: set this story's `passes` to `true`
2. In `.ralph/progress.txt`: append a retry entry:

```
## US-XXX - Story Title (retry)
Completed: <date>
Fixed: <what was wrong and how it was resolved>
Files changed: <list>
```

### 6. Signal

- If this was the last story → emit `<promise>COMPLETE</promise>`
- Otherwise → output `/implement US-xxx done` on its own line
