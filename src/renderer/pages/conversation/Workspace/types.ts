/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/ipcBridge';
import type { NodeInstance } from '@arco-design/web-react/es/Tree/interface';
import type { Message } from '@arco-design/web-react';

export type MessageApi = ReturnType<typeof Message.useMessage>[0];

/**
 * Workspace 组件的 Props 定义
 * Props definition for Workspace component
 */
export interface WorkspaceProps {
  workspace: string;
  conversation_id: string;
  eventPrefix?: 'gemini' | 'acp' | 'codex';
  messageApi?: MessageApi;
}

/**
 * 右键菜单状态
 * Context menu state
 */
export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: IDirOrFile | null;
}

/**
 * 重命名弹窗状态
 * Rename modal state
 */
export interface RenameModalState {
  visible: boolean;
  value: string;
  target: IDirOrFile | null;
}

/**
 * 删除确认弹窗状态
 * Delete confirmation modal state
 */
export interface DeleteModalState {
  visible: boolean;
  target: IDirOrFile | null;
  loading: boolean;
}

/**
 * 粘贴确认弹窗状态
 * Paste confirmation modal state
 */
export interface PasteConfirmState {
  visible: boolean;
  fileName: string;
  filesToPaste: Array<{ path: string; name: string }>;
  doNotAsk: boolean;
  targetFolder: string | null;
}

/**
 * 工作空间树的状态
 * Workspace tree state
 */
export interface WorkspaceTreeState {
  files: IDirOrFile[];
  loading: boolean;
  treeKey: number;
  expandedKeys: string[];
  selected: string[];
  showSearch: boolean;
}

/**
 * 节点选择引用，用于跟踪最后选中的文件夹节点
 * Node selection reference for tracking the last selected folder node
 */
export interface SelectedNodeRef {
  relativePath: string;
  fullPath: string;
}

/**
 * 目标文件夹路径信息
 * Target folder path information
 */
export interface TargetFolderPath {
  fullPath: string;
  relativePath: string | null;
}

/**
 * 从 Tree 节点提取数据的辅助函数类型
 * Helper function types for extracting data from Tree nodes
 */
export type ExtractNodeDataFn = (node: NodeInstance | null | undefined) => IDirOrFile | null;
export type ExtractNodeKeyFn = (node: NodeInstance | null | undefined) => string | null;
export type GetPathSeparatorFn = (targetPath: string) => string;
export type FindNodeByKeyFn = (list: IDirOrFile[], key: string) => IDirOrFile | null;
