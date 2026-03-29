/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage } from '@/common/config/storage';
import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';
import { resolveLocaleKey } from '@/common/utils';
import { loadPresetAssistantResources } from '@/renderer/utils/model/presetAssistantResources';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';
import type { AcpBackend, AcpBackendAll } from '@/common/types/acpTypes';

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
 * Determine the conversation type from a CLI agent's backend.
 * codex uses ACP path (type: 'acp' + extra.backend = 'codex').
 */
export function getConversationTypeForBackend(backend: string): ICreateConversationParams['type'] {
  switch (backend) {
    case 'gemini':
      return 'gemini';
    case 'openclaw-gateway':
    case 'openclaw':
      return 'openclaw-gateway';
    case 'nanobot':
      return 'nanobot';
    case 'remote':
      return 'remote';
    default:
      // claude, qwen, codex, iflow, goose, auggie, kimi, opencode, copilot, qoder, codebuddy, droid, vibe, etc.
      // Note: codex now uses ACP path; legacy 'codex' type is not used for new conversations.
      return 'acp';
  }
}

/**
 * Determine the conversation type from a preset assistant's presetAgentType.
 * ACP-routed types include claude, codebuddy, opencode, qwen, codex.
 */
export function getConversationTypeForPreset(presetAgentType: string): ICreateConversationParams['type'] {
  const ACP_ROUTED_TYPES = ['claude', 'codebuddy', 'opencode', 'qwen', 'codex', 'kiro'];
  if (ACP_ROUTED_TYPES.includes(presetAgentType)) {
    return 'acp';
  }
  // Default: gemini
  return 'gemini';
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
  const { backend, name: agentName, cliPath } = agent;

  const type = getConversationTypeForBackend(backend);

  const extra: ICreateConversationParams['extra'] = {
    workspace,
    customWorkspace: true,
  };

  if (type === 'acp' || type === 'openclaw-gateway') {
    extra.backend = backend as AcpBackendAll;
    extra.agentName = agentName;
    if (cliPath) extra.cliPath = cliPath;
  }

  // Gemini type uses a placeholder model (matching Guid page behavior in useGuidSend).
  // The Guid page uses currentModel || placeholderModel, so Gemini does NOT require
  // a configured model provider - it works with Google auth instead.
  const model: TProviderWithModel =
    type === 'gemini'
      ? {
          id: 'gemini-placeholder',
          name: 'Gemini',
          useModel: 'default',
          platform: 'gemini-with-google-auth' as TProviderWithModel['platform'],
          baseUrl: '',
          apiKey: '',
        }
      : ({} as TProviderWithModel);

  return { type, model, name: agentName, extra };
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

  const extra: ICreateConversationParams['extra'] = {
    workspace,
    customWorkspace: true,
    enabledSkills,
    presetAssistantId: customAgentId,
  };

  if (type === 'gemini') {
    // gemini uses presetRules field
    extra.presetRules = presetContext;
  } else {
    // acp uses presetContext field
    extra.presetContext = presetContext;
    if (type === 'acp') {
      extra.backend = presetAgentType as AcpBackend;
    }
  }

  const model = type === 'gemini' ? await getDefaultGeminiModel() : ({} as TProviderWithModel);

  return { type, model, name: agent.name, extra };
}
