import type { TeamAgent } from '../types';
import { buildLeaderPrompt } from './leadPrompt';
import { buildTeammatePrompt } from './teammatePrompt';

type BuildRolePromptParams = {
  agent: TeamAgent;
  teammates: TeamAgent[];
  /** Only needed for leader prompts */
  availableAgentTypes?: Array<{ type: string; name: string }>;
  /** Only needed for leader prompts — preset assistants spawnable via custom_agent_id */
  availableAssistants?: Array<{ customAgentId: string; name: string; backend: string; description?: string }>;
  renamedAgents?: Map<string, string>;
  teamWorkspace?: string;
};

/**
 * Build the static role prompt for an agent's first activation or crash recovery.
 * Contains only identity, rules, and workflow — no dynamic state (tasks, messages).
 * Agents pull dynamic state on demand via team_* MCP tools.
 */
export function buildRolePrompt(params: BuildRolePromptParams): string {
  const { agent, teammates, availableAgentTypes, availableAssistants, renamedAgents, teamWorkspace } = params;

  if (agent.role === 'leader') {
    return buildLeaderPrompt({
      teammates,
      availableAgentTypes,
      availableAssistants,
      renamedAgents,
      teamWorkspace,
    });
  }

  const leader = teammates.find((t) => t.role === 'leader');
  const otherTeammates = teammates.filter((t) => t.role !== 'leader');

  return buildTeammatePrompt({
    agent,
    leader: leader ?? agent,
    teammates: otherTeammates,
    renamedAgents,
    teamWorkspace,
  });
}
