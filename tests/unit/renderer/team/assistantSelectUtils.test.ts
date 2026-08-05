/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import workMateLogo from '@/renderer/assets/logos/brand/app.png';
import {
  assistantToOption,
  filterTeamSupportedAssistants,
} from '@/renderer/pages/team/components/assistantSelectUtils';
import type { Assistant } from '@/common/types/agent/assistantTypes';

describe('assistantSelectUtils', () => {
  it('localizes assistant option names for the active locale', () => {
    const bareAssistant = makeAssistant({
      id: 'bare-aionrs',
      name: 'CSBU WorkMate',
      name_i18n: { 'zh-CN': 'CSBU WorkMate' },
      source: 'generated',
      agent: { type: 'aionrs', source: 'internal' },
    });

    const option = assistantToOption(bareAssistant, 'zh-CN');

    expect(option.name).toBe('CSBU WorkMate');
  });

  it('uses the current WorkMate brand icon for the generated aionrs assistant', () => {
    const option = assistantToOption(
      makeAssistant({
        id: 'bare-aionrs',
        name: 'CSBU WorkMate',
        source: 'generated',
        avatar: '/api/assets/logos/brand/aion.svg',
        agent: { type: 'aionrs', source: 'internal' },
      })
    );

    expect(option.icon).toBe(workMateLogo);
  });

  it('preserves custom assistant avatars even when they use the aionrs runtime', () => {
    const option = assistantToOption(
      makeAssistant({
        id: 'custom-aionrs',
        name: 'Custom Assistant',
        source: 'user',
        avatar: '🦉',
        agent: { type: 'aionrs', source: 'internal' },
      })
    );

    expect(option.icon).toBe('🦉');
  });

  it('preserves backend-provided team availability for selectable assistants', () => {
    const remoteAssistant = makeAssistant({
      id: 'bare-remote',
      name: 'Remote Runner',
      source: 'generated',
      agent: { type: 'remote', source: 'custom' },
      team_selectable: true,
      team_block_reason: undefined,
    });

    const [option] = filterTeamSupportedAssistants([assistantToOption(remoteAssistant)]);

    expect(option.team_selectable).toBe(true);
    expect(option.team_block_reason).toBeUndefined();
  });

  it('keeps unchecked assistants selectable when backend projection allows team use', () => {
    const assistant = makeAssistant({
      id: 'unchecked',
      name: 'Unchecked',
      source: 'generated',
      agent: { type: 'aionrs', source: 'internal' },
      agent_status: 'unchecked',
      team_selectable: true,
    });

    const option = assistantToOption(assistant);

    expect(option.team_selectable).toBe(true);
  });
});

function makeAssistant(overrides: Partial<Assistant> & Pick<Assistant, 'id' | 'name' | 'source'>): Assistant {
  return {
    id: overrides.id,
    source: overrides.source,
    name: overrides.name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 0,
    agent_id: overrides.agent_id ?? `agent-${overrides.id}`,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    avatar: undefined,
    agent_status: 'online',
    team_selectable: true,
    team_block_reason: undefined,
    deletable: false,
    ...overrides,
  };
}
