import { describe, expect, it } from 'vitest';

import {
  assistantToOption,
  filterTeamSupportedAssistants,
  resolveConversationType,
} from '@/renderer/pages/team/components/assistantSelectUtils';
import type { Assistant } from '@/common/types/agent/assistantTypes';

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
      assistantToOption(assistant('assistant-claude', true, undefined, 'claude')),
      assistantToOption(assistant('assistant-aionrs', true, undefined, 'aionrs')),
      assistantToOption(assistant('assistant-openclaw', true, undefined, 'openclaw-gateway')),
      assistantToOption(assistant('assistant-nanobot', true, undefined, 'nanobot')),
      assistantToOption(assistant('assistant-remote', true, undefined, 'remote')),
      assistantToOption(assistant('assistant-gemini', true, undefined, 'gemini')),
    ];

    expect(filterTeamSupportedAssistants(options).map((option) => option.backend)).toEqual(['claude', 'aionrs']);
  });

  it('maps assistant team selectability directly from the assistant catalog', () => {
    const selectable = assistantToOption(assistant('assistant-1', true, undefined));
    const blocked = assistantToOption(assistant('assistant-2', false, 'agent unavailable'));

    expect(selectable.team_capable).toBe(true);
    expect(selectable.team_block_reason).toBeUndefined();
    expect(blocked.team_capable).toBe(false);
    expect(blocked.team_block_reason).toBe('agent unavailable');
  });

  it('keeps assistant candidate options assistant-first and does not expose legacy agent_type', () => {
    const option = assistantToOption(assistant('assistant-1', true, undefined, 'claude'));

    expect(option.backend).toBe('claude');
    expect(option).not.toHaveProperty('agent_type');
  });

  it('keeps blocked assistants in the team list instead of filtering them out', () => {
    const options = [
      assistantToOption(assistant('assistant-1', true, undefined)),
      assistantToOption(assistant('assistant-2', false, 'agent unavailable')),
    ];

    expect(filterTeamSupportedAssistants(options).map((option) => option.id)).toEqual(['assistant-1', 'assistant-2']);
  });
});

function assistant(
  id: string,
  team_selectable: boolean,
  team_block_reason?: string,
  preset_agent_type = 'claude'
): Assistant {
  return {
    id,
    source: 'bare',
    name: id,
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
    avatar: undefined,
    agent_status: 'available',
    team_selectable,
    team_block_reason,
    deletable: false,
  };
}
