/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AvailableAgent } from './agentTypes';

export const AVAILABLE_AGENTS_SWR_KEY = 'acp.agents.available';

export function filterAvailableAgentsForUi(availableAgents: AvailableAgent[]): AvailableAgent[] {
  return availableAgents.filter((agent) => !(agent.backend === 'gemini' && agent.cliPath));
}

export function splitConversationDropdownAgents(availableAgents: AvailableAgent[]): {
  cliAgents: AvailableAgent[];
  presetAssistants: AvailableAgent[];
} {
  return {
    cliAgents: availableAgents.filter((agent) => agent.backend !== 'custom' && !agent.isPreset),
    presetAssistants: availableAgents.filter((agent) => agent.isPreset === true),
  };
}
