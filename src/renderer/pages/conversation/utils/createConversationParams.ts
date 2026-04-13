/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage } from '@/common/config/storage';
import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';
import { resolveLocaleKey } from '@/common/utils';
import { loadPresetAssistantResources } from '@/common/utils/presetAssistantResources';
import {
  buildAgentConversationParams,
  getConversationTypeForBackend,
  getConversationTypeForPreset,
} from '@/common/utils/buildAgentConversationParams';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';

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

  // aionrs supports all platforms via OpenAI-compatible protocol
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

/**
 * Resolve the Gemini model to use, falling back to a placeholder for Google Auth if needed.
 */
async function resolveGeminiModel(): Promise<TProviderWithModel> {
  try {
    return await getDefaultGeminiModel();
  } catch (e) {
    // Fallback to placeholder if no model configured (supports Google Auth users)
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

/**
 * Build ICreateConversationParams for a CLI agent.
 * The backend will automatically fill in derived fields (gateway.cliPath, runtimeValidation, etc.).
 * [BUG-3 fix]: callers must invoke this inside a try block because getDefaultGeminiModel may throw.
 */
export async function buildCliAgentParams(
  agent: AvailableAgent,
  workspace: string
): Promise<ICreateConversationParams> {
  const type = getConversationTypeForBackend(agent.backend);

  let model: TProviderWithModel;
  if (type === 'gemini') {
    model = await resolveGeminiModel();
  } else if (type === 'aionrs') {
    // Aionrs needs a real model from configured providers (anthropic, openai, ali-intl, aws)
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
  });
}

/**
 * Build ICreateConversationParams for a preset assistant.
 * Applies 4-layer fallback for reading rules and skills (BUG-1 fix).
 * Uses resolveLocaleKey() to convert i18n.language to standard locale format (BUG-2 fix).
 * [BUG-3 fix]: callers must invoke this inside a try block because getDefaultGeminiModel may throw.
 */
export async function buildPresetAssistantParams(
  agent: AvailableAgent,
  workspace: string,
  language: string
): Promise<ICreateConversationParams> {
  const { customAgentId, presetAgentType = 'gemini' } = agent;

  // [BUG-2] Map raw i18n.language to standard locale key
  const localeKey = resolveLocaleKey(language);

  const { rules: presetContext, enabledSkills } = await loadPresetAssistantResources({
    customAgentId,
    localeKey,
  });

  const type = getConversationTypeForPreset(presetAgentType);
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
    },
    model,
  });
}
