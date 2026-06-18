/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';

export type BuildAgentConversationAssistantOverrides = {
  model?: string;
  permission?: string;
  skill_ids?: string[];
  disabled_builtin_skill_ids?: string[];
  mcp_ids?: string[];
};

export type BuildAgentConversationInput = {
  backend: string;
  name: string;
  agent_id?: string;
  agent_name?: string;
  preset_assistant_id?: string;
  workspace: string;
  model: TProviderWithModel;
  cli_path?: string;
  custom_agent_id?: string;
  custom_workspace?: boolean;
  is_preset?: boolean;
  preset_agent_type?: string;
  session_mode?: string;
  current_model_id?: string;
  thought_level?: string;
  assistant_locale?: string;
  assistant_conversation_overrides?: BuildAgentConversationAssistantOverrides;
  extra?: Partial<ICreateConversationParams['extra']>;
};

export function getConversationTypeForBackend(backend: string): ICreateConversationParams['type'] {
  return backend === 'aionrs' ? 'aionrs' : 'acp';
}

export function buildAgentConversationParams(input: BuildAgentConversationInput): ICreateConversationParams {
  const {
    backend,
    name,
    agent_id,
    agent_name,
    preset_assistant_id,
    workspace,
    model,
    cli_path,
    custom_agent_id,
    custom_workspace = true,
    is_preset = false,
    preset_agent_type,
    session_mode,
    current_model_id,
    thought_level,
    assistant_locale,
    assistant_conversation_overrides,
    extra: extraOverrides,
  } = input;

  const effectivePresetType = preset_agent_type || backend;
  const effectivePresetAssistantId = preset_assistant_id || custom_agent_id;
  const type = getConversationTypeForBackend(is_preset ? effectivePresetType : backend);
  const extra: ICreateConversationParams['extra'] = {
    workspace,
    custom_workspace,
    ...extraOverrides,
  };

  if (is_preset) {
    extra.preset_assistant_id = effectivePresetAssistantId;
    if (type === 'acp') {
      extra.backend = effectivePresetType as string;
    }
  } else if (type === 'acp') {
    extra.backend = backend as string;
    extra.agent_name = agent_name || name;
    if (agent_id) extra.agent_id = agent_id;
    if (cli_path) extra.cli_path = cli_path;
    if (custom_agent_id) {
      extra.custom_agent_id = custom_agent_id;
    }
  }

  if (session_mode) extra.session_mode = session_mode;
  if (current_model_id) extra.current_model_id = current_model_id;
  if (thought_level) extra.thought_level = thought_level;

  return {
    type,
    model,
    name,
    assistant: effectivePresetAssistantId
      ? {
          id: effectivePresetAssistantId,
          locale: assistant_locale,
          conversation_overrides: assistant_conversation_overrides,
        }
      : undefined,
    extra,
  };
}
