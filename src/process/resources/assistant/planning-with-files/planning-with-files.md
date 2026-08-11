# Planning with Files - Manus-Style File-Based Planning

Work like Manus (the $2B AI agent Meta acquired): Use persistent markdown files as your "working memory on disk."

## Core Principle

```
Context Window = RAM (volatile, limited)
Filesystem = Disk (persistent, unlimited)

→ Anything important gets written to disk.
```

## The 3-File Pattern

For every complex task, create THREE files in your project directory:

```
task_plan.md      → Track phases and progress
findings.md       → Store research and findings
progress.md       → Session log and test results
```

**Templates are available at:** `assistant/planning-with-files/templates/`

## When to Use This Pattern

**Use for:**

- Multi-step tasks (3+ steps)
- Research tasks
- Building/creating projects
- Tasks spanning many tool calls
- Anything requiring organization

**Skip for:**

- Simple questions
- Single-file edits
- Quick lookups

## Critical Timing Rules

These rules simulate hooks to ensure proper workflow:

### 📌 At Task Start (SessionStart)

**MUST** create all three files FIRST before any other work:

1. Create `task_plan.md` using the template
2. Create `findings.md` using the template
3. Create `progress.md` using the template
4. Fill in the Goal section in task_plan.md

**Why:** Without planning files, you'll forget goals after 50+ tool calls.

### 📌 Before Major Decisions (PreToolUse)

**MUST** re-read `task_plan.md` before:

- Writing or editing files
- Executing commands
- Making architectural decisions
- Implementing features

**How:** Use the Read tool to refresh the plan in your context.

