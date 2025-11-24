/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Preview 模块类型定义
 * Preview module type definitions
 *
 * 注意：核心类型定义在 @/common/types/preview，用于跨进程通信
 * Note: Core type definitions are in @/common/types/preview for IPC
 */

// 重新导出 common 中的类型，方便模块内使用
// Re-export types from common for convenience within module
export type { PreviewContentType, PreviewHistoryTarget, PreviewSnapshotInfo, RemoteImageFetchRequest } from '@/common/types/preview';

/**
 * 视图模式
 * View mode
 */
export type ViewMode = 'source' | 'preview';

/**
 * 预览 Tab 信息
 * Preview tab information
 */
export interface PreviewTabInfo {
  id: string;
  title: string;
  isDirty?: boolean;
}
