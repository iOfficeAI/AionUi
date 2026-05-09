/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage } from '@/common/config/storage';
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
import { isDefaultModelIntent, resolveModelFromIntent } from '../../guid/utils/defaultModelIntent';

type ModePreference = {
  preferredMode?: string;
  yoloMode?: boolean;
};

const LEGACY_YOLO_MODE_MAP: Partial<Record<string, string>> = {
  claude: 'bypassPermissions',
  codex: 'yolo',
  gemini: 'yolo',
  qwen: 'yolo',
};

async function resolvePreferredMode(backend: string): Promise<string | undefined> {
  const modeOptions = getAgentModes(backend);
  if (modeOptions.length === 0) {
    return undefined;
  }

  let preference: ModePreference | undefined;

  if (backend === 'gemini') {
    preference = await ConfigStorage.get('gemini.config');
  } else if (backend === 'aionrs') {
    preference = await ConfigStorage.get('aionrs.config');
  } else {
    const acpConfig = await ConfigStorage.get('acp.config');
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

async function resolveUnifiedPreferredAcpModelId(backend: string): Promise<string | undefined> {
  if (
    backend !== 'claude' &&
    backend !== 'hermes' &&
    backend !== 'openclaw-gateway' &&
    backend !== 'openclaw' &&
    backend !== 'opencode'
  ) {
    return undefined;
  }

  const [savedIntent, providers] = await Promise.all([
    ConfigStorage.get('agent.defaultModelIntent'),
    ConfigStorage.get('model.config'),
  ]);

  if (!isDefaultModelIntent(savedIntent) || !Array.isArray(providers)) {
    return undefined;
  }

  const match = resolveModelFromIntent(providers, savedIntent);
  if (!match) {
    return undefined;
  }

  if (backend === 'claude') {
    return 'default';
  }

  return match.useModel;
}

async function resolvePreferredAcpModelId(backend: string): Promise<string | undefined> {
  const unifiedModelId = await resolveUnifiedPreferredAcpModelId(backend);
  if (unifiedModelId) {
    return unifiedModelId;
  }

  const acpConfig = await ConfigStorage.get('acp.config');
  const backendConfig = acpConfig?.[backend as AcpBackend] as { preferredModelId?: string } | undefined;
  const preferredModelId = backendConfig?.preferredModelId;
  if (typeof preferredModelId === 'string' && preferredModelId.trim().length > 0) {
    return preferredModelId;
  }

  const cachedModels = await ConfigStorage.get('acp.cachedModels');
  const cachedModelId = cachedModels?.[backend]?.currentModelId;
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
  const providers = await ConfigStorage.get('model.config');

  if (!providers || providers.length === 0) {
    throw new Error('No model provider configured');
  }

  const provider = providers.find((p) => p.enabled !== false);
  if (!provider) {
    throw new Error('No enabled model provider for Aion CLI');
  }

  const enabledModel = provider.model.find((m) => provider.modelEnabled?.[m] !== false);

  return {
    id: provider.id,
    platform: provider.platform,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    useModel: enabledModel || provider.model[0],
    capabilities: provider.capabilities,
    contextLimit: provider.contextLimit,
    modelProtocols: provider.modelProtocols,
    bedrockConfig: provider.bedrockConfig,
    enabled: provider.enabled,
    modelEnabled: provider.modelEnabled,
    modelHealth: provider.modelHealth,
  };
}

/**
 * Get the default Gemini model configuration from user settings.
 * Throws if no enabled provider or model is configured.
 * [BUG-3 fix]: callers must call this inside a try block
 */
export async function getDefaultGeminiModel(): Promise<TProviderWithModel> {
  const providers = await ConfigStorage.get('model.config');

  if (!providers || providers.length === 0) {
    throw new Error('No model provider configured');
  }

  const enabledProvider = providers.find((p) => p.enabled !== false);
  if (!enabledProvider) {
    throw new Error('No enabled model provider');
  }

  const enabledModel = enabledProvider.model.find((m) => enabledProvider.modelEnabled?.[m] !== false);

  return {
    id: enabledProvider.id,
    platform: enabledProvider.platform,
    name: enabledProvider.name,
    baseUrl: enabledProvider.baseUrl,
    apiKey: enabledProvider.apiKey,
    useModel: enabledModel || enabledProvider.model[0],
    capabilities: enabledProvider.capabilities,
    contextLimit: enabledProvider.contextLimit,
    modelProtocols: enabledProvider.modelProtocols,
    bedrockConfig: enabledProvider.bedrockConfig,
    enabled: enabledProvider.enabled,
    modelEnabled: enabledProvider.modelEnabled,
    modelHealth: enabledProvider.modelHealth,
  };
}

async function resolveGeminiModel(): Promise<TProviderWithModel> {
  try {
    return await getDefaultGeminiModel();
  } catch {
    return {
      id: 'gemini-placeholder',
      name: 'Gemini',
      useModel: 'default',
      platform: 'gemini-with-google-auth' as TProviderWithModel['platform'],
      baseUrl: '',
      apiKey: '',
    };
  }
}

export async function buildCliAgentParams(
  agent: AvailableAgent,
  workspace: string
): Promise<ICreateConversationParams> {
  const type = getConversationTypeForBackend(agent.backend);
  const preferredMode = await resolvePreferredMode(agent.backend);
  const preferredAcpModelId =
    type === 'acp' || type === 'openclaw-gateway' ? await resolvePreferredAcpModelId(agent.backend) : undefined;

  let model: TProviderWithModel;
  if (type === 'gemini') {
    model = await resolveGeminiModel();
  } else if (type === 'aionrs') {
    model = await getDefaultAionrsModel();
  } else {
    model = {} as TProviderWithModel;
  }

  return buildAgentConversationParams({
    backend: agent.backend,
    name: agent.name,
    agentName: agent.name,
    workspace,
    cliPath: agent.cliPath,
    customAgentId: agent.customAgentId,
    model,
    sessionMode: preferredMode,
    currentModelId: preferredAcpModelId,
  });
}

export async function buildPresetAssistantParams(
  agent: AvailableAgent,
  workspace: string,
  language: string
): Promise<ICreateConversationParams> {
  const { customAgentId, presetAgentType = 'gemini' } = agent;
  const localeKey = resolveLocaleKey(language);

  const {
    rules: presetContext,
    enabledSkills,
    disabledBuiltinSkills,
  } = await loadPresetAssistantResources({
    customAgentId,
    localeKey,
  });

  const type = getConversationTypeForBackend(presetAgentType);
  const preferredMode = await resolvePreferredMode(presetAgentType);
  const preferredAcpModelId =
    type === 'acp' || type === 'openclaw-gateway' ? await resolvePreferredAcpModelId(presetAgentType) : undefined;
  const model = type === 'gemini' ? await resolveGeminiModel() : ({} as TProviderWithModel);

  return buildAgentConversationParams({
    backend: agent.backend,
    name: agent.name,
    agentName: agent.name,
    workspace,
    customAgentId,
    isPreset: true,
    presetAgentType,
    presetResources: {
      rules: presetContext,
      enabledSkills,
      excludeBuiltinSkills: disabledBuiltinSkills,
    },
    model,
    sessionMode: preferredMode,
    currentModelId: preferredAcpModelId,
  });
}
