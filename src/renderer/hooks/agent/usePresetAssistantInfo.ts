/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TChatConversation } from '@/common/config/storage';
import { ConfigStorage } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/assistantTypes';
import CoworkLogo from '@/renderer/assets/icons/cowork.svg';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import useSWR from 'swr';
export interface PresetAssistantInfo {
  name: string;
  logo: string;
  isEmoji: boolean;
}

type AssistantLike = {
  id?: string;
  name?: string;
  nameI18n?: Record<string, string>;
  avatar?: string;
  enabledSkills?: string[];
};

/**
 * 从 conversation extra 中解析预设助手 ID
 * Resolve preset assistant ID from conversation extra
 *
 * 处理向后兼容：
 * - presetAssistantId: 新格式 'builtin-xxx'
 * - customAgentId: ACP 会话的旧格式
 * - enabledSkills: Gemini Cowork 会话的旧格式
 */
/**
 * Resolve the assistant config ID (preserving original prefix like 'builtin-').
 * Use this when matching against the backend assistant catalog
 * (`ipcBridge.assistants.list`).
 */
export function resolveAssistantConfigId(conversation: TChatConversation): string | null {
  const extra = conversation.extra as {
    presetAssistantId?: unknown;
    customAgentId?: unknown;
  };
  const presetAssistantId = typeof extra?.presetAssistantId === 'string' ? extra.presetAssistantId.trim() : '';
  const customAgentId = typeof extra?.customAgentId === 'string' ? extra.customAgentId.trim() : '';
  return presetAssistantId || customAgentId || null;
}

export function resolvePresetId(conversation: TChatConversation): string | null {
  const extra = conversation.extra as {
    presetAssistantId?: unknown;
    customAgentId?: unknown;
    enabledSkills?: unknown;
  };
  const presetAssistantId = typeof extra?.presetAssistantId === 'string' ? extra.presetAssistantId.trim() : '';
  const customAgentId = typeof extra?.customAgentId === 'string' ? extra.customAgentId.trim() : '';
  const enabledSkills = Array.isArray(extra?.enabledSkills) ? extra.enabledSkills : [];

  // 1. 优先使用 presetAssistantId（新会话）
  // Priority: use presetAssistantId (new conversations)
  if (presetAssistantId) {
    const resolved = presetAssistantId.replace('builtin-', '');
    return resolved;
  }

  // 2. 向后兼容：customAgentId（ACP/Codex 旧会话）
  // Backward compatible: customAgentId (ACP/Codex old conversations)
  if (customAgentId) {
    const resolved = customAgentId.replace('builtin-', '');
    return resolved;
  }

  // 3. 向后兼容：enabledSkills 存在说明是 Cowork 会话（Gemini 旧会话）
  // Backward compatible: enabledSkills means Cowork conversation (Gemini old conversations)
  // 只有在既没有 presetAssistantId 也没有 customAgentId 时才使用此逻辑
  // Only use this logic when both presetAssistantId and customAgentId are absent (including empty strings)
  if (conversation.type === 'gemini' && !presetAssistantId && !customAgentId && enabledSkills.length > 0) {
    return 'cowork';
  }

  return null;
}

/**
 * 规范化头像：支持 emoji / 内置 svg / 扩展资源 URL
 * Normalize avatar to either emoji text or a renderable image URL
 */
function normalizeAvatar(avatar: string | undefined): { logo: string; isEmoji: boolean } {
  const value = (avatar || '').trim();
  if (!value) return { logo: '🤖', isEmoji: true };

  if (value === 'cowork.svg') {
    return { logo: CoworkLogo, isEmoji: false };
  }

  const resolved = resolveExtensionAssetUrl(value) || value;
  const isImage =
    /\.(svg|png|jpe?g|webp|gif)$/i.test(resolved) || /^(https?:|aion-asset:\/\/|file:\/\/|data:)/i.test(resolved);
  if (isImage) {
    return { logo: resolved, isEmoji: false };
  }

  // Unknown svg identifiers fallback to default emoji to avoid broken icons.
  if (value.endsWith('.svg')) {
    return { logo: '🤖', isEmoji: true };
  }

  return { logo: value, isEmoji: true };
}

