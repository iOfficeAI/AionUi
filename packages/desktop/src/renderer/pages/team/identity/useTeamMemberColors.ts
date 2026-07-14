/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import type { TeamAssistant } from '@/common/types/team/teamTypes';
import { assignMemberColors, memberColorValue } from './teamMemberColors';

const storageKey = (team_id: string): string => `team-member-colors-${team_id}`;

const readColorMap = (key: string): Record<string, number> => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch {
    // ignore malformed value
  }
  return {};
};

const shallowEqual = (a: Record<string, number>, b: Record<string, number>): boolean => {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k]);
};

export type TeamMemberColorResolver = {
  /** 取某成员实例（slot）的身份色 CSS 值。 */
  colorOf: (slot_id: string | undefined) => string;
  /** 取某会话（消息侧只认 conversation_id）对应成员的身份色 CSS 值。 */
  colorOfConversation: (conversation_id: string | undefined) => string;
};

/**
 * 团队成员身份色 —— 每团队一份 `slot_id -> 色号` 映射，随成员列表增量维护并持久化到
 * localStorage（key `team-member-colors-${team_id}`）。仅团队详情页使用，不落库。
 */
export function useTeamMemberColors(team_id: string, assistants: TeamAssistant[]): TeamMemberColorResolver {
  const key = storageKey(team_id);
  const [colorMap, setColorMap] = useState<Record<string, number>>(() => readColorMap(key));

  // 成员列表变化时增量重算：新成员补色、被移除成员释放色，已有成员钉死不变。
  useEffect(() => {
    setColorMap((prev) => {
      const next = assignMemberColors(prev, assistants);
      if (shallowEqual(prev, next)) return prev;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage full / unavailable — 颜色仍在内存生效，忽略持久化失败
      }
      return next;
    });
  }, [assistants, key]);

  // conversation_id -> slot_id 索引：消息只携带 senderConversationId，需借此回到成员实例取色。
  const conversationToSlot = useMemo(() => {
    const index: Record<string, string> = {};
    for (const a of assistants) {
      if (a.conversation_id) index[a.conversation_id] = a.slot_id;
    }
    return index;
  }, [assistants]);

  return useMemo(
    () => ({
      colorOf: (slot_id) => memberColorValue(colorMap, slot_id),
      colorOfConversation: (conversation_id) => memberColorValue(colorMap, conversationToSlot[conversation_id ?? '']),
    }),
    [colorMap, conversationToSlot]
  );
}
