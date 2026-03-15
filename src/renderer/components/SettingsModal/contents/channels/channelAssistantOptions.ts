/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import { resolveLocaleKey } from '@/common/utils';
import type { AcpBackendAll, AcpBackendConfig } from '@/types/acpTypes';

export type ChannelAssistantOption = {
  backend: AcpBackendAll;
  name: string;
  customAgentId?: string;
  isPreset?: boolean;
  isExtension?: boolean;
  presetAgentType?: string;
  avatar?: string;
};

const getAssistantOptionKey = (assistant: { backend: AcpBackendAll; customAgentId?: string }) => {
  return assistant.customAgentId ? `${assistant.backend}|${assistant.customAgentId}` : assistant.backend;
};

const resolveAssistantName = (options: { localeKey: string; name?: string; nameI18n?: Record<string, string> }) => {
  return options.nameI18n?.[options.localeKey] || options.nameI18n?.['en-US'] || options.name || 'Assistant';
};

export async function loadChannelAssistantOptions(locale: string): Promise<ChannelAssistantOption[]> {
  const localeKey = resolveLocaleKey(locale);
  const [availableAgentsResult, customAgentsRaw, extensionAssistants] = await Promise.all([ipcBridge.acpConversation.getAvailableAgents.invoke(), ConfigStorage.get('acp.customAgents'), ipcBridge.extensions.getAssistants.invoke().catch(() => [] as Record<string, unknown>[])]);

  const options: ChannelAssistantOption[] = [];
  const seen = new Set<string>();

  const pushUnique = (assistant: ChannelAssistantOption) => {
    const key = getAssistantOptionKey(assistant);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    options.push(assistant);
  };

  if (availableAgentsResult.success && Array.isArray(availableAgentsResult.data)) {
    availableAgentsResult.data.forEach((agent) => {
      pushUnique({
        backend: agent.backend,
        name: agent.name,
        customAgentId: agent.customAgentId,
        isPreset: agent.isPreset,
        isExtension: agent.isExtension,
        presetAgentType: agent.presetAgentType,
        avatar: agent.avatar,
      });
    });
  }

  const customAgents = Array.isArray(customAgentsRaw) ? (customAgentsRaw as AcpBackendConfig[]) : [];
  customAgents
    .filter((agent) => agent.isPreset && agent.enabled !== false)
    .forEach((agent) => {
      pushUnique({
        backend: 'custom',
        customAgentId: agent.id,
        name: resolveAssistantName({
          localeKey,
          name: agent.name,
          nameI18n: agent.nameI18n,
        }),
        isPreset: true,
        presetAgentType: agent.presetAgentType,
        avatar: agent.avatar,
      });
    });

  if (Array.isArray(extensionAssistants)) {
    extensionAssistants.forEach((assistant) => {
      const customAgentId = typeof assistant.id === 'string' ? assistant.id : '';
      if (!customAgentId) {
        return;
      }
      pushUnique({
        backend: 'custom',
        customAgentId,
        name: resolveAssistantName({
          localeKey,
          name: typeof assistant.name === 'string' ? assistant.name : customAgentId,
          nameI18n: assistant.nameI18n as Record<string, string> | undefined,
        }),
        isPreset: true,
        isExtension: true,
        presetAgentType: typeof assistant.presetAgentType === 'string' ? assistant.presetAgentType : undefined,
        avatar: typeof assistant.avatar === 'string' ? assistant.avatar : undefined,
      });
    });
  }

  if (options.length === 0) {
    pushUnique({
      backend: 'gemini',
      name: 'Gemini CLI',
    });
  }

  return options;
}

export function getChannelAssistantKey(assistant: { backend: AcpBackendAll; customAgentId?: string }): string {
  return getAssistantOptionKey(assistant);
}

export function getChannelAssistantLabel(options: ChannelAssistantOption[], assistant: { backend: AcpBackendAll; customAgentId?: string; name?: string }): string {
  if (assistant.name) {
    return assistant.name;
  }

  const matched = options.find((option) => getAssistantOptionKey(option) === getAssistantOptionKey(assistant));
  return matched?.name || assistant.backend;
}
