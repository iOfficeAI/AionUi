/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 预览面板相关常量定义
 * Preview panel related constants
 */

/**
 * 快照保存防抖时间（毫秒）
 * Snapshot save debounce time (milliseconds)
 */
export const SNAPSHOT_DEBOUNCE_TIME = 1000;

/**
 * 滚动同步防抖时间（毫秒）
 * Scroll sync debounce time (milliseconds)
 */
export const SCROLL_SYNC_DEBOUNCE = 100;

/**
 * Tab 溢出检测阈值（像素）
 * Tab overflow detection threshold (pixels)
 */
export const TAB_OVERFLOW_THRESHOLD = 2;

/**
 * 左右渐变指示器宽度（像素）
 * Left/right gradient indicator width (pixels)
 */
export const TAB_FADE_INDICATOR_WIDTH = 32;

/**
 * 工具栏高度（像素）
 * Toolbar height (pixels)
 */
export const TOOLBAR_HEIGHT = 40;

/**
 * 分割面板默认比例（百分比）
 * Default split panel ratio (percentage)
 */
export const DEFAULT_SPLIT_RATIO = 50;

/**
 * 分割面板最小宽度（百分比）
 * Minimum split panel width (percentage)
 */
export const MIN_SPLIT_WIDTH = 20;

/**
 * 分割面板最大宽度（百分比）
 * Maximum split panel width (percentage)
 */
export const MAX_SPLIT_WIDTH = 80;

/**
 * 具有内置打开按钮的文件类型
 * File types with built-in open buttons
 */
export const FILE_TYPES_WITH_BUILTIN_OPEN = ['word', 'ppt', 'pdf', 'excel'] as const;

/**
 * 可编辑的内容类型
 * Editable content types
 */
export const EDITABLE_CONTENT_TYPES = ['markdown', 'html', 'code'] as const;
