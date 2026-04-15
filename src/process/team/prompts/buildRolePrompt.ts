import type { TeamAgent } from '../types';
import { buildLeadPrompt } from './leadPrompt';
import { buildTeammatePrompt } from './teammatePrompt';

type BuildRolePromptParams = {
  agent: TeamAgent;
  teammates: TeamAgent[];
  /** Only needed for lead prompts */
  availableAgentTypes?: Array<{ type: string; name: string }>;
  renamedAgents?: Map<string, string>;
  teamWorkspace?: string;
};

/**
 * Build the static role prompt for an agent's first activation or crash recovery.
 * Contains only identity, rules, and workflow — no dynamic state (tasks, messages).
 * Agents pull dynamic state on demand via team_* MCP tools.
 */
export function buildRolePrompt(params: BuildRolePromptParams): string {
  const { agent, teammates, availableAgentTypes, renamedAgents, teamWorkspace } = params;

  if (agent.role === 'lead') {
    return buildLeadPrompt({
      teammates,
      availableAgentTypes,
      renamedAgents,
      teamWorkspace,
    });
  }

  // Teammate: find the lead from the full list (teammates array excludes self)
  const lead = teammates.find((t) => t.role === 'lead');
  const otherTeammates = teammates.filter((t) => t.role !== 'lead');

  return buildTeammatePrompt({
    agent,
    lead: lead ?? agent, // fallback to self if no lead found (should not happen)
    teammates: otherTeammates,
    renamedAgents,
    teamWorkspace,
  });
}
