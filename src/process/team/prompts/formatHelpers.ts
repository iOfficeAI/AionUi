import type { TeamAgent, MailboxMessage, TeamTask } from '../types';

/**
 * Format a task list for inclusion in agent prompts.
 * @param emptyMessage - Placeholder text when the list is empty (default: 'No tasks yet.')
 */
export function formatTasks(tasks: TeamTask[], emptyMessage = 'No tasks yet.'): string {
  if (tasks.length === 0) return emptyMessage;
  return tasks
    .map((t) => `- [${t.id.slice(0, 8)}] ${t.subject} (${t.status}${t.owner ? `, owner: ${t.owner}` : ''})`)
    .join('\n');
}

/** Format mailbox messages, resolving sender names from the agents list. */
export function formatMessages(messages: MailboxMessage[], agents: TeamAgent[]): string {
  if (messages.length === 0) return 'No unread messages.';
  return messages
    .map((m) => {
      if (m.fromAgentId === 'user') return `[From User] ${m.content}`;
      const sender = agents.find((a) => a.slotId === m.fromAgentId);
      return `[From ${sender?.agentName ?? m.fromAgentId}] ${m.content}`;
    })
    .join('\n');
}

/** Format a teammate list with optional rename annotations. */
export function formatTeammates(agents: TeamAgent[], renamedAgents?: Map<string, string>): string {
  if (agents.length === 0) return '(none)';
  return agents
    .map((t) => {
      const formerly = renamedAgents?.get(t.slotId);
      const formerlyNote = formerly ? ` [formerly: ${formerly}]` : '';
      return `- ${t.agentName} (${t.agentType}, status: ${t.status})${formerlyNote}`;
    })
    .join('\n');
}
