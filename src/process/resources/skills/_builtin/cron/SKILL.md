---
name: cron
description: Scheduled task management - create, query, update scheduled tasks to automatically execute operations at specified times.
---

# Scheduled Task Skill

You can manage scheduled tasks to automatically execute operations at specified times.

## IMPORTANT RULES

1. **ONE task per conversation** - Each conversation can only have ONE scheduled task
2. **Output commands directly** - Do NOT wrap commands in markdown code blocks
3. **ALWAYS include closing tags** - `[CRON_CREATE]` MUST end with `[/CRON_CREATE]`, `[CRON_UPDATE]` MUST end with `[/CRON_UPDATE]`

## Workflow

This is a two-step workflow. Each step is one message turn.

**Step 1: Query**
Output `[CRON_LIST]` (nothing else in this message) and wait for the system response.

**Step 2: Act** (based on system response)

- **"No scheduled tasks"** → Immediately output `[CRON_CREATE]` in this message. Do NOT ask the user for extra confirmation — they already told you what they want.
- **Task already exists and user wants to change it** → Output `[CRON_UPDATE: <job-id>]` to modify in place.
- **Task already exists and user wants something different** → Ask the user how to proceed.

## Create: [CRON_CREATE]

Output this format DIRECTLY (not in code blocks):

[CRON_CREATE]
name: Task name
schedule: Cron expression
schedule_description: Human-readable description
message: Message content
[/CRON_CREATE]

**Required fields:**

- `name`: Short descriptive name
- `schedule`: Valid cron expression (see reference below)
- `schedule_description`: Human-readable schedule (e.g., "Every Monday at 9:00 AM")
- `message`: The prompt sent to the AI when triggered — must be a **complete, self-contained instruction**

**How to write `message`:**

The `message` is what the AI receives each time the task fires. It must tell the AI exactly what to do — NOT restate the user's request.

| User says                         | ❌ Bad message           | ✅ Good message                                                                                |
| --------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| "Send me hello every day at 10am" | Send me hello            | Reply with exactly: Hello!                                                                     |
| "Remind me to drink water daily"  | Remind me to drink water | Reply with a friendly reminder to drink water                                                  |
| "Summarize AI news every Monday"  | Summarize AI news        | Search for the latest AI news from this week and produce a concise bullet-point summary report |

**Example** (output EXACTLY like this, no code blocks):

[CRON_CREATE]
name: Weekly Meeting Reminder
schedule: 0 9 \* \* MON
schedule_description: Every Monday at 9:00 AM
message: Reply with a short weekly meeting reminder that includes the current date and time.
[/CRON_CREATE]

## Update: [CRON_UPDATE]

Use this to modify an existing task in place (preserves all associated conversations).

[CRON_UPDATE: <job-id>]
name: Updated task name
schedule: New cron expression
schedule_description: Human-readable description
message: Updated message content
[/CRON_UPDATE]

Replace `<job-id>` with the real job ID from `[CRON_LIST]` result.
All four fields are required — provide the full updated values.

## Query: [CRON_LIST]

Output `[CRON_LIST]` directly. The system will return the result in a follow-up message.

## Cron Expression

Format: `minute hour day-of-month month day-of-week` — e.g. `0 9 * * MON-FRI` = weekdays at 9:00 AM.
