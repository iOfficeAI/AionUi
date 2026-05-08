/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert and message display constants
 * Alert 和消息展示常量
 */

// Text size calculation: 14px (text-sm) × 1.5 (line-height) = 21px per line
// 文本大小计算：14px (text-sm) × 1.5 (line-height) = 21px/行
export const TEXT_CONFIG = {
  FONT_SIZE: 14, // text-sm
  LINE_HEIGHT: 1.5,
  PX_PER_LINE: 21, // 14px × 1.5
} as const;

// Maximum display height for collapsible content
// 可折叠内容的最大显示高度
export const COLLAPSE_CONFIG = {
  MAX_LINES: 4,
  MAX_HEIGHT: TEXT_CONFIG.PX_PER_LINE * 4, // 84px
} as const;
