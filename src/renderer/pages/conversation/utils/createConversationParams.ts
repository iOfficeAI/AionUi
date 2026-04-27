/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { ipcBridge } from '@/common';
import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';
import type { AcpBackend } from '@/common/types/acpTypes';
import { DEFAULT_CODEX_MODELS } from '@/common/types/codex/codexModels';
import { resolveLocaleKey } from '@/common/utils';
import { loadPresetAssistantResources } from '@/common/utils/presetAssistantResources';
import {
  buildAgentConversationParams,
  getConversationTypeForBackend,
} from '@/common/utils/buildAgentConversationParams';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';
import { getAgentModes } from '@/renderer/utils/model/agentModes';

type ModePreference = {
  preferredMode?: string;
  yoloMode?: boolean;
};

const LEGACY_YOLO_MODE_MAP: Partial<Record<string, string>> = {
  claude: 'bypassPermissions',
  codex: 'yolo',
  qwen: 'yolo',
};

async function resolvePreferredMode(backend: string): Promise<string | undefined> {
  const modeOptions = getAgentModes(backend);
  if (modeOptions.length === 0) {
    return undefined;
  }

  let preference: ModePreference | undefined;

  if (backend === 'aionrs') {
    preference = configService.get('aionrs.config');
  } else {
    const acpConfig = configService.get('acp.config');
    preference = acpConfig?.[backend as AcpBackend];
  }

  if (preference?.preferredMode && modeOptions.some((option) => option.value === preference.preferredMode)) {
    return preference.preferredMode;
  }

  const legacyMode = LEGACY_YOLO_MODE_MAP[backend];
  if (preference?.yoloMode && legacyMode && modeOptions.some((option) => option.value === legacyMode)) {
    return legacyMode;
  }

  return undefined;
}

async function resolvePreferredAcpModelId(backend: string): Promise<string | undefined> {
  const acpConfig = configService.get('acp.config');
  const backendConfig = acpConfig?.[backend as AcpBackend] as { preferredModelId?: string } | undefined;
  const preferredModelId = backendConfig?.preferredModelId;
  if (typeof preferredModelId === 'string' && preferredModelId.trim().length > 0) {
    return preferredModelId;
  }

  const cachedModels = configService.get('acp.cachedModels');
  const cachedModelId = cachedModels?.[backend]?.current_model_id;
  if (typeof cachedModelId === 'string' && cachedModelId.trim().length > 0) {
    return cachedModelId;
  }

  if (backend === 'codex' && DEFAULT_CODEX_MODELS.length > 0) {
    return DEFAULT_CODEX_MODELS[0]?.id;
  }

  return undefined;
}

/**
 * Get a model from configured providers that is compatible with aionrs.
 * aionrs supports all platforms via OpenAI-compatible protocol.
 * Throws if no compatible provider is configured.
 */
export async function getDefaultAionrsModel(): Promise<TProviderWithModel> {
  const providers = await ipcBridge.mode.listProviders.invoke();

  if (!providers || providers.length === 0) {
    throw new Error('No model provider configured');
  }

  // aionrs supports all platforms via OpenAI-compatible protocol
  const provider = providers.find((p) => p.enabled !== false);
  if (!provider) {
    throw new Error('No enabled model provider for Aion CLI');
  }

  const enabledModel = provider.models.find((m) => provider.model_enabled?.[m] !== false);

  return {
    id: provider.id,
    platform: provider.platform,
    name: provider.name,
    base_url: provider.base_url,
    api_key: provider.api_key,
    useModel: enabledModel || provider.models[0],
    capabilities: provider.capabilities,
    context_limit: provider.context_limit,
    model_protocols: provider.model_protocols,
    bedrock_config: provider.bedrock_config,
    enabled: provider.enabled,
    model_enabled: provider.model_enabled,
    model_health: provider.model_health,
  };
}

/**
 * Build ICreateConversationParams for a CLI agent.
 * The backend will automatically fill in derived fields (gateway.cli_path, runtimeValidation, etc.).
 */
export async function buildCliAgentParams(
  agent: AvailableAgent,
  workspace: string
): Promise<ICreateConversationParams> {
  const type = getConversationTypeForBackend(agent.backend);
  const preferredMode = await resolvePreferredMode(agent.backend);
  const preferredAcpModelId = type === 'acp' ? await resolvePreferredAcpModelId(agent.backend) : undefined;

  let model: TProviderWithModel;
  if (type === 'aionrs') {
    // Aionrs needs a real model from configured providers (anthropic, openai, ali-intl, aws)
    model = await getDefaultAionrsModel();
  } else {
    model = {} as TProviderWithModel;
  }

  return buildAgentConversationParams({
    backend: agent.backend,
    name: agent.name,
    agent_id: agent.id,
    agent_name: agent.name,
    workspace,
    cli_path: agent.cli_path,
    custom_agent_id: agent.custom_agent_id,
    model,
    session_mode: preferredMode,
    current_model_id: preferredAcpModelId,
  });
}

/**
 * Build ICreateConversationParams for a preset assistant.
 * Applies 4-layer fallback for reading rules and skills (BUG-1 fix).
 * Uses resolveLocaleKey() to convert i18n.language to standard locale format (BUG-2 fix).
 */
export async function buildPresetAssistantParams(
  agent: AvailableAgent,
  workspace: string,
  language: string
): Promise<ICreateConversationParams> {
  const { custom_agent_id, presetAgentType = 'claude' } = agent;

  // [BUG-2] Map raw i18n.language to standard locale key
  const localeKey = resolveLocaleKey(language);

  const {
    rules: preset_context,
    enabled_skills,
    disabledBuiltinSkills,
  } = await loadPresetAssistantResources({
    custom_agent_id,
    localeKey,
  });

  const preferredMode = await resolvePreferredMode(presetAgentType);
  const type = getConversationTypeForBackend(presetAgentType);
  const preferredAcpModelId = type === 'acp' ? await resolvePreferredAcpModelId(presetAgentType) : undefined;
  const model = {} as TProviderWithModel;

  return buildAgentConversationParams({
    backend: agent.backend,
    name: agent.name,
    agent_name: agent.name,
    workspace,
    custom_agent_id,
    is_preset: true,
    presetAgentType,
    presetResources: {
      rules: preset_context,
      enabled_skills,
      excludeBuiltinSkills: disabledBuiltinSkills,
    },
    model,
    session_mode: preferredMode,
    current_model_id: preferredAcpModelId,
  });
}
