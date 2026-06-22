/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronAgentConfigWrite } from '@/common/adapter/ipcBridge';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { resolveAssistantName } from '@renderer/utils/model/assistantDisplay';

type SelectedAionrsProvider = {
  id?: string;
  name?: string;
};

type ResolveCronAgentConfigInput = {
  agentValue: string;
  presetAssistants: Assistant[];
  selectedAionrsProvider?: SelectedAionrsProvider;
  model_id?: string;
  config_options?: Record<string, string>;
  workspace?: string;
  localeKey?: string;
  getMode: (backend: string) => string | undefined;
  aionrsModelRequiredMessage: string;
};

type ResolveCronAgentConfigResult = {
  agent_config: ICronAgentConfigWrite | undefined;
};

export function resolveCronAgentConfig(input: ResolveCronAgentConfigInput): ResolveCronAgentConfigResult {
  const {
    agentValue,
    presetAssistants,
    selectedAionrsProvider,
    model_id,
    config_options,
    workspace,
    localeKey = 'en-US',
    getMode,
    aionrsModelRequiredMessage,
  } = input;

  const colonIdx = agentValue.indexOf(':');
  const prefixedId = colonIdx >= 0 ? agentValue.substring(colonIdx + 1) : agentValue;
  const assistantSelection = presetAssistants.find((item) => item.id === prefixedId || item.id === agentValue);
  if (!assistantSelection) {
    throw new Error('assistant_id is required');
  }

  let agent_config: ICronAgentConfigWrite | undefined;

  const assistant = assistantSelection;
  const presetBackend = assistant.preset_agent_type;
  const assistantName = resolveAssistantName(assistant, localeKey, assistant.name);

  if (presetBackend === 'aionrs') {
    if (!selectedAionrsProvider?.id || !model_id) {
      throw new Error(aionrsModelRequiredMessage);
    }
    agent_config = {
      backend: selectedAionrsProvider.id,
      name: assistantName,
      assistant_id: assistant.id,
      mode: getMode(presetBackend),
      model_id,
      workspace,
    };
  } else {
    agent_config = {
      name: assistantName,
      assistant_id: assistant.id,
      mode: getMode(presetBackend),
      model_id,
      config_options,
      workspace,
    };
  }

  return { agent_config };
}