function normalizeAssistantLabel(value: string | undefined): string {
  return (value || '')
    .normalize('NFKC')
    .replace(/[*_`>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractLegacyPresetPayload(conversation: TChatConversation): {
  rules: string;
  enabledSkills: string[];
  hasPayload: boolean;
} {
  const extra = conversation.extra as {
    presetContext?: unknown;
    presetRules?: unknown;
    enabledSkills?: unknown;
  };
  const presetContext = typeof extra?.presetContext === 'string' ? extra.presetContext.trim() : '';
  const presetRules = typeof extra?.presetRules === 'string' ? extra.presetRules.trim() : '';
  const enabledSkills = Array.isArray(extra?.enabledSkills)
    ? extra.enabledSkills.filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0)
    : [];

  return {
    rules: presetContext || presetRules,
    enabledSkills,
    hasPayload: Boolean(presetContext || presetRules || enabledSkills.length > 0),
  };
}

function extractAssistantNameFromRules(rules: string): string | null {
  const trimmed = rules.trim();
  if (!trimmed) return null;

  const headingMatch = trimmed.match(/^\s*#\s+(.+?)\s*$/m);
  if (headingMatch?.[1]) return headingMatch[1].trim();

  const zhAssistantMatch = trimmed.match(/你是\s+\*\*([^*]+)\*\*/);
  if (zhAssistantMatch?.[1]) return zhAssistantMatch[1].trim();

  const enAssistantMatch = trimmed.match(/you are\s+\*\*([^*]+)\*\*/i);
  if (enAssistantMatch?.[1]) return enAssistantMatch[1].trim();

  return null;
}

function matchesAssistantName(candidate: string | null, names: Array<string | undefined>): boolean {
  if (!candidate) return false;
  const normalizedCandidate = normalizeAssistantLabel(candidate);
  if (!normalizedCandidate) return false;
  return names.some((name) => normalizeAssistantLabel(name) === normalizedCandidate);
}

function hasMatchingEnabledSkills(candidateSkills: string[] | undefined, enabledSkills: string[]): boolean {
  if (!candidateSkills?.length || !enabledSkills.length) return false;
  const normalizedCandidate = [...candidateSkills].map((skill) => skill.trim()).toSorted();
  const normalizedEnabled = [...enabledSkills].map((skill) => skill.trim()).toSorted();
  if (normalizedCandidate.length !== normalizedEnabled.length) return false;
  return normalizedCandidate.every((skill, index) => skill === normalizedEnabled[index]);
}

/**
 * Build assistant info from a backend-provided Assistant record.
 */
function buildPresetInfoFromAssistant(assistant: Assistant, locale: string): PresetAssistantInfo {
  const localeKey = locale.startsWith('zh') ? 'zh-CN' : 'en-US';
  const name = assistant.nameI18n?.[localeKey] || assistant.nameI18n?.[locale] || assistant.name || assistant.id;
  const avatar = typeof assistant.avatar === 'string' ? assistant.avatar : '';
  const normalized = normalizeAvatar(avatar);
  return { name, logo: normalized.logo, isEmoji: normalized.isEmoji };
}

/**
 * Build assistant info from a custom agent config
 */
function buildCustomAgentInfo(
  customAgent: { name?: string; nameI18n?: Record<string, string>; avatar?: string },
  locale: string
): PresetAssistantInfo {
  const localeKey = locale.startsWith('zh') ? 'zh-CN' : 'en-US';
  const normalized = normalizeAvatar(typeof customAgent.avatar === 'string' ? customAgent.avatar : '');

  return {
    name: customAgent.nameI18n?.[localeKey] || customAgent.name || '🤖',
    logo: normalized.logo,
    isEmoji: normalized.isEmoji,
  };
}

function inferLegacyAssistantInfo(
  conversation: TChatConversation,
  locale: string,
  assistants?: Assistant[] | null,
  customAgents?: AssistantLike[] | null
): PresetAssistantInfo | null {
  const { rules, enabledSkills } = extractLegacyPresetPayload(conversation);
  const extractedName = extractAssistantNameFromRules(rules);

  const byName = assistants?.find((assistant) =>
    matchesAssistantName(extractedName, [
      assistant.id,
      assistant.name,
      assistant.nameI18n?.['zh-CN'],
      assistant.nameI18n?.['en-US'],
    ])
  );
  if (byName) return buildPresetInfoFromAssistant(byName, locale);

  const bySkills = assistants?.filter((assistant) =>
    hasMatchingEnabledSkills(assistant.enabledSkills, enabledSkills)
  );
  if (bySkills?.length === 1) return buildPresetInfoFromAssistant(bySkills[0], locale);

  const customByName = customAgents?.find((agent) =>
    matchesAssistantName(extractedName, [agent.id, agent.name, agent.nameI18n?.['zh-CN'], agent.nameI18n?.['en-US']])
  );
  if (customByName) return buildCustomAgentInfo(customByName, locale);

  const customBySkills = customAgents?.filter((agent) =>
    hasMatchingEnabledSkills(agent.enabledSkills, enabledSkills)
  );
  if (customBySkills?.length === 1) return buildCustomAgentInfo(customBySkills[0], locale);

  return null;
}

/**
 * 获取预设助手信息的 Hook
 * Hook to get preset assistant info from conversation
 *
 * @param conversation - 会话对象 / Conversation object
 * @returns 预设助手信息或 null / Preset assistant info or null
 */
export function usePresetAssistantInfo(conversation: TChatConversation | undefined): {
  info: PresetAssistantInfo | null;
  isLoading: boolean;
} {
  const { i18n } = useTranslation();

  // Merged assistant catalog (builtin + user + extension) from backend
  const { data: assistantsList, isLoading: isLoadingAssistants } = useSWR('assistants', () =>
    ipcBridge.assistants.list.invoke().catch(() => [] as Assistant[])
  );

  // User-defined ACP custom agents (still in ConfigStorage — separate from assistants)
  const { data: userCustomAgentsList, isLoading: isLoadingUserCustomAgents } = useSWR('acp.customAgents', () =>
    ConfigStorage.get('acp.customAgents')
  );
  const customAgents = useMemo(
    () => (userCustomAgentsList as AssistantLike[] | undefined) ?? [],
    [userCustomAgentsList]
  );

  // Extension-contributed ACP adapters (for ext:{extensionName}:{adapterId} conversations)
  const { data: extensionAcpAdapters, isLoading: isLoadingExtAdapters } = useSWR('extensions.acpAdapters', () =>
    ipcBridge.extensions.getAcpAdapters.invoke().catch(() => [] as Record<string, unknown>[])
  );

  // Remote agent for remote conversations
  const remoteAgentId =
    conversation?.type === 'remote' ? (conversation.extra as { remoteAgentId?: string })?.remoteAgentId : undefined;
  const { data: remoteAgent, isLoading: isLoadingRemoteAgent } = useSWR(
    remoteAgentId ? `remote-agent.get.${remoteAgentId}` : null,
    () => (remoteAgentId ? ipcBridge.remoteAgent.get.invoke({ id: remoteAgentId }) : null)
  );

  return useMemo(() => {
    if (!conversation) return { info: null, isLoading: false };

    // Remote agent conversations short-circuit to the remote record
    if (conversation.type === 'remote' && remoteAgentId) {
      if (isLoadingRemoteAgent) return { info: null, isLoading: true };
      if (remoteAgent) {
        const normalized = normalizeAvatar(remoteAgent.avatar);
        return {
          info: { name: remoteAgent.name, logo: normalized.logo, isEmoji: normalized.isEmoji },
          isLoading: false,
        };
      }
      return { info: null, isLoading: false };
    }

    const presetId = resolvePresetId(conversation);
    const locale = i18n.language || 'en-US';

    if (!presetId) {
      const inferredInfo = inferLegacyAssistantInfo(conversation, locale, assistantsList, customAgents);
      if (inferredInfo) return { info: inferredInfo, isLoading: false };

      const { hasPayload } = extractLegacyPresetPayload(conversation);
      if (hasPayload && (isLoadingAssistants || isLoadingUserCustomAgents)) {
        return { info: null, isLoading: true };
      }
      return { info: null, isLoading: false };
    }

    // Assistant lookup: backend returns merged builtin + user + extension list.
    // Accept either the bare id or the legacy `builtin-` / `ext-` prefixed forms.
    if (assistantsList && Array.isArray(assistantsList)) {
      const assistantMatch = assistantsList.find(
        (a) => a.id === presetId || a.id === `builtin-${presetId}` || a.id === `ext-${presetId}`
      );
      if (assistantMatch) return { info: buildPresetInfoFromAssistant(assistantMatch, locale), isLoading: false };
    }

    // Still loading — defer to avoid flickering fallback
    if (isLoadingAssistants || isLoadingUserCustomAgents || isLoadingExtAdapters)
      return { info: null as PresetAssistantInfo | null, isLoading: true };

    // Fallback to user-authored ACP custom agents
    if (customAgents && Array.isArray(customAgents)) {
      const customAgent = customAgents.find((agent) => agent.id === presetId || agent.id === `builtin-${presetId}`);
      if (customAgent) return { info: buildCustomAgentInfo(customAgent, locale), isLoading: false };
    }

    // Extension ACP adapters (customAgentId like ext:{extensionName}:{adapterId})
    if (presetId.startsWith('ext:') && extensionAcpAdapters && Array.isArray(extensionAcpAdapters)) {
      const parts = presetId.split(':');
      if (parts.length >= 3) {
        const extensionName = parts[1];
        const adapterId = parts.slice(2).join(':');
        const adapter = extensionAcpAdapters.find((a) => {
          const extName = typeof a._extensionName === 'string' ? a._extensionName : '';
          const id = typeof a.id === 'string' ? a.id : '';
          return extName === extensionName && id === adapterId;
        });
        if (adapter) {
          const name = typeof adapter.name === 'string' ? adapter.name : adapterId;
          const avatar = typeof adapter.avatar === 'string' ? adapter.avatar : '';
          const normalized = normalizeAvatar(avatar);
          return { info: { name, logo: normalized.logo, isEmoji: normalized.isEmoji }, isLoading: false };
        }
      }
    }

    return { info: null, isLoading: false };
  }, [
    conversation,
    i18n.language,
    assistantsList,
    isLoadingAssistants,
    customAgents,
    isLoadingUserCustomAgents,
    extensionAcpAdapters,
    isLoadingExtAdapters,
    remoteAgentId,
    remoteAgent,
    isLoadingRemoteAgent,
  ]);
}
