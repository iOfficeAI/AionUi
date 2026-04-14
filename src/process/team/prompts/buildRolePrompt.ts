import type { TeamAgent, MailboxMessage, TeamTask } from '../types';
import { buildLeadPrompt } from './leadPrompt';
import { buildTeammatePrompt } from './teammatePrompt';
import { buildWakeUpdate } from './buildWakeUpdate';

type BuildRolePromptParams = {
  agent: TeamAgent;
  mailboxMessages: MailboxMessage[];
  tasks: TeamTask[];
  teammates: TeamAgent[];
  /** Only needed for lead full prompts */
  availableAgentTypes?: Array<{ type: string; name: string }>;
  renamedAgents?: Map<string, string>;
  teamWorkspace?: string;
  /** When false, send a lightweight status update instead of the full role prompt */
  needsFullPrompt?: boolean;
};

/**
 * Select the correct prompt for an agent wake:
 * - Full role prompt (first wake or crash recovery): static rules + dynamic state
 * - Wake update (subsequent wakes): dynamic state only
 */
export function buildRolePrompt(params: BuildRolePromptParams): string {
  const {
    agent,
    mailboxMessages,
    tasks,
    teammates,
    availableAgentTypes,
    renamedAgents,
    teamWorkspace,
    needsFullPrompt = true,
  } = params;

  if (!needsFullPrompt) {
    return buildWakeUpdate({
      agent,
      mailboxMessages,
      tasks,
      teammates,
      renamedAgents,
    });
  }

  if (agent.role === 'lead') {
    return buildLeadPrompt({
      teammates,
      tasks,
      unreadMessages: mailboxMessages,
      availableAgentTypes,
      renamedAgents,
      teamWorkspace,
    });
  }

  // Teammate: find the lead from the full list (teammates array excludes self)
  const lead = teammates.find((t) => t.role === 'lead');
  const otherTeammates = teammates.filter((t) => t.role !== 'lead');
  const assignedTasks = tasks.filter((t) => t.owner === agent.slotId || t.owner === agent.agentName);

  return buildTeammatePrompt({
    agent,
    lead: lead ?? agent, // fallback to self if no lead found (should not happen)
    teammates: otherTeammates,
    assignedTasks,
    unreadMessages: mailboxMessages,
    renamedAgents,
    teamWorkspace,
  });
}
