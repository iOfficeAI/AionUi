// src/process/team/adapters/buildRolePrompt.ts

import type { TeamAgent, MailboxMessage, TeamTask } from '../types';
import { buildLeadPrompt } from '../prompts/leadPrompt';
import { buildTeammatePrompt } from '../prompts/teammatePrompt';

type BuildRolePromptParams = {
  agent: TeamAgent;
  mailboxMessages: MailboxMessage[];
  tasks: TeamTask[];
  teammates: TeamAgent[];
  availableAgentTypes?: Array<{ type: string; name: string }>;
  renamedAgents?: Map<string, string>;
  teamWorkspace?: string;
};

/**
 * Select the correct role prompt (lead vs teammate) based on the agent's role.
 * Used by TeammateManager.wake() to build the message payload for each agent.
 */
export function buildRolePrompt(params: BuildRolePromptParams): string {
  const { agent, mailboxMessages, tasks, teammates, availableAgentTypes, renamedAgents, teamWorkspace } = params;

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
