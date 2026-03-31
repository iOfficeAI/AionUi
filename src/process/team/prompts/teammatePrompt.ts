// src/process/team/prompts/teammatePrompt.ts

import type { MailboxMessage, TeamAgent, TeamTask } from '../types'

export type TeammatePromptParams = {
  agent: TeamAgent
  lead: TeamAgent
  teammates: TeamAgent[]
  assignedTasks: TeamTask[]
  unreadMessages: MailboxMessage[]
}

function roleDescription(agentType: string): string {
  switch (agentType.toLowerCase()) {
    case 'claude':
      return 'general-purpose AI assistant'
    case 'gemini':
      return 'Google Gemini AI assistant'
    case 'codex':
      return 'code generation specialist'
    case 'qwen':
      return 'Qwen AI assistant'
    default:
      return `${agentType} AI assistant`
  }
}

function formatTasks(tasks: TeamTask[]): string {
  if (tasks.length === 0) return 'No assigned tasks.'
  return tasks
    .map((t) => `- [${t.id.slice(0, 8)}] ${t.subject} (${t.status})`)
    .join('\n')
}

function formatMessages(messages: MailboxMessage[]): string {
  if (messages.length === 0) return 'No unread messages.'
  return messages
    .map((m) => `[From ${m.fromAgentId === 'user' ? 'User' : m.fromAgentId}] ${m.content}`)
    .join('\n')
}

/**
 * Build system prompt for a teammate agent.
 */
export function buildTeammatePrompt(params: TeammatePromptParams): string {
  const { agent, lead, teammates, assignedTasks, unreadMessages } = params

  const teammateNames =
    teammates.length === 0 ? '(none)' : teammates.map((t) => t.agentName).join(', ')

  return `# You are a Team Member

## Your Identity
Name: ${agent.agentName}, Role: ${roleDescription(agent.agentType)}

## Your Team
Lead: ${lead.agentName}
Teammates: ${teammateNames}

## Communication
- Use SendMessage to report results or ask questions
- When you finish a task, send an idle_notification
- You may communicate with other teammates directly

## Your Assigned Tasks
${formatTasks(assignedTasks)}

## Unread Messages
${formatMessages(unreadMessages)}`
}
