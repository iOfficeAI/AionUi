/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_AGENTS_SWR_KEY,
  filterAvailableAgentsForUi,
  splitConversationDropdownAgents,
} from '../../src/renderer/utils/model/availableAgents';
import type { AvailableAgent } from '../../src/renderer/utils/model/agentTypes';

describe('availableAgents helpers', () => {
  const agents: AvailableAgent[] = [
    { backend: 'gemini', name: 'Gemini' },
    { backend: 'gemini', name: 'Gemini CLI', cliPath: '/usr/local/bin/gemini' },
    { backend: 'claude', name: 'Claude Code', cliPath: '/usr/local/bin/claude' },
    { backend: 'custom', name: 'Custom Agent', customAgentId: 'custom-1' },
    { backend: 'custom', name: 'Preset Assistant', customAgentId: 'builtin-writer', isPreset: true },
    { backend: 'codex', name: 'Code Review Assistant', isPreset: true, customAgentId: 'preset-1' },
  ];

  it('uses the shared SWR key for available agents', () => {
    expect(AVAILABLE_AGENTS_SWR_KEY).toBe('acp.agents.available');
  });

  it('filters out gemini cli entries but keeps builtin gemini', () => {
    expect(filterAvailableAgentsForUi(agents)).toEqual([
      { backend: 'gemini', name: 'Gemini' },
      { backend: 'claude', name: 'Claude Code', cliPath: '/usr/local/bin/claude' },
      { backend: 'custom', name: 'Custom Agent', customAgentId: 'custom-1' },
      { backend: 'custom', name: 'Preset Assistant', customAgentId: 'builtin-writer', isPreset: true },
      { backend: 'codex', name: 'Code Review Assistant', isPreset: true, customAgentId: 'preset-1' },
    ]);
  });

  it('splits conversation dropdown agents into cli and preset groups', () => {
    expect(splitConversationDropdownAgents(filterAvailableAgentsForUi(agents))).toEqual({
      cliAgents: [
        { backend: 'gemini', name: 'Gemini' },
        { backend: 'claude', name: 'Claude Code', cliPath: '/usr/local/bin/claude' },
      ],
      presetAssistants: [
        { backend: 'custom', name: 'Preset Assistant', customAgentId: 'builtin-writer', isPreset: true },
        { backend: 'codex', name: 'Code Review Assistant', isPreset: true, customAgentId: 'preset-1' },
      ],
    });
  });
});
