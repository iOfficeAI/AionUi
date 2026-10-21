/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import {
  buildChannelAssistantBinding,
  getDefaultChannelAssistant,
  resolveChannelAssistantId,
  resolveChannelAssistantSelection,
} from '@/renderer/components/settings/SettingsModal/contents/channels/assistantBinding';
import { describe, expect, it } from 'vitest';

function assistant(overrides: Partial<Assistant> & Pick<Assistant, 'id' | 'name' | 'preset_agent_type'>): Assistant {
  return {
    id: overrides.id,
    source: overrides.source ?? 'user',
    name: overrides.name,
    name_i18n: {},
    description: overrides.description,
    description_i18n: {},
    avatar: overrides.avatar,
    enabled: overrides.enabled ?? true,
    sort_order: overrides.sort_order ?? 1000,
    preset_agent_type: overrides.preset_agent_type,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    prompts: [],
    prompts_i18n: {},
    models: [],
    agent_status: 'online',
    team_selectable: true,
    deletable: true,
    ...overrides,
  };
}

describe('channel assistant binding helpers', () => {
  const assistants = [
    assistant({ id: 'bare-aionrs', name: 'Aion CLI', source: 'generated', preset_agent_type: 'aionrs' }),
    assistant({ id: 'bare-claude', name: 'Claude', source: 'generated', preset_agent_type: 'claude' }),
    assistant({ id: 'user-writer', name: 'Writer', source: 'user', preset_agent_type: 'claude' }),
  ];

  it('prefers the generated aionrs assistant as the default selection', () => {
    expect(getDefaultChannelAssistant(assistants)?.id).toBe('bare-aionrs');
  });

  it('resolves explicit assistant ids from new channel bindings', () => {
    expect(resolveChannelAssistantId({ assistant_id: 'user-writer' }, assistants)).toBe('user-writer');
  });

  it('falls back to the default assistant only when no binding was saved', () => {
    expect(resolveChannelAssistantId(undefined, assistants)).toBe('bare-aionrs');
  });

  it('marks unresolved saved bindings instead of silently selecting a default assistant', () => {
    expect(resolveChannelAssistantSelection({ custom_agent_id: 'bare-claude' }, assistants)).toEqual({
      assistantId: undefined,
      hasBrokenSavedAssistant: true,
    });
    expect(resolveChannelAssistantSelection({ backend: 'claude' }, assistants)).toEqual({
      assistantId: undefined,
      hasBrokenSavedAssistant: true,
    });
    expect(resolveChannelAssistantSelection({ agent_type: 'claude' }, assistants)).toEqual({
      assistantId: undefined,
      hasBrokenSavedAssistant: true,
    });
    expect(resolveChannelAssistantSelection({ backend: 'missing-backend' }, assistants)).toEqual({
      assistantId: undefined,
      hasBrokenSavedAssistant: true,
    });
    expect(resolveChannelAssistantSelection({ assistant_id: 'missing-assistant' }, assistants)).toEqual({
      assistantId: undefined,
      hasBrokenSavedAssistant: true,
    });
  });

  it('serializes only assistant identity for new channel bindings', () => {
    expect(buildChannelAssistantBinding(assistants[1])).toEqual({
      assistant_id: 'bare-claude',
    });
  });
});
