/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import type { AcpBackend, AcpSessionConfigOption } from '@/common/types/acpTypes';
import type { DetectedAgentKind } from '@/common/types/detectedAgent';
import { normalizeCodexConfigOptions, normalizeCodexConfigOptionValues } from '@/common/types/codex/codexConfigOptions';
import { resolveAvailableModel, resolveLocaleKey } from '@/common/utils';
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
  gemini: 'yolo',
  iflow: 'yolo',
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

async function resolvePreferredAcpModelId(backend: string): Promise<string | undefined> {
  if (backend === 'codex') {
    return undefined;
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

  return undefined;
}

type AcpConfigSelection = {
  cachedConfigOptions?: AcpSessionConfigOption[];
  configOptionValues?: Record<string, string>;
};

type ConversationAcpConfigExtra = {
  workspace?: string;
  backend?: string;
  configOptionValues?: Record<string, string>;
  cachedConfigOptions?: AcpSessionConfigOption[];
};

type ConversationAionrsConfigExtra = {
  workspace?: string;
  sessionMode?: string;
  reasoningEffort?: string;
};

function isDetectedAgentKind(kind: unknown): kind is DetectedAgentKind {
  return (
    kind === 'gemini' ||
    kind === 'acp' ||
    kind === 'remote' ||
    kind === 'aionrs' ||
    kind === 'openclaw-gateway' ||
    kind === 'nanobot' ||
    kind === 'codex'
  );
}

function getConversationAcpBackend(conversation: TChatConversation): string | undefined {
  if (conversation.type === 'codex') {
    return 'codex';
  }
  if (conversation.type !== 'acp') {
    return undefined;
  }
  const extra = conversation.extra as ConversationAcpConfigExtra | undefined;
  return extra?.backend;
}

function cloneConfigOptions(options: AcpSessionConfigOption[]): AcpSessionConfigOption[] {
  return options.map((option) => ({
    ...option,
    options: option.options?.map((choice) => ({ ...choice })),
  }));
}

function extractConfigOptionValues(options?: AcpSessionConfigOption[]): Record<string, string> {
  if (!Array.isArray(options)) {
    return {};
  }
  return options.reduce<Record<string, string>>((acc, option) => {
    const value = option.currentValue ?? option.selectedValue;
    if (option.id && value !== undefined && value !== null) {
      acc[option.id] = String(value);
    }
    return acc;
  }, {});
}

export function applyWorkspaceConversationConfigDefaults(
  params: ICreateConversationParams,
  sourceConversation: TChatConversation | null | undefined,
  backend: string
): ICreateConversationParams {
  if (!sourceConversation) {
    return params;
  }

  if (params.type === 'aionrs') {
    if (backend !== 'aionrs' || sourceConversation.type !== 'aionrs') {
      return params;
    }

    const sourceExtra = sourceConversation.extra as ConversationAionrsConfigExtra | undefined;
    const targetWorkspace = params.extra?.workspace;
    if (!targetWorkspace || sourceExtra?.workspace !== targetWorkspace) {
      return params;
    }

    if (!sourceExtra.sessionMode && !sourceExtra.reasoningEffort) {
      return params;
    }

    return {
      ...params,
      extra: {
        ...params.extra,
        ...(sourceExtra.sessionMode ? { sessionMode: sourceExtra.sessionMode } : {}),
        ...(sourceExtra.reasoningEffort ? { reasoningEffort: sourceExtra.reasoningEffort } : {}),
      },
    };
  }

  if (params.type !== 'acp' && params.type !== 'codex') {
    return params;
  }

  const sourceExtra = sourceConversation.extra as ConversationAcpConfigExtra | undefined;
  const targetWorkspace = params.extra?.workspace;
  if (!targetWorkspace || sourceExtra?.workspace !== targetWorkspace) {
    return params;
  }

  if (getConversationAcpBackend(sourceConversation) !== backend) {
    return params;
  }

  const cachedConfigOptions = Array.isArray(sourceExtra.cachedConfigOptions)
    ? cloneConfigOptions(sourceExtra.cachedConfigOptions)
    : undefined;
  const configOptionValues = {
    ...sourceExtra.configOptionValues,
    ...extractConfigOptionValues(cachedConfigOptions),
  };
  const hasConfigOptionValues = Object.keys(configOptionValues).length > 0;

  if (!cachedConfigOptions?.length && !hasConfigOptionValues) {
    return params;
  }

  return {
    ...params,
    extra: {
      ...params.extra,
      ...(cachedConfigOptions?.length ? { cachedConfigOptions } : {}),
      ...(hasConfigOptionValues ? { configOptionValues } : {}),
      pendingConfigOptions: undefined,
    },
  };
}

async function resolvePreferredAcpConfigSelection(backend: string): Promise<AcpConfigSelection> {
  const [acpConfig, cachedConfigOptions] = await Promise.all([
    ConfigStorage.get('acp.config'),
    ConfigStorage.get('acp.cachedConfigOptions'),
  ]);
  const preferredConfigOptions = acpConfig?.[backend as AcpBackend]?.preferredConfigOptions;
  const normalizedPreferredConfigOptions =
    backend === 'codex' ? normalizeCodexConfigOptionValues(preferredConfigOptions) : preferredConfigOptions;
  const cachedOptions = cachedConfigOptions?.[backend as AcpBackend];
  const normalizedCachedOptions =
    backend === 'codex' && Array.isArray(cachedOptions) ? normalizeCodexConfigOptions(cachedOptions) : cachedOptions;

  const nextCachedConfigOptions =
    Array.isArray(normalizedCachedOptions) && normalizedCachedOptions.length > 0
      ? Object.keys(normalizedPreferredConfigOptions || {}).length > 0
        ? normalizedCachedOptions.map((option) => {
            const nextValue = normalizedPreferredConfigOptions?.[option.id];
            return nextValue ? { ...option, currentValue: nextValue, selectedValue: nextValue } : option;
          })
        : normalizedCachedOptions
      : undefined;

  return {
    cachedConfigOptions: nextCachedConfigOptions,
    configOptionValues:
      normalizedPreferredConfigOptions && Object.keys(normalizedPreferredConfigOptions).length > 0
        ? normalizedPreferredConfigOptions
        : undefined,
  };
}

async function resolvePreferredAionrsConfigSelection(): Promise<Partial<ICreateConversationParams['extra']>> {
  const config = await ConfigStorage.get('aionrs.config');
  const reasoningEffort = config?.preferredConfigOptions?.reasoning_effort;
  return reasoningEffort ? { reasoningEffort } : {};
}

async function resolveDetectedAgentForBackend(
  backend: string
): Promise<Pick<AvailableAgent, 'kind' | 'cliPath'> | undefined> {
  try {
    const response = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (!response.success) {
      return undefined;
    }
    const agent = response.data?.find((item) => item.backend === backend);
    if (!agent) {
      return undefined;
    }
    return {
      kind: isDetectedAgentKind(agent.kind) ? agent.kind : undefined,
      cliPath: agent.cliPath,
    };
  } catch {
    return undefined;
  }
}

/**
 * Get a model from configured providers that is compatible with aionrs.
 * aionrs supports all platforms via OpenAI-compatible protocol.
 * Throws if no compatible provider is configured.
 */
export async function getDefaultAionrsModel(): Promise<TProviderWithModel> {
  const providers = await ipcBridge.mode.getModelConfig.invoke();
  const savedModel = await ConfigStorage.get('aionrs.defaultModel');

  if (!providers || providers.length === 0) {
    throw new Error('No model provider configured');
  }

  let provider = providers.find((p) => p.enabled !== false && savedModel?.id === p.id);
  if (!provider) {
    provider = providers.find((p) => p.enabled !== false);
  }
  if (!provider) {
    throw new Error('No enabled model provider for Aion CLI');
  }

  const savedUseModel = savedModel?.id === provider.id ? savedModel.useModel : undefined;
  const enabledModel = provider.model.find((m) => provider.modelEnabled?.[m] !== false);
  const useModel = resolveAvailableModel(savedUseModel, provider.model) || enabledModel || provider.model[0];

  return {
    id: provider.id,
    platform: provider.platform,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    proxy: provider.proxy,
    requestIntervalMs: provider.requestIntervalMs,
    useModel,
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
  const providers = await ipcBridge.mode.getModelConfig.invoke();

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
    proxy: enabledProvider.proxy,
    requestIntervalMs: enabledProvider.requestIntervalMs,
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
  const type = getConversationTypeForBackend(agent.backend, agent.kind);
  const preferredMode = await resolvePreferredMode(agent.backend);
  const preferredAcpModelId = type === 'acp' ? await resolvePreferredAcpModelId(agent.backend) : undefined;
  const preferredAcpConfigSelection =
    type === 'acp' ? await resolvePreferredAcpConfigSelection(agent.backend) : undefined;
  const preferredAionrsConfigSelection = type === 'aionrs' ? await resolvePreferredAionrsConfigSelection() : undefined;

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
    agentKind: agent.kind,
    name: agent.name,
    agentName: agent.name,
    workspace,
    cliPath: agent.cliPath,
    customAgentId: agent.customAgentId,
    model,
    sessionMode: preferredMode,
    currentModelId: preferredAcpModelId,
    extra: preferredAionrsConfigSelection || preferredAcpConfigSelection,
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
  const detectedAgent = agent.kind ? undefined : await resolveDetectedAgentForBackend(presetAgentType);
  const agentKind = agent.kind || detectedAgent?.kind;
  const cliPath = agent.cliPath || detectedAgent?.cliPath;

  // [BUG-2] Map raw i18n.language to standard locale key
  const localeKey = resolveLocaleKey(language);

  const { rules: presetContext, enabledSkills } = await loadPresetAssistantResources({
    customAgentId,
    localeKey,
  });

  const type = getConversationTypeForBackend(presetAgentType, agentKind);
  const preferredMode = await resolvePreferredMode(presetAgentType);
  const preferredAcpModelId = type === 'acp' ? await resolvePreferredAcpModelId(presetAgentType) : undefined;
  const preferredAcpConfigSelection =
    type === 'acp' ? await resolvePreferredAcpConfigSelection(presetAgentType) : undefined;
  const model = type === 'gemini' ? await resolveGeminiModel() : ({} as TProviderWithModel);

  return buildAgentConversationParams({
    backend: agent.backend,
    agentKind,
    name: agent.name,
    agentName: agent.name,
    workspace,
    cliPath,
    customAgentId,
    isPreset: true,
    presetAgentType,
    presetResources: {
      rules: presetContext,
      enabledSkills,
    },
    model,
    sessionMode: preferredMode,
    currentModelId: preferredAcpModelId,
    extra: preferredAcpConfigSelection,
  });
}
