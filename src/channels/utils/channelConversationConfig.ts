/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionRegistry } from '@/extensions';
import { ProcessConfig } from '@/process/initStorage';
import { ConversationService } from '@/process/services/conversationService';
import type { TChatConversation, TProviderWithModel } from '@/common/storage';

import type { AcpBackend, AcpBackendConfig } from '@/types/acpTypes';
import type { ChannelAgentType, PluginType } from '../types';
import { resolveChannelConvType } from '../types';

export type StoredChannelAgent = {
  backend: string;
  customAgentId?: string;
  name?: string;
};

type CreateChannelConversationOptions = {
  platform: PluginType;
  pluginId: string;
  source: PluginType;
  chatId: string;
  name: string;
  model: TProviderWithModel;
};

type CreateChannelConversationResult = {
  success: boolean;
  conversation?: TChatConversation;
  error?: string;
  channelAgentType?: ChannelAgentType;
  convType?: string;
  convBackend?: string;
  workspace?: string;
};

type PresetAssistantRecord = {
  id: string;
  name: string;
  presetAgentType?: string;
  context?: string;
  contextI18n?: Record<string, string>;
  enabledSkills?: string[];
};

const DEFAULT_CHANNEL_AGENT: StoredChannelAgent = { backend: 'gemini' };

const getPlatformAgentKey = (platform: PluginType) => `assistant.${platform}.agent` as const;
const getPluginAgentKey = (pluginId: string) => `assistant.plugin.${pluginId}.agent` as const;
const getPlatformWorkspaceKey = (platform: PluginType) => `assistant.${platform}.workspace` as const;
const getPluginWorkspaceKey = (pluginId: string) => `assistant.plugin.${pluginId}.workspace` as const;

const resolveChannelAgentType = (convType: string): ChannelAgentType => {
  if (convType === 'openclaw-gateway') {
    return 'openclaw-gateway';
  }
  if (convType === 'codex') {
    return 'codex';
  }
  if (convType === 'gemini') {
    return 'gemini';
  }
  return 'acp';
};

const normalizeWorkspace = (workspace: unknown): string | undefined => {
  if (typeof workspace !== 'string') {
    return undefined;
  }
  const trimmed = workspace.trim();
  return trimmed ? trimmed : undefined;
};

export async function loadStoredChannelAgent(platform: PluginType, pluginId: string): Promise<StoredChannelAgent> {
  try {
    const savedAgent = (await ProcessConfig.get(getPluginAgentKey(pluginId) as any)) ?? (await ProcessConfig.get(getPlatformAgentKey(platform) as any));
    if (savedAgent && typeof savedAgent === 'object' && typeof (savedAgent as StoredChannelAgent).backend === 'string') {
      return {
        backend: (savedAgent as StoredChannelAgent).backend,
        customAgentId: (savedAgent as StoredChannelAgent).customAgentId,
        name: (savedAgent as StoredChannelAgent).name,
      };
    }
    if (typeof savedAgent === 'string') {
      return { backend: savedAgent };
    }
  } catch {
    // ignore and fallback to gemini
  }
  return DEFAULT_CHANNEL_AGENT;
}

export async function loadStoredChannelWorkspace(platform: PluginType, pluginId: string): Promise<string | undefined> {
  try {
    const scopedWorkspace = await ProcessConfig.get(getPluginWorkspaceKey(pluginId) as any);
    const normalizedScoped = normalizeWorkspace(scopedWorkspace);
    if (normalizedScoped) {
      return normalizedScoped;
    }

    const platformWorkspace = await ProcessConfig.get(getPlatformWorkspaceKey(platform) as any);
    return normalizeWorkspace(platformWorkspace);
  } catch {
    return undefined;
  }
}

async function findPresetAssistantRecord(customAgentId: string): Promise<PresetAssistantRecord | null> {
  const customAgentsRaw = await ProcessConfig.get('acp.customAgents');
  const customAgents = Array.isArray(customAgentsRaw) ? (customAgentsRaw as AcpBackendConfig[]) : [];
  const customPreset = customAgents.find((agent) => agent.id === customAgentId && agent.isPreset);
  if (customPreset) {
    return {
      id: customPreset.id,
      name: customPreset.name,
      presetAgentType: customPreset.presetAgentType,
      context: customPreset.context,
      contextI18n: customPreset.contextI18n,
      enabledSkills: customPreset.enabledSkills,
    };
  }

  const extensionPreset = ExtensionRegistry.getInstance()
    .getAssistants()
    .find((assistant) => assistant.id === customAgentId && assistant.isPreset === true);

  if (!extensionPreset) {
    return null;
  }

  return {
    id: customAgentId,
    name: typeof extensionPreset.name === 'string' ? extensionPreset.name : customAgentId,
    presetAgentType: typeof extensionPreset.presetAgentType === 'string' ? extensionPreset.presetAgentType : undefined,
    context: typeof extensionPreset.context === 'string' ? extensionPreset.context : undefined,
    enabledSkills: Array.isArray(extensionPreset.enabledSkills) ? (extensionPreset.enabledSkills as string[]) : undefined,
  };
}

