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
  exclude_builtin_skills?: string[];
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
  preset_resources?: BuildAgentConversationPresetResources;
  session_mode?: string;
  current_model_id?: string;
  extra?: Partial<ICreateConversationParams['extra']>;
};

export function getConversationTypeForBackend(backend: string): ICreateConversationParams['type'] {
  switch (backend) {
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
    preset_agent_type,
    preset_resources,
    session_mode,
    current_model_id,
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
    extra.enabled_skills = preset_resources?.enabled_skills;
    extra.exclude_builtin_skills = preset_resources?.exclude_builtin_skills;
    extra.preset_assistant_id = effectivePresetAssistantId;
    extra.preset_context = preset_resources?.rules;
    if (type === 'acp') {
      extra.backend = effectivePresetType as AcpBackend;
    }
  } else if (type === 'remote') {
    extra.remote_agent_id = custom_agent_id;
  } else if (type === 'openclaw-gateway') {
    extra.agent_name = agent_name || name;
    extra.gateway = {
      cli_path,
    };
    if (custom_agent_id) {
      extra.custom_agent_id = custom_agent_id;
    }
  } else if (type === 'acp') {
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
