/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';
import type { AcpBackend, AcpBackendAll } from '@/common/types/acpTypes';

export type BuildAgentConversationPresetResources = {
  rules?: string;
  enabled_skills?: string[];
  excludeBuiltinSkills?: string[];
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
  presetAgentType?: string;
  presetResources?: BuildAgentConversationPresetResources;
  session_mode?: string;
  current_model_id?: string;
  extra?: Partial<ICreateConversationParams['extra']>;
};

export function getConversationTypeForBackend(backend: string): ICreateConversationParams['type'] {
  switch (backend) {
    case 'gemini':
      return 'gemini';
    case 'aionrs':
      return 'aionrs';
    case 'openclaw-gateway':
    case 'openclaw':
      return 'openclaw-gateway';
    case 'nanobot':
      return 'nanobot';
    case 'remote':
      return 'remote';
    default:
      return 'acp';
  }
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
    presetAgentType,
    presetResources,
    session_mode,
    current_model_id,
    extra: extraOverrides,
  } = input;

  const effectivePresetType = presetAgentType || backend;
  const effectivePresetAssistantId = preset_assistant_id || custom_agent_id;
  const type = getConversationTypeForBackend(is_preset ? effectivePresetType : backend);
  const extra: ICreateConversationParams['extra'] = {
    workspace,
    custom_workspace,
    ...extraOverrides,
  };

  if (is_preset) {
    extra.enabled_skills = presetResources?.enabled_skills;
    extra.excludeBuiltinSkills = presetResources?.excludeBuiltinSkills;
    extra.preset_assistant_id = effectivePresetAssistantId;
    if (type === 'gemini') {
      extra.preset_rules = presetResources?.rules;
    } else {
      extra.preset_context = presetResources?.rules;
      if (type === 'acp') {
        extra.backend = effectivePresetType as AcpBackend;
      }
    }
  } else if (type === 'remote') {
    extra.remoteAgentId = custom_agent_id;
  } else if (type === 'acp' || type === 'openclaw-gateway') {
    extra.backend = backend as AcpBackendAll;
    extra.agent_name = agent_name || name;
    if (agent_id) extra.agent_id = agent_id;
    if (cli_path) extra.cli_path = cli_path;
    if (custom_agent_id) {
      extra.custom_agent_id = custom_agent_id;
    }
  }

  if (session_mode) extra.session_mode = session_mode;
  if (current_model_id) extra.current_model_id = current_model_id;

  return {
    type,
    model,
    name,
    extra,
  };
}
