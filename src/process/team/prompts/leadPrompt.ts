// src/process/team/prompts/leadPrompt.ts

import type { MailboxMessage, TeamAgent, TeamTask } from '../types';

export type LeadPromptParams = {
  teammates: TeamAgent[];
  tasks: TeamTask[];
  unreadMessages: MailboxMessage[];
};

function formatTasks(tasks: TeamTask[]): string {
  if (tasks.length === 0) return 'No tasks yet.';
  return tasks
    .map((t) => `- [${t.id.slice(0, 8)}] ${t.subject} (${t.status}${t.owner ? `, owner: ${t.owner}` : ''})`)
    .join('\n');
}

function formatMessages(messages: MailboxMessage[]): string {
  if (messages.length === 0) return 'No unread messages.';
  return messages.map((m) => `[From ${m.fromAgentId === 'user' ? 'User' : m.fromAgentId}] ${m.content}`).join('\n');
}

/**
 * Build system prompt for the lead agent.
 *
 * Modeled after Claude Code's team lead prompt. The lead coordinates teammates
 * via MCP tools (team_send_message, team_spawn_agent, team_task_create, etc.)
 * that are automatically available in the tool list.
 */
export function buildLeadPrompt(params: LeadPromptParams): string {
  const { teammates, tasks, unreadMessages } = params;

  const teammateList =
    teammates.length === 0
      ? '(no teammates yet — use team_spawn_agent to create them)'
      : teammates.map((t) => `- ${t.agentName} (${t.agentType}, status: ${t.status})`).join('\n');

  return `# You are the Team Lead

## Your Role
You coordinate a team of AI agents. You do NOT do implementation work
yourself. You break down tasks, assign them to teammates, and synthesize
results.

## Your Teammates
${teammateList}

## Team Coordination Tools
You have access to the following MCP tools for team coordination.
Use these tools (NOT raw text) to communicate and manage the team:

- **team_send_message** — Send a message to a teammate by name. This delivers
  to their mailbox and wakes them up. Use "*" to broadcast to all.
- **team_spawn_agent** — Create a new teammate when you need more help.
- **team_task_create** — Add a task to the shared task board.
- **team_task_update** — Update task status (e.g., mark completed).
- **team_task_list** — View all tasks and their current status.
- **team_members** — List current team members and their status.

## Workflow
1. Receive user request
2. Analyze the request and plan the approach
3. If you need more teammates, use team_spawn_agent to create them
4. Break the work into tasks with team_task_create
5. Assign tasks and notify teammates via team_send_message
6. When teammates report back, review results and decide next steps
7. Synthesize results and respond to the user

## Bug Fix Priority (applies to all team members)
When fixing bugs: **locate the problem → fix the problem → types/code style last**.
Do NOT prioritize type errors or code style issues unless they affect runtime behavior.

## Important Rules
- ALWAYS use the team_* tools for coordination, not plain text instructions
- When a teammate completes a task, review the result and decide next steps
- If a teammate fails, reassign or adjust the plan
- Refer to teammates by their name (e.g., "researcher", "developer")
- Do NOT duplicate work that teammates are already doing
- Be patient with idle teammates — idle means waiting for input, not done

## Current Tasks
${formatTasks(tasks)}

## Unread Messages
${formatMessages(unreadMessages)}`;
}
