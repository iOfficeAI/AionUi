/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ASSISTANT_PRESETS } from '@/common/presets/assistantPresets';
import type { TChatConversation } from '@/common/storage';
import CoworkLogo from '@/renderer/assets/cowork.svg';

export interface PresetAssistantInfo {
  name: string;
  logo: string;
  isEmoji: boolean;
}

/**
 * 从 conversation extra 中解析预设助手 ID
 * Resolve preset assistant ID from conversation extra
 *
 * 处理向后兼容：
 * - presetAssistantId: 新格式 'builtin-xxx'
 * - customAgentId: ACP 会话的旧格式
 * - enabledSkills: Gemini Cowork 会话的旧格式
 */
function resolvePresetId(conversation: TChatConversation): string | null {
  const extra = conversation.extra as {
    presetAssistantId?: string;
    customAgentId?: string;
    enabledSkills?: string[];
  };

  // 1. 优先使用 presetAssistantId（新会话）
  // Priority: use presetAssistantId (new conversations)
  if (extra?.presetAssistantId) {
    return extra.presetAssistantId.replace('builtin-', '');
  }

  // 2. 向后兼容：customAgentId（ACP/Codex 旧会话）
  // Backward compatible: customAgentId (ACP/Codex old conversations)
  if (extra?.customAgentId) {
    return extra.customAgentId.replace('builtin-', '');
  }

  // 3. 向后兼容：enabledSkills 存在说明是 Cowork 会话（Gemini 旧会话）
  // Backward compatible: enabledSkills means Cowork conversation (Gemini old conversations)
  if (conversation.type === 'gemini' && extra?.enabledSkills && extra.enabledSkills.length > 0) {
    return 'cowork';
  }

  return null;
}

/**
 * 根据 preset 构建助手信息
 * Build assistant info from preset
 */
function buildPresetInfo(presetId: string, locale: string): PresetAssistantInfo | null {
  const preset = ASSISTANT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;

  const name = preset.nameI18n[locale] || preset.nameI18n['en-US'] || preset.id;

  // avatar 可能是 emoji 或 svg 文件名 / avatar can be emoji or svg filename
  const isEmoji = !preset.avatar.endsWith('.svg');
  let logo: string;

  if (isEmoji) {
    logo = preset.avatar;
  } else if (preset.id === 'cowork') {
    logo = CoworkLogo;
  } else {
    // 其他 svg 需要动态导入，暂时使用 emoji fallback
    // Other svg need dynamic import, use emoji fallback for now
    logo = '🤖';
  }

  return { name, logo, isEmoji };
}

/**
 * 获取预设助手信息的 Hook
 * Hook to get preset assistant info from conversation
 *
 * @param conversation - 会话对象 / Conversation object
 * @returns 预设助手信息或 null / Preset assistant info or null
 */
export function usePresetAssistantInfo(conversation: TChatConversation | undefined): PresetAssistantInfo | null {
  const { i18n } = useTranslation();

  return useMemo(() => {
    if (!conversation) return null;

    const presetId = resolvePresetId(conversation);
    if (!presetId) return null;

    return buildPresetInfo(presetId, i18n.language || 'en-US');
  }, [conversation, i18n.language]);
}