const resolvePresetContext = (preset: PresetAssistantRecord): string | undefined => {
  return preset.contextI18n?.['zh-CN'] || preset.contextI18n?.['en-US'] || preset.context;
};

const resolvePresetConversationTarget = (presetAgentType?: string): { type: 'gemini' | 'acp' | 'codex' | 'openclaw-gateway'; backend?: string } => {
  if (!presetAgentType || presetAgentType === 'gemini') {
    return { type: 'gemini' };
  }
  if (presetAgentType === 'openclaw' || presetAgentType === 'openclaw-gateway') {
    return { type: 'openclaw-gateway', backend: 'openclaw-gateway' };
  }
  if (presetAgentType === 'codex') {
    return { type: 'acp', backend: 'codex' };
  }
  return { type: 'acp', backend: presetAgentType };
};

export async function createChannelConversation(options: CreateChannelConversationOptions): Promise<CreateChannelConversationResult> {
  const { platform, pluginId, source, chatId, name, model } = options;
  const savedAgent = await loadStoredChannelAgent(platform, pluginId);
  const workspace = await loadStoredChannelWorkspace(platform, pluginId);
  const customWorkspace = Boolean(workspace);

  if (savedAgent.backend === 'custom' && savedAgent.customAgentId) {
    const preset = await findPresetAssistantRecord(savedAgent.customAgentId);
    if (preset) {
      const target = resolvePresetConversationTarget(preset.presetAgentType);
      const presetContext = resolvePresetContext(preset);
      const commonExtra = {
        workspace,
        customWorkspace,
        enabledSkills: preset.enabledSkills,
        presetAssistantId: preset.id,
      };

      if (target.type === 'gemini') {
        const result = await ConversationService.createGeminiConversation({
          model,
          workspace,
          customWorkspace,
          source,
          name,
          channelChatId: chatId,
          pluginId,
          presetRules: presetContext,
          enabledSkills: preset.enabledSkills,
          presetAssistantId: preset.id,
        });
        return {
          ...result,
          channelAgentType: 'gemini',
          convType: 'gemini',
          workspace,
        };
      }

      if (target.type === 'openclaw-gateway') {
        const result = await ConversationService.createConversation({
          type: 'openclaw-gateway',
          model,
          source,
          name,
          channelChatId: chatId,
          pluginId,
          extra: {
            ...commonExtra,
            backend: 'openclaw-gateway',
            agentName: preset.name,
          },
        });
        return {
          ...result,
          channelAgentType: 'openclaw-gateway',
          convType: 'openclaw-gateway',
          convBackend: 'openclaw-gateway',
        };
      }

      const backend = (target.backend || 'claude') as AcpBackend;
      const result = await ConversationService.createConversation({
        type: 'acp',
        model,
        source,
        name,
        channelChatId: chatId,
        pluginId,
        extra: {
          ...commonExtra,
          backend,
          customAgentId: preset.id,
          agentName: preset.name,
          presetContext,
        },
      });
      return {
        ...result,
        channelAgentType: 'acp',
        convType: 'acp',
        convBackend: backend,
      };
    }
  }

  const { convType, convBackend } = resolveChannelConvType(savedAgent.backend);
  const commonExtra = {
    workspace,
    customWorkspace,
  };

  if (savedAgent.backend === 'gemini') {
    const result = await ConversationService.createGeminiConversation({
      model,
      workspace,
      customWorkspace,
      source,
      name,
      channelChatId: chatId,
      pluginId,
    });
    return {
      ...result,
      channelAgentType: 'gemini',
      convType: 'gemini',
    };
  }

  if (savedAgent.backend === 'codex') {
    const result = await ConversationService.createConversation({
      type: 'codex',
      model,
      source,
      name,
      channelChatId: chatId,
      pluginId,
      extra: commonExtra,
    });
    return {
      ...result,
      channelAgentType: 'codex',
      convType,
      convBackend,
    };
  }

  if (savedAgent.backend === 'openclaw-gateway') {
    const result = await ConversationService.createConversation({
      type: 'openclaw-gateway',
      model,
      source,
      name,
      channelChatId: chatId,
      pluginId,
      extra: {
        ...commonExtra,
        backend: 'openclaw-gateway',
        agentName: savedAgent.name,
      },
    });
    return {
      ...result,
      channelAgentType: 'openclaw-gateway',
      convType,
      convBackend,
    };
  }

  const result = await ConversationService.createConversation({
    type: 'acp',
    model,
    source,
    name,
    channelChatId: chatId,
    pluginId,
    extra: {
      ...commonExtra,
      backend: savedAgent.backend as AcpBackend,
      customAgentId: savedAgent.customAgentId,
      agentName: savedAgent.name,
    },
  });
  return {
    ...result,
    channelAgentType: resolveChannelAgentType(convType),
    convType,
    convBackend,
    workspace,
  };
}
