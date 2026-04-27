import type { TeamAgent, MailboxMessage } from '../types';

/** Format mailbox messages, resolving sender names from the agents list. */
export function formatMessages(messages: MailboxMessage[], agents: TeamAgent[]): string {
  if (messages.length === 0) return 'No unread messages.';
  return messages
    .map((m) => {
      const filesNote = m.files?.length ? `\nFiles: ${m.files.join(', ')}` : '';
      if (m.from_agent_id === 'user') return `[From User] ${m.content}${filesNote}`;
      const sender = agents.find((a) => a.slot_id === m.from_agent_id);
      return `[From ${sender?.agent_name ?? m.from_agent_id}] ${m.content}${filesNote}`;
    })
    .join('\n');
}
