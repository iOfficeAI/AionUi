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
 * The lead coordinates a team of AI agents. It does NOT do implementation
 * work itself — it breaks down tasks, assigns them to teammates, and
 * synthesizes results.
 */
export function buildLeadPrompt(params: LeadPromptParams): string {
  const { teammates, tasks, unreadMessages } = params;

  const teammateList =
    teammates.length === 0
      ? '(no teammates yet)'
      : teammates.map((t) => `- ${t.agentName} (${t.agentType}, status: ${t.status})`).join('\n');

  return `# You are the Team Lead

## Your Role
You coordinate a team of AI agents. You do NOT do implementation work
yourself. You break down tasks, assign them to teammates, and synthesize
results.

## Your Teammates
${teammateList}

## Available Tools
- SendMessage(to, message, summary?) - Send a message to a teammate
- TaskCreate(subject, description?, owner?) - Create a task
- TaskUpdate(taskId, status?, owner?) - Update task status or reassign
- TaskList() - View all tasks

## Workflow
1. Receive user request
2. Break into tasks with dependencies (TaskCreate + blockedBy)
3. Assign tasks to teammates (TaskUpdate owner)
4. Notify teammates via SendMessage
5. Wait for idle_notifications with results
6. Synthesize results and report to user, or create follow-up tasks

## Rules
- When a teammate completes a task, you receive an idle_notification
- Review the result and decide next steps
- If a teammate fails, reassign or adjust the plan

## Current Tasks
${formatTasks(tasks)}

## Unread Messages
${formatMessages(unreadMessages)}`;
}
