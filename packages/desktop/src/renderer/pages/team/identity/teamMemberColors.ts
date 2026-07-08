/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 团队成员身份色 —— 纯前端、仅团队详情页使用的展示辅助色。
 *
 * 用途：多成员并行、且同一助手可被拉多次（多个独立成员实例）时，用一套低饱和色帮用户
 * 一眼区分「某个胶囊 / 某条消息气泡 / 某列对话」属于哪个成员实例。
 *
 * 真源是一张 `slot_id -> 色号` 映射（成员实例级），按增量维护：
 * - Leader 恒定色号 0（品牌色）。
 * - 已分配过的成员沿用原色号（钉死）——其他成员的新增/删除/重排都不改它的颜色。
 * - 新成员取「当前未占用的最小非 0 色号」，优先复用被移除成员释放出的空档。
 * - 成员数超出色板容量时对长度取模循环（罕见，循环项相隔远、不易混淆）。
 *
 * 颜色不落库，仅存 localStorage（见 useTeamMemberColors）。
 */

/** 身份色板：品牌 slate 邻近的低饱和色。索引 0 固定给 Leader（品牌色）。 */
export const TEAM_MEMBER_PALETTE = [
  'var(--brand)', // 0 = Leader
  '#5c9ea4', // 雾青
  '#b58a5e', // 暖褐
  '#9481bf', // 藕紫
  '#c07d97', // 豆沙玫
  '#6ba07e', // 灰绿
  '#4f8ac9', // 雾蓝
  '#c99a4b', // 琥珀
] as const;

export const LEADER_COLOR_INDEX = 0;

type MemberLike = { slot_id: string; role: string };

/**
 * 增量分配成员色号：给定上一版映射与当前成员列表，返回新映射。
 * 纯函数、无副作用，便于单测。
 */
export function assignMemberColors(prev: Record<string, number>, assistants: MemberLike[]): Record<string, number> {
  const next: Record<string, number> = {};
  const used = new Set<number>();
  const paletteLen = TEAM_MEMBER_PALETTE.length;

  // 1) Leader 固定色号 0
  const leader = assistants.find((a) => a.role === 'leader');
  if (leader) {
    next[leader.slot_id] = LEADER_COLOR_INDEX;
    used.add(LEADER_COLOR_INDEX);
  }

  // 2) 已分配过的成员沿用原色号（钉死）
  for (const a of assistants) {
    if (a.slot_id in next) continue;
    const previous = prev[a.slot_id];
    if (previous !== undefined) {
      next[a.slot_id] = previous;
      used.add(previous);
    }
  }

  // 3) 新成员取未占用的最小非 0 色号；色板占满后对长度取模循环
  let cursor = 1;
  const nextFreeIndex = (): number => {
    // 仍有非 0 空档：返回最小的未占用色号
    if (used.size < paletteLen - 1) {
      let idx = 1;
      while (used.has(idx)) idx++;
      return idx;
    }
    // 色板已满：循环复用（跳过 0，保留给 Leader）
    const idx = cursor % paletteLen || 1;
    cursor++;
    return idx;
  };
  for (const a of assistants) {
    if (a.slot_id in next) continue;
    const idx = nextFreeIndex();
    next[a.slot_id] = idx;
    used.add(idx);
  }

  return next;
}

/** 取某个成员实例的身份色 CSS 值。未知 slot 回退到 Leader 色（安全兜底）。 */
export function memberColorValue(colorMap: Record<string, number>, slot_id: string | undefined): string {
  const idx = (slot_id && colorMap[slot_id]) ?? LEADER_COLOR_INDEX;
  return TEAM_MEMBER_PALETTE[idx % TEAM_MEMBER_PALETTE.length];
}
