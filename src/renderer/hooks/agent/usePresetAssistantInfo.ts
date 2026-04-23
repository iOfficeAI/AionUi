/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ASSISTANT_PRESETS } from '@/common/config/presets/assistantPresets';
import type { TChatConversation } from '@/common/config/storage';
import { configService } from '@/common/config/configService';
import { ipcBridge } from '@/common';
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
  enabled_skills?: string[];
};

/**
 * 从 conversation extra 中解析预设助手 ID
 * Resolve preset assistant ID from conversation extra
 *
 * 处理向后兼容：
 * - preset_assistant_id: 新格式 'builtin-xxx'
 * - custom_agent_id: ACP 会话的旧格式
 * - enabled_skills: Gemini Cowork 会话的旧格式
 */
/**
 * Resolve the assistant config ID (preserving original prefix like 'builtin-').
 * Use this when matching against the assistant list in configService 'assistants'.
 */
export function resolveAssistantConfigId(conversation: TChatConversation): string | null {
  const extra = conversation.extra as {
    preset_assistant_id?: unknown;
    custom_agent_id?: unknown;
  };
  const preset_assistant_id = typeof extra?.preset_assistant_id === 'string' ? extra.preset_assistant_id.trim() : '';
  const custom_agent_id = typeof extra?.custom_agent_id === 'string' ? extra.custom_agent_id.trim() : '';
  return preset_assistant_id || custom_agent_id || null;
}

