/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AvailableAgent } from './agentTypes';

export const AVAILABLE_AGENTS_SWR_KEY = 'acp.agents.available';

const CLI_CUSTOM_PREFIX = 'cli:custom:';
const CLI_REMOTE_PREFIX = 'cli:remote:';
const CLI_PREFIX = 'cli:';
const PRESET_PREFIX = 'preset:';

export type AvailableAgentSelection =
  | { kind: 'cli'; agent: AvailableAgent }
  | { kind: 'preset'; agent: AvailableAgent };

export function filterAvailableAgentsForUi(availableAgents: AvailableAgent[]): AvailableAgent[] {
  return availableAgents.filter((agent) => !(agent.backend === 'gemini' && agent.cliPath));
}

export function getCliAgentSelectionKey(agent: AvailableAgent): string {
  if (agent.backend === 'custom' && agent.customAgentId) {
    return `${CLI_CUSTOM_PREFIX}${agent.customAgentId}`;
  }

  if (agent.backend === 'remote' && agent.customAgentId) {
    return `${CLI_REMOTE_PREFIX}${agent.customAgentId}`;
  }

  return `${CLI_PREFIX}${agent.backend}`;
}

export function getPresetAssistantSelectionKey(agent: AvailableAgent): string {
  return `${PRESET_PREFIX}${agent.customAgentId ?? agent.backend}`;
}

export function findAvailableAgentSelection(
  selectionKey: string,
  cliAgents: AvailableAgent[],
  presetAssistants: AvailableAgent[]
): AvailableAgentSelection | null {
  const cliAgent = cliAgents.find((agent) => getCliAgentSelectionKey(agent) === selectionKey);
  if (cliAgent) {
    return { kind: 'cli', agent: cliAgent };
  }

  const presetAssistant = presetAssistants.find((agent) => getPresetAssistantSelectionKey(agent) === selectionKey);
  if (presetAssistant) {
    return { kind: 'preset', agent: presetAssistant };
  }

  return null;
}

export function splitConversationDropdownAgents(availableAgents: AvailableAgent[]): {
  cliAgents: AvailableAgent[];
  presetAssistants: AvailableAgent[];
} {
  return {
    cliAgents: availableAgents.filter((agent) => !agent.isPreset),
    presetAssistants: availableAgents.filter((agent) => agent.isPreset === true),
  };
}
