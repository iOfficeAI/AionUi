/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized localStorage keys for the application
 * 应用程序的集中式 localStorage 键管理
 *
 * All localStorage keys should be defined here to:
 * - Avoid key conflicts
 * - Make it easy to find and manage all persisted states
 * - Provide a single source of truth for storage key names
 */
export const STORAGE_KEYS = {
  /** Workspace tree collapse state / 工作空间目录树折叠状态 */
  WORKSPACE_TREE_COLLAPSE: 'aionui_workspace_collapse_state',

  /** Workspace panel collapse state / 工作空间面板折叠状态 */
  WORKSPACE_PANEL_COLLAPSE: 'aionui_workspace_panel_collapsed',

  /** Conversation tabs state / 会话 tabs 状态 */
  CONVERSATION_TABS: 'aionui_conversation_tabs',

  /** Sidebar collapse state / 侧边栏折叠状态 */
  SIDEBAR_COLLAPSE: 'aionui_sider_collapsed',

  /** Theme preference / 主题偏好 */
  THEME: 'aionui_theme',

  /** Language preference / 语言偏好 */
  LANGUAGE: 'aionui_language',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
