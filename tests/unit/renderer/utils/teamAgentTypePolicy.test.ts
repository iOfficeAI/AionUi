import { describe, expect, it } from 'vitest';

import {
  assistantToOption,
  filterTeamSupportedAssistants,
} from '@/renderer/pages/team/components/assistantSelectUtils';
import type { Assistant } from '@/common/types/agent/assistantTypes';

describe('team agent type policy', () => {
  it('keeps retired runtime assistants visible but non-selectable in team creation options', () => {
    // Selectability is now decided by the backend via `team_selectable`; the
    // frontend trusts that flag instead of re-deriving it from the backend slug.
    const options = [
      assistantToOption(assistant('assistant-claude', true, undefined, 'claude')),
      assistantToOption(assistant('assistant-aionrs', true, undefined, 'aionrs')),
      assistantToOption(assistant('assistant-openclaw', false, undefined, 'openclaw-gateway')),
      assistantToOption(assistant('assistant-nanobot', false, undefined, 'nanobot')),
      assistantToOption(assistant('assistant-remote', false, undefined, 'remote')),
      assistantToOption(assistant('assistant-gemini', false, undefined, 'gemini')),
    ];

    expect(filterTeamSupportedAssistants(options)).toEqual([
      expect.objectContaining({ backend: 'claude', team_capable: true }),
      expect.objectContaining({ backend: 'aionrs', team_capable: true }),
      expect.objectContaining({ backend: 'openclaw-gateway', team_capable: false }),
      expect.objectContaining({ backend: 'nanobot', team_capable: false }),
      expect.objectContaining({ backend: 'remote', team_capable: false }),
      expect.objectContaining({ backend: 'gemini', team_capable: false }),
    ]);
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

function assistant(id: string, team_selectable: boolean, team_block_reason?: string, runtimeKey = 'claude'): Assistant {
  const agentId = `agent-${runtimeKey}`;
  const isAionrs = runtimeKey === 'aionrs';
  return {
    id,
    source: 'generated',
    name: id,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 0,
    agent_id: agentId,
    agent: isAionrs
      ? { type: 'aionrs', source: 'internal' }
      : { type: 'acp', source: 'builtin', acp_backend: runtimeKey },
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    avatar: undefined,
    agent_status: 'online',
    team_selectable,
    team_block_reason,
    deletable: false,
  };
}
