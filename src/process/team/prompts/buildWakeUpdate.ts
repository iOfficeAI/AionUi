import type { TeamAgent, MailboxMessage, TeamTask } from '../types';
import { formatTasks, formatMessages, formatTeammates } from './formatHelpers';

type BuildWakeUpdateParams = {
  agent: TeamAgent;
  mailboxMessages: MailboxMessage[];
  tasks: TeamTask[];
  teammates: TeamAgent[];
  renamedAgents?: Map<string, string>;
};

/**
 * Build a lightweight status update for an agent that has already received
 * its full role prompt. Contains only dynamic state: teammate statuses,
 * task board, and unread messages.
 */
export function buildWakeUpdate(params: BuildWakeUpdateParams): string {
  const { agent, mailboxMessages, tasks, teammates, renamedAgents } = params;

  if (agent.role === 'lead') {
    return buildLeadWakeUpdate(mailboxMessages, tasks, teammates, renamedAgents);
  }

  const lead = teammates.find((t) => t.role === 'lead');
  const assignedTasks = tasks.filter((t) => t.owner === agent.slotId || t.owner === agent.agentName);
  const allAgents = lead ? [lead, ...teammates.filter((t) => t.role !== 'lead')] : teammates;

  return buildTeammateWakeUpdate(mailboxMessages, assignedTasks, allAgents);
}

function buildLeadWakeUpdate(
  messages: MailboxMessage[],
  tasks: TeamTask[],
  teammates: TeamAgent[],
  renamedAgents?: Map<string, string>
): string {
  return `## Team Status Update

### Teammates
${formatTeammates(teammates, renamedAgents)}

### Task Board
${formatTasks(tasks)}

### Unread Messages
${formatMessages(messages, teammates)}`;
}

function buildTeammateWakeUpdate(
  messages: MailboxMessage[],
  assignedTasks: TeamTask[],
  allAgents: TeamAgent[]
): string {
  return `## Status Update

### Your Tasks
${formatTasks(assignedTasks, 'No assigned tasks.')}

### Unread Messages
${formatMessages(messages, allAgents)}`;
}
