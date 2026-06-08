import { describe, expect, it } from 'vitest';

import {
  cliAgentToOption,
  filterTeamSupportedAgents,
  resolveConversationType,
} from '@/renderer/pages/team/components/agentSelectUtils';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';

describe('team agent type policy', () => {
  it('resolves every non-Aion CLI backend as ACP conversation type', () => {
    expect(resolveConversationType('aionrs')).toBe('aionrs');
    expect(resolveConversationType('claude')).toBe('acp');
    expect(resolveConversationType('gemini')).toBe('acp');
    expect(resolveConversationType('openclaw-gateway')).toBe('acp');
    expect(resolveConversationType('nanobot')).toBe('acp');
    expect(resolveConversationType('remote')).toBe('acp');
  });

  it('filters retired top-level runtime agents out of team creation options', () => {
    const options = [
      cliAgentToOption(agent('acp', 'claude')),
      cliAgentToOption(agent('aionrs')),
      cliAgentToOption(agent('openclaw-gateway')),
      cliAgentToOption(agent('nanobot')),
      cliAgentToOption(agent('remote')),
      cliAgentToOption(agent('gemini')),
    ];

    expect(filterTeamSupportedAgents(options).map((option) => option.backend)).toEqual(['claude', 'aionrs']);
  });
});

function agent(agent_type: string, backend?: string): AgentMetadata {
  return {
    id: backend ?? agent_type,
    name: backend ?? agent_type,
    agent_type,
    backend,
    agent_source: 'builtin',
    team_capable: true,
  } as AgentMetadata;
}
