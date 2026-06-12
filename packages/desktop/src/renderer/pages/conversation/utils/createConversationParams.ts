/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { ipcBridge } from '@/common';
import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { DEFAULT_CODEX_MODELS } from '@/common/types/codex/codexModels';
import { CODEX_MODE_NATIVE_FULL_ACCESS, normalizeCodexMode } from '@/common/types/codex/codexModes';
import { resolveLocaleKey } from '@/common/utils';
import {
  buildAgentConversationParams,
  getConversationTypeForBackend,
} from '@/common/utils/buildAgentConversationParams';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { getAgents } from '@/renderer/hooks/agent/useAgents';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import { getAgentModes } from '@/renderer/utils/model/agentModes';
import { hasSpecificModelCapability } from '@/renderer/utils/model/modelCapabilities';

type ModePreference = {
  preferredMode?: string;
  yoloMode?: boolean;
};

const LEGACY_YOLO_MODE_MAP: Partial<Record<string, string>> = {
  claude: 'bypassPermissions',
  codex: CODEX_MODE_NATIVE_FULL_ACCESS,
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
    preference = acpConfig?.[backend as string];
  }

  const normalizedPreferredMode =
    backend === 'codex' ? normalizeCodexMode(preference?.preferredMode) : preference?.preferredMode;
  if (normalizedPreferredMode && modeOptions.some((option) => option.value === normalizedPreferredMode)) {
    return normalizedPreferredMode;
  }

  const legacyMode = LEGACY_YOLO_MODE_MAP[backend];
  if (preference?.yoloMode && legacyMode && modeOptions.some((option) => option.value === legacyMode)) {
    return legacyMode;
  }

  return undefined;
}

async function resolvePreferredAcpModelId(backend: string): Promise<string | undefined> {
  const acpConfig = configService.get('acp.config');
  const backendConfig = acpConfig?.[backend as string] as { preferredModelId?: string } | undefined;
  const preferredModelId = backendConfig?.preferredModelId;
  if (typeof preferredModelId === 'string' && preferredModelId.trim().length > 0) {
    return preferredModelId;
  }

  // Fallback: last-seen model info persisted on the backend's agent_metadata row.
  const agents = await getAgents();
  const matched = agents.find((a) => (a.backend ?? a.agent_type) === backend);
  const handshakeModels = matched?.handshake?.available_models as AcpModelInfo | undefined;
  const handshakeModelId = handshakeModels?.current_model_id;
  if (typeof handshakeModelId === 'string' && handshakeModelId.trim().length > 0) {
    return handshakeModelId;
  }

  if (backend === 'codex' && DEFAULT_CODEX_MODELS.length > 0) {
    return DEFAULT_CODEX_MODELS[0]?.id;
  }

  return undefined;
}

function getAvailableAionrsModels(provider: IProvider): string[] {
  return (provider.models || []).filter((modelName) => {
    if (provider.model_enabled?.[modelName] === false) {
      return false;
    }
    const functionCalling = hasSpecificModelCapability(provider, modelName, 'function_calling');
    const excluded = hasSpecificModelCapability(provider, modelName, 'excludeFromPrimary');
    return (functionCalling === true || functionCalling === undefined) && excluded !== true;
  });
}

function isAionrsCompatibleProvider(provider: IProvider): boolean {
  const platform = provider.platform?.toLowerCase() ?? '';
  if (provider.enabled === false || platform.includes('gemini-with-google-auth')) {
    return false;
  }
  return getAvailableAionrsModels(provider).length > 0;
}

/**
 * Get a model from configured providers that is compatible with aionrs.
 * Respects the user's saved `aionrs.defaultModel` selection when it still
 * exists in the current provider list, otherwise falls back to the first
 * compatible provider/model pair.
 */
export async function getDefaultAionrsModel(): Promise<TProviderWithModel> {
  const providers = await ipcBridge.mode.listProviders.invoke();

  if (!providers || providers.length === 0) {
    throw new Error('No model provider configured');
  }

  const compatibleProviders = providers.filter(isAionrsCompatibleProvider);
  if (compatibleProviders.length === 0) {
    throw new Error('No enabled model provider for Aion CLI');
  }

  const savedDefault = configService.get('aionrs.defaultModel');
  if (savedDefault?.id && savedDefault.use_model) {
    const savedProvider = compatibleProviders.find((provider) => provider.id === savedDefault.id);
    if (savedProvider && getAvailableAionrsModels(savedProvider).includes(savedDefault.use_model)) {
      return {
        ...savedProvider,
        use_model: savedDefault.use_model,
      };
    }
  }

  const provider = compatibleProviders[0];
  const enabledModel = getAvailableAionrsModels(provider)[0];

  return {
    id: provider.id,
    platform: provider.platform,
    name: provider.name,
    base_url: provider.base_url,
    api_key: provider.api_key,
    use_model: enabledModel || provider.models[0],
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
export async function buildCliAgentParams(agent: AgentMetadata, workspace: string): Promise<ICreateConversationParams> {
  const agentKey = agent.backend || agent.agent_type;
  const type = getConversationTypeForBackend(agentKey);
  const preferredMode = await resolvePreferredMode(agentKey);
  const preferredAcpModelId = type === 'acp' ? await resolvePreferredAcpModelId(agentKey) : undefined;

  let model: TProviderWithModel;
  if (type === 'aionrs') {
    // Aionrs needs a real model from configured providers (anthropic, openai, ali-intl, aws)
    model = await getDefaultAionrsModel();
  } else {
    model = {} as TProviderWithModel;
  }

  return buildAgentConversationParams({
    backend: agentKey,
    name: agent.name,
    agent_id: agent.id,
    agent_name: agent.name,
    workspace,
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
  assistant: Assistant,
  workspace: string,
  language: string
): Promise<ICreateConversationParams> {
  const preset_agent_type = assistant.preset_agent_type || 'claude';
  const custom_agent_id = assistant.id;

  const localeKey = resolveLocaleKey(language);

  const preferredMode = await resolvePreferredMode(preset_agent_type);
  const type = getConversationTypeForBackend(preset_agent_type);
  const preferredAcpModelId = type === 'acp' ? await resolvePreferredAcpModelId(preset_agent_type) : undefined;
  const model = {} as TProviderWithModel;

  return buildAgentConversationParams({
    backend: preset_agent_type,
    name: assistant.name,
    agent_name: assistant.name,
    workspace,
    custom_agent_id,
    is_preset: true,
    preset_agent_type,
    assistant_locale: localeKey,
    assistant_conversation_overrides: {
      model: preferredAcpModelId,
      skill_ids: assistant.enabled_skills.length > 0 ? assistant.enabled_skills : undefined,
      disabled_builtin_skill_ids:
        assistant.disabled_builtin_skills.length > 0 ? assistant.disabled_builtin_skills : undefined,
    },
    model,
    session_mode: preferredMode,
    current_model_id: preferredAcpModelId,
  });
}
