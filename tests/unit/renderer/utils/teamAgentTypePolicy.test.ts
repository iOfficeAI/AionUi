import { describe, expect, it } from 'vitest';

import {
  assistantToOption,
  cliAgentToOption,
  filterTeamSupportedAgents,
  resolveConversationType,
} from '@/renderer/pages/team/components/agentSelectUtils';
import type { Assistant } from '@/common/types/agent/assistantTypes';
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

  it('keeps assistants out of team creation when their backend is not team capable', () => {
    const capableKeys = new Set(['aionrs']);
    const options = [
      assistantToOption(assistant('bare-aionrs', 'Aion CLI', 'aionrs'), capableKeys),
      assistantToOption(assistant('custom-qwen', 'Qwen Helper', 'qwen'), capableKeys),
    ];

    expect(filterTeamSupportedAgents(options).map((option) => option.id)).toEqual(['bare-aionrs']);
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

function assistant(id: string, name: string, preset_agent_type: string): Assistant {
  return {
    id,
    source: 'user',
    name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 0,
    preset_agent_type,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
  };
}
