---
name: status
description: Show the current PRD progress — which stories are done, which are pending, and what comes next.
---

Read `.ralph/prd.json` and `.ralph/progress.txt`, then report the current state of the project.

If `.ralph/prd.json` does not exist, say so and suggest running `/prd <feature request>` to get started.

Report format:

## Ralph Status

**Project**: `<project>` — `<branchName>`
**Description**: <description>

### Stories

| #   | ID     | Title | Status               |
| --- | ------ | ----- | -------------------- |
| 1   | US-001 | ...   | ✅ Done / ⏳ Pending |
| 2   | US-002 | ...   | ✅ Done / ⏳ Pending |

...

**Progress**: X / Y stories complete

### Next

<If there are incomplete stories: "Next up: US-XXX — Title">
<If all done: "All stories complete. Ready to ship.">

### Recent Activity

<Last 3 entries from .ralph/progress.txt, or "No progress logged yet.">