export function resolvePresetId(conversation: TChatConversation): string | null {
  const extra = conversation.extra as {
    preset_assistant_id?: unknown;
    custom_agent_id?: unknown;
    enabled_skills?: unknown;
  };
  const preset_assistant_id = typeof extra?.preset_assistant_id === 'string' ? extra.preset_assistant_id.trim() : '';
  const custom_agent_id = typeof extra?.custom_agent_id === 'string' ? extra.custom_agent_id.trim() : '';
  const enabled_skills = Array.isArray(extra?.enabled_skills) ? extra.enabled_skills : [];

  // 1. 优先使用 preset_assistant_id（新会话）
  // Priority: use preset_assistant_id (new conversations)
  if (preset_assistant_id) {
    const resolved = preset_assistant_id.replace('builtin-', '');
    return resolved;
  }

  // 2. 向后兼容：custom_agent_id（ACP/Codex 旧会话）
  // Backward compatible: custom_agent_id (ACP/Codex old conversations)
  if (custom_agent_id) {
    const resolved = custom_agent_id.replace('builtin-', '');
    return resolved;
  }

  // 3. 向后兼容：enabled_skills 存在说明是 Cowork 会话（Gemini 旧会话）
  // Backward compatible: enabled_skills means Cowork conversation (Gemini old conversations)
  // 只有在既没有 preset_assistant_id 也没有 custom_agent_id 时才使用此逻辑
  // Only use this logic when both preset_assistant_id and custom_agent_id are absent (including empty strings)
  if (conversation.type === 'gemini' && !preset_assistant_id && !custom_agent_id && enabled_skills.length > 0) {
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
  enabled_skills: string[];
  hasPayload: boolean;
} {
  const extra = conversation.extra as {
    preset_context?: unknown;
    preset_rules?: unknown;
    enabled_skills?: unknown;
  };
  const preset_context = typeof extra?.preset_context === 'string' ? extra.preset_context.trim() : '';
  const preset_rules = typeof extra?.preset_rules === 'string' ? extra.preset_rules.trim() : '';
  const enabled_skills = Array.isArray(extra?.enabled_skills)
    ? extra.enabled_skills.filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0)
    : [];

  return {
    rules: preset_context || preset_rules,
    enabled_skills,
    hasPayload: Boolean(preset_context || preset_rules || enabled_skills.length > 0),
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

function hasMatchingEnabledSkills(candidateSkills: string[] | undefined, enabled_skills: string[]): boolean {
  if (!candidateSkills?.length || !enabled_skills.length) return false;
  const normalizedCandidate = [...candidateSkills].map((skill) => skill.trim()).toSorted();
  const normalizedEnabled = [...enabled_skills].map((skill) => skill.trim()).toSorted();
  if (normalizedCandidate.length !== normalizedEnabled.length) return false;
  return normalizedCandidate.every((skill, index) => skill === normalizedEnabled[index]);
}

/**
 * 根据 preset 构建助手信息
 * Build assistant info from preset
 */
function buildPresetInfo(presetId: string, locale: string): PresetAssistantInfo | null {
  const preset = ASSISTANT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;

  const name = preset.nameI18n[locale] || preset.nameI18n['en-US'] || preset.id;
  const avatar = typeof preset.avatar === 'string' ? preset.avatar : '';
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

function buildExtensionAssistantInfo(
  extensionAssistant: { name?: string; nameI18n?: Record<string, string>; avatar?: string },
  locale: string
): PresetAssistantInfo {
  const localeKey = locale.startsWith('zh') ? 'zh-CN' : 'en-US';
  const normalized = normalizeAvatar(typeof extensionAssistant.avatar === 'string' ? extensionAssistant.avatar : '');
  const name =
    extensionAssistant.nameI18n?.[localeKey] ||
    extensionAssistant.nameI18n?.[locale] ||
    extensionAssistant.name ||
    '🤖';

  return {
    name,
    logo: normalized.logo,
    isEmoji: normalized.isEmoji,
  };
}

function inferLegacyAssistantInfo(
  conversation: TChatConversation,
  locale: string,
  customAgents?: AssistantLike[] | null,
  extensionAssistants?: AssistantLike[] | null
): PresetAssistantInfo | null {
  const { rules, enabled_skills } = extractLegacyPresetPayload(conversation);
  const extractedName = extractAssistantNameFromRules(rules);

  const builtinByName = ASSISTANT_PRESETS.find((preset) =>
    matchesAssistantName(extractedName, [preset.id, preset.nameI18n['zh-CN'], preset.nameI18n['en-US']])
  );
  if (builtinByName) {
    return buildPresetInfo(builtinByName.id, locale);
  }

  const builtinBySkills = ASSISTANT_PRESETS.filter((preset) =>
    hasMatchingEnabledSkills(preset.defaultEnabledSkills, enabled_skills)
  );
  if (builtinBySkills.length === 1) {
    return buildPresetInfo(builtinBySkills[0].id, locale);
  }

  const customByName = customAgents?.find((agent) =>
    matchesAssistantName(extractedName, [agent.id, agent.name, agent.nameI18n?.['zh-CN'], agent.nameI18n?.['en-US']])
  );
  if (customByName) {
    return buildCustomAgentInfo(customByName, locale);
  }

  const customBySkills = customAgents?.filter((agent) =>
    hasMatchingEnabledSkills(agent.enabled_skills, enabled_skills)
  );
  if (customBySkills?.length === 1) {
    return buildCustomAgentInfo(customBySkills[0], locale);
  }

  const extensionByName = extensionAssistants?.find((assistant) =>
    matchesAssistantName(extractedName, [
      assistant.id,
      assistant.name,
      assistant.nameI18n?.['zh-CN'],
      assistant.nameI18n?.['en-US'],
    ])
  );
  if (extensionByName) {
    return buildExtensionAssistantInfo(extensionByName, locale);
  }

  const extensionBySkills = extensionAssistants?.filter((assistant) =>
    hasMatchingEnabledSkills(assistant.enabled_skills, enabled_skills)
  );
  if (extensionBySkills?.length === 1) {
    return buildExtensionAssistantInfo(extensionBySkills[0], locale);
  }

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

  // Fetch both preset assistants and user-defined custom ACP agents.
  // `presetId` may reference either, so we merge both sources before lookup.
  const { data: assistantsList, isLoading: isLoadingAssistants } = useSWR('assistants', () =>
    configService.get('assistants')
  );
  const { data: userCustomAgentsList, isLoading: isLoadingUserCustomAgents } = useSWR('acp.customAgents', () =>
    configService.get('acp.customAgents')
  );
  const customAgents = useMemo(
    () => [
      ...((assistantsList as AssistantLike[] | undefined) ?? []),
      ...((userCustomAgentsList as AssistantLike[] | undefined) ?? []),
    ],
    [assistantsList, userCustomAgentsList]
  );
  const isLoadingCustomAgents = isLoadingAssistants || isLoadingUserCustomAgents;

  // Fetch extension-contributed assistants
  const { data: extensionAssistants, isLoading: isLoadingExtAssistants } = useSWR('extensions.assistants', () =>
    ipcBridge.extensions.getAssistants.invoke().catch(() => [] as Record<string, unknown>[])
  );

  // Fetch extension-contributed ACP adapters (for ext:{extensionName}:{adapterId} conversations)
  const { data: extensionAcpAdapters, isLoading: isLoadingExtAdapters } = useSWR('extensions.acpAdapters', () =>
    ipcBridge.extensions.getAcpAdapters.invoke().catch(() => [] as Record<string, unknown>[])
  );

  // Fetch remote agents for remote conversations
  const remoteAgentId =
    conversation?.type === 'remote' ? (conversation.extra as { remoteAgentId?: string })?.remoteAgentId : undefined;
  const { data: remoteAgent, isLoading: isLoadingRemoteAgent } = useSWR(
    remoteAgentId ? `remote-agent.get.${remoteAgentId}` : null,
    () => (remoteAgentId ? ipcBridge.remoteAgent.get.invoke({ id: remoteAgentId }) : null)
  );

  return useMemo(() => {
    if (!conversation) return { info: null, isLoading: false };

    // Handle remote agent conversations
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
      const inferredInfo = inferLegacyAssistantInfo(
        conversation,
        locale,
        customAgents,
        extensionAssistants as AssistantLike[] | undefined
      );
      if (inferredInfo) {
        return { info: inferredInfo, isLoading: false };
      }

      const { hasPayload } = extractLegacyPresetPayload(conversation);
      if (hasPayload && (isLoadingCustomAgents || isLoadingExtAssistants)) {
        return { info: null, isLoading: true };
      }

      return { info: null, isLoading: false };
    }

    // First try to find in built-in presets (synchronous, no loading needed)
    const builtinInfo = buildPresetInfo(presetId, locale);
    if (builtinInfo) {
      return { info: builtinInfo, isLoading: false };
    }

    // Custom/extension data still loading — don't fall through to fallback yet
    if (isLoadingCustomAgents || isLoadingExtAssistants || isLoadingExtAdapters)
      return { info: null as PresetAssistantInfo | null, isLoading: true };

    // If not found in built-in presets, try to find in custom agents
    if (customAgents && Array.isArray(customAgents)) {
      const customAgent = customAgents.find((agent) => agent.id === presetId || agent.id === `builtin-${presetId}`);
      if (customAgent) {
        return { info: buildCustomAgentInfo(customAgent, locale), isLoading: false };
      }
    }

    // Try extension-contributed assistants
    if (extensionAssistants && Array.isArray(extensionAssistants)) {
      const extAssistant = extensionAssistants.find((a) => a.id === presetId || a.id === `ext-${presetId}`);
      if (extAssistant) {
        return {
          info: buildExtensionAssistantInfo(extAssistant as AssistantLike, locale),
          isLoading: false,
        };
      }
    }

    // Try extension-contributed ACP adapters (custom_agent_id like ext:{extensionName}:{adapterId})
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
    customAgents,
    isLoadingAssistants,
    isLoadingUserCustomAgents,
    isLoadingCustomAgents,
    extensionAssistants,
    isLoadingExtAssistants,
    extensionAcpAdapters,
    isLoadingExtAdapters,
    remoteAgentId,
    remoteAgent,
    isLoadingRemoteAgent,
  ]);
}