**Why:** This keeps goals fresh in your attention window (Manus's "attention manipulation").

### 📌 After File Operations (PostToolUse)

**MUST** update status immediately after:

- Writing files
- Editing files
- Completing a task phase

**How:** Edit task_plan.md to update phase status:

```markdown
- **Status:** pending → in_progress → complete
```

**Why:** Tracks progress and prevents losing track of what's done.

### 📌 Before Task End (Stop)

**MUST** verify completion:

- Check all phases marked as `complete`
- Review deliverables section
- Ensure no errors left unresolved

**Why:** Prevents premature completion with missing work.

## The 6 Critical Rules

### 1. Create Plan First

Never start a complex task without `task_plan.md`. Non-negotiable.

```markdown
## Goal

[One sentence describing the end state]

## Current Phase

Phase 1

## Phases

### Phase 1: Requirements & Discovery

- [ ] Understand user intent
- [ ] Identify constraints
- **Status:** in_progress
```

### 2. The 2-Action Rule

> "After every 2 view/browser/search operations, IMMEDIATELY save key findings to findings.md."

This prevents visual/multimodal information from being lost.

```markdown
## Visual/Browser Findings

- Screenshot shows login form with email and password fields
- API documentation indicates JSON response format
```

### 3. Read Before Decide

Before major decisions, read the plan file. This keeps goals in your attention window.

```bash
# Before implementing a feature:
Read tool → task_plan.md
# Now proceed with implementation
```

### 4. Update After Act

After completing any phase:

- Mark phase status: `pending` → `in_progress` → `complete`
- Log any errors encountered
- Note files created/modified

```markdown
## Errors Encountered

| Error             | Attempt | Resolution             |
| ----------------- | ------- | ---------------------- |
| FileNotFoundError | 1       | Created default config |
```

### 5. Log ALL Errors

Every error goes in the plan file. This builds knowledge and prevents repetition.

### 6. Never Repeat Failures

```
if action_failed:
    next_action != same_action
```

Track what you tried. Mutate the approach.

## The 3-Strike Error Protocol

```
ATTEMPT 1: Diagnose & Fix
  → Read error carefully
  → Identify root cause
  → Apply targeted fix

ATTEMPT 2: Alternative Approach
  → Same error? Try different method
  → Different tool? Different library?
  → NEVER repeat exact same failing action

ATTEMPT 3: Broader Rethink
  → Question assumptions
  → Search for solutions
  → Consider updating the plan

AFTER 3 FAILURES: Escalate to User
  → Explain what you tried
  → Share the specific error
  → Ask for guidance
```

## File Purposes

| File           | Purpose                     | When to Update      |
| -------------- | --------------------------- | ------------------- |
| `task_plan.md` | Phases, progress, decisions | After each phase    |
| `findings.md`  | Research, discoveries       | After ANY discovery |
| `progress.md`  | Session log, test results   | Throughout session  |

## Read vs Write Decision Matrix

| Situation             | Action                  | Reason                        |
| --------------------- | ----------------------- | ----------------------------- |
| Just wrote a file     | DON'T read              | Content still in context      |
| Viewed image/PDF      | Write findings NOW      | Multimodal → text before lost |
| Browser returned data | Write to file           | Screenshots don't persist     |
| Starting new phase    | Read plan/findings      | Re-orient if context stale    |
| Error occurred        | Read relevant file      | Need current state to fix     |
| Resuming after gap    | Read all planning files | Recover state                 |

## The 5-Question Reboot Test

If you can answer these, your context management is solid:

| Question             | Answer Source                 |
| -------------------- | ----------------------------- |
| Where am I?          | Current phase in task_plan.md |
| Where am I going?    | Remaining phases              |
| What's the goal?     | Goal statement in plan        |
| What have I learned? | findings.md                   |
| What have I done?    | progress.md                   |

## Template Structure

### task_plan.md Template

```markdown
# Task Plan: [Brief Description]

## Goal

[One sentence describing the end state]

## Current Phase

Phase 1

## Phases

### Phase 1: Requirements & Discovery

- [ ] Understand user intent
- [ ] Identify constraints and requirements
- [ ] Document findings in findings.md
- **Status:** in_progress

### Phase 2: Planning & Structure

- [ ] Define technical approach
- [ ] Create project structure if needed
- [ ] Document decisions with rationale
- **Status:** pending

### Phase 3: Implementation

- [ ] Execute the plan step by step
- [ ] Write code to files before executing
- [ ] Test incrementally
- **Status:** pending

### Phase 4: Testing & Verification

- [ ] Verify all requirements met
- [ ] Document test results in progress.md
- [ ] Fix any issues found
- **Status:** pending

### Phase 5: Delivery

- [ ] Review all output files
- [ ] Ensure deliverables are complete
- [ ] Deliver to user
- **Status:** pending

## Key Questions

1. [Question to answer]
2. [Question to answer]

## Decisions Made

| Decision | Rationale |
| -------- | --------- |
|          |           |

## Errors Encountered

| Error | Attempt | Resolution |
| ----- | ------- | ---------- |
|       | 1       |            |
```

### findings.md Template

```markdown
# Findings & Decisions

## Requirements

## <!-- Captured from user request -->

## Research Findings

## <!-- Key discoveries during exploration -->

## Technical Decisions

<!-- Decisions made with rationale -->

| Decision | Rationale |
| -------- | --------- |
|          |           |

## Issues Encountered

<!-- Errors and how they were resolved -->

| Issue | Resolution |
| ----- | ---------- |
|       |            |

## Resources

## <!-- URLs, file paths, API references -->

## Visual/Browser Findings

## <!-- CRITICAL: Update after every 2 view/browser operations -->
```

### progress.md Template

```markdown
# Progress Log

## Session: [DATE]

### Phase 1: [Title]

- **Status:** in_progress
- **Started:** [timestamp]
- ## Actions taken:
- ## Files created/modified:

## Test Results

| Test | Input | Expected | Actual | Status |
| ---- | ----- | -------- | ------ | ------ |
|      |       |          |        |        |

## Error Log

| Timestamp | Error | Attempt | Resolution |
| --------- | ----- | ------- | ---------- |
|           |       | 1       |            |

## 5-Question Reboot Check

| Question             | Answer           |
| -------------------- | ---------------- |
| Where am I?          | Phase X          |
| Where am I going?    | Remaining phases |
| What's the goal?     | [goal statement] |
| What have I learned? | See findings.md  |
| What have I done?    | See above        |
```

## Anti-Patterns

| Don't                          | Do Instead                      |
| ------------------------------ | ------------------------------- |
| Use TodoWrite for persistence  | Create task_plan.md file        |
| State goals once and forget    | Re-read plan before decisions   |
| Hide errors and retry silently | Log errors to plan file         |
| Stuff everything in context    | Store large content in files    |
| Start executing immediately    | Create plan file FIRST          |
| Repeat failed actions          | Track attempts, mutate approach |

## The Manus Principles

| Principle               | Implementation                   |
| ----------------------- | -------------------------------- |
| Filesystem as memory    | Store in files, not context      |
| Attention manipulation  | Re-read plan before decisions    |
| Error persistence       | Log failures in plan file        |
| Goal tracking           | Checkboxes show progress         |
| Completion verification | Check all phases before stopping |

---

**Remember:** The more context you gather upfront and write to disk, the better your execution will be. Files are your persistent memory.
