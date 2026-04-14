import type { TeamAgent, MailboxMessage } from '../types';

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
