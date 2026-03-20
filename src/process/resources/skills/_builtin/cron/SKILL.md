---
name: cron
description: Scheduled task management - create, query, delete scheduled tasks to automatically execute operations at specified times.
---

# Scheduled Task Skill

You can manage scheduled tasks to automatically execute operations at specified times.

## IMPORTANT RULES

1. **ONE task per conversation** - Each conversation can only have ONE scheduled task
2. **Query and WAIT for result** - Before creating a task, output `[CRON_LIST]` and WAIT for the system to return the result
3. **NEVER combine commands** - Do NOT output `[CRON_LIST]` and `[CRON_CREATE]` in the same message. Query first, wait for result, then decide.
4. **ASK before delete** - If a task exists, you MUST ask the user whether to replace it or keep it. NEVER delete without user's explicit confirmation.
5. **ALWAYS include closing tags** - `[CRON_CREATE]` MUST end with `[/CRON_CREATE]`
6. **Output commands directly** - Do NOT wrap commands in markdown code blocks

## Workflow for Creating a Task

**CRITICAL: This is a multi-turn workflow. Do NOT skip steps or combine them.**

**Step 1: Query existing tasks (STOP and wait)**
Output ONLY `[CRON_LIST]` and nothing else. The system will return the current task status.
DO NOT proceed to Step 2 until you see the system response.

**Step 2: Review the result and ask user (STOP and wait for user response)**
After receiving the `[CRON_LIST]` result:

- If "No scheduled tasks" → proceed to Step 3
- If a task already exists → **You MUST ask the user** what they want to do:
  - Option A: Delete the existing task and create a new one
  - Option B: Keep the existing task and cancel creating a new one
  - **NEVER delete the existing task without explicit user confirmation**
  - Wait for the user's response before proceeding

**Step 3: Execute user's decision**

- If user chose to replace: First delete the old task with `[CRON_DELETE: <job-id>]`, wait for confirmation, then create new task
- If user chose to keep: Do NOT create a new task, inform user the existing task is retained

**Step 4: Create the new task (only if no task exists or user confirmed deletion)**
Only after confirming no task exists (or after successfully deleting), output the `[CRON_CREATE]` block.

## Create Scheduled Task

When user requests a timed reminder or periodic task, output this format DIRECTLY (not in code blocks):

[CRON_CREATE]
name: Task name
schedule: Cron expression
schedule_description: Human-readable description of when the task runs
message: Message content to send when triggered
[/CRON_CREATE]

**Required fields:**

- `name`: Short descriptive name for the task
- `schedule`: Valid cron expression
- `schedule_description`: Human-readable explanation of the schedule (e.g., "Every Monday at 9:00 AM")
- `message`: The message to send when the task triggers

**Example output** (output EXACTLY like this, without code blocks):

[CRON_CREATE]
name: Weekly Meeting Reminder
schedule: 0 9 \* \* MON
schedule_description: Every Monday at 9:00 AM
message: Time for the weekly meeting!
[/CRON_CREATE]

## Query Scheduled Tasks

Output `[CRON_LIST]` directly (not in code blocks) to query scheduled tasks.
**The system will return the result in a follow-up message.** Wait for the response before taking further action.

## Delete Scheduled Task

Output `[CRON_DELETE: <actual-job-id>]` directly to delete a specific task.
Replace `<actual-job-id>` with the real job ID (e.g., `cron_abc123`).

## Cron Expression Reference

| Expression        | Meaning                          |
| ----------------- | -------------------------------- |
| `0 9 * * *`       | Every day at 9:00 AM             |
| `0 9 * * MON`     | Every Monday at 9:00 AM          |
| `0 9 * * MON-FRI` | Weekdays at 9:00 AM              |
| `*/30 * * * *`    | Every 30 minutes                 |
| `0 */2 * * *`     | Every 2 hours                    |
| `0 0 1 * *`       | 1st of every month at midnight   |
| `0 18 * * FRI`    | Every Friday at 6:00 PM          |
| `0 9,18 * * *`    | Every day at 9:00 AM and 6:00 PM |

### Cron Expression Format

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, SUN-SAT)
│ │ │ │ │
* * * * *
```

### Special Characters

- `*` - Any value
- `,` - List separator (e.g., `1,3,5`)
- `-` - Range (e.g., `MON-FRI`)
- `/` - Step (e.g., `*/15` for every 15)

## Notes

- Scheduled tasks are bound to the current conversation
- When triggered, the message will be sent to this conversation
- **CRITICAL**: `[CRON_LIST]` is an async query. You MUST wait for the system response before proceeding with `[CRON_CREATE]` or `[CRON_DELETE]`. Never output multiple commands in one message.
