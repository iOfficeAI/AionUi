/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateCronJobParams, ICronAgentConfig } from '@/common/adapter/ipcBridge';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { AgentMetadata } from '@renderer/utils/model/agentTypes';
import {
  normalizeSupportedAgentSelection,
  resolveSupportedConversationType,
} from '@renderer/utils/model/agentTypeSupportPolicy';

type SelectedAionrsProvider = {
  id?: string;
  name?: string;
};

type ResolveCronAgentConfigInput = {
  agentValue: string;
  conversationAgentType?: string;
  cliAgents: AgentMetadata[];
  presetAssistants: Assistant[];
  selectedAionrsProvider?: SelectedAionrsProvider;
  model_id?: string;
  config_options?: Record<string, string>;
  workspace?: string;
  getMode: (backend: string) => string | undefined;
  aionrsModelRequiredMessage: string;
};

type ResolveCronAgentConfigResult = {
  agent_config: ICronAgentConfig | undefined;
  resolvedAgentType: ICreateCronJobParams['agent_type'];
};

export function resolveCronAgentConfig(input: ResolveCronAgentConfigInput): ResolveCronAgentConfigResult {
  const {
    agentValue,
    conversationAgentType,
    cliAgents,
    presetAssistants,
    selectedAionrsProvider,
    model_id,
    config_options,
    workspace,
    getMode,
    aionrsModelRequiredMessage,
  } = input;

  const colonIdx = agentValue.indexOf(':');
  const agentKind = colonIdx >= 0 ? agentValue.substring(0, colonIdx) : 'cli';
  const agentId = colonIdx >= 0 ? agentValue.substring(colonIdx + 1) : agentValue;

  let agent_config: ICronAgentConfig | undefined;
  let resolvedAgentType: ICreateCronJobParams['agent_type'] = resolveSupportedConversationType(
    conversationAgentType || 'acp'
  );

  if (agentKind === 'cli') {
    const agent = cliAgents.find((item) => item.backend === agentId || item.agent_type === agentId);
    const backend = (agent?.backend || agent?.agent_type || agentId) as string;

    // Normalize agent type: legacy types like 'codex', 'claude', 'qoder' should be treated as ACP
    const normalized = normalizeSupportedAgentSelection(agent?.agent_type, backend);
    const effectiveBackend = normalized?.backend || backend;
    const isAcpType = normalized?.agent_type === 'acp';

    if (backend === 'aionrs') {
      if (!selectedAionrsProvider?.id || !model_id) {
        throw new Error(aionrsModelRequiredMessage);
      }
      resolvedAgentType = 'aionrs';
      agent_config = {
        backend: selectedAionrsProvider.id,
        name: selectedAionrsProvider.name || agent?.name || 'Aion CLI',
        mode: getMode('aionrs'),
        model_id,
        workspace,
      };
    } else if (isAcpType || agent?.agent_type === 'acp') {
      const capitalizedBackend = effectiveBackend.charAt(0).toUpperCase() + effectiveBackend.slice(1);
      resolvedAgentType = 'acp';
      agent_config = {
        backend: effectiveBackend,
        name: agent?.name || capitalizedBackend,
        mode: getMode(effectiveBackend),
        model_id,
        config_options,
        workspace,
      };
    } else if (agent) {
      // Fallback for any other agent type: build agent_config to prevent missing 'name' field
      const capitalizedBackend = effectiveBackend.charAt(0).toUpperCase() + effectiveBackend.slice(1);
      resolvedAgentType = resolveSupportedConversationType(effectiveBackend);
      agent_config = {
        backend: effectiveBackend,
        name: agent.name || capitalizedBackend,
        mode: getMode(effectiveBackend),
        model_id,
        workspace,
      };
    }
  } else if (agentKind === 'preset') {
    const assistant = presetAssistants.find((item) => item.id === agentId);
    if (assistant) {
      const presetBackend = assistant.preset_agent_type;
      resolvedAgentType = resolveSupportedConversationType(presetBackend);

      if (presetBackend === 'aionrs') {
        if (!selectedAionrsProvider?.id || !model_id) {
          throw new Error(aionrsModelRequiredMessage);
        }
        agent_config = {
          backend: selectedAionrsProvider.id,
          name: assistant.name,
          is_preset: true,
          custom_agent_id: assistant.id,
          preset_agent_type: presetBackend,
          mode: getMode(presetBackend),
          model_id,
          workspace,
        };
      } else {
        agent_config = {
          backend: presetBackend as string,
          name: assistant.name,
          is_preset: true,
          custom_agent_id: assistant.id,
          preset_agent_type: presetBackend,
          mode: getMode(presetBackend),
          model_id,
          config_options,
          workspace,
        };
      }
    }
  }

  return { agent_config, resolvedAgentType };
}
