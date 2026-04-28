/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Workspace utility functions
 * 工作空间工具函数
 */

const splitPathSegments = (targetPath: string): string[] => targetPath.split(/[\\/]+/).filter(Boolean);

/**
 * Get the display name for a workspace path.
 *
 * When `isTemporaryWorkspace` is true, returns the localized "Temporary
 * Session" label. Otherwise returns the last directory name of the
 * workspace path.
 *
 * The caller must supply `isTemporaryWorkspace` — this function never
 * inspects the path shape to guess. The authoritative signal comes
 * from `conversation.extra.is_temporary_workspace` on the API response.
 */
export const getWorkspaceDisplayName = (
  workspacePath: string,
  isTemporaryWorkspace: boolean,
  t?: (key: string) => string
): string => {
  if (isTemporaryWorkspace) {
    return t ? t('conversation.workspace.temporarySpace') : 'Temporary Session';
  }
  const parts = splitPathSegments(workspacePath);
  return parts[parts.length - 1] || workspacePath;
};

/**
 * Get the last directory name from a path
 * 从路径中获取最后一级目录名
 */
export const getLastDirectoryName = (path: string): string => {
  const parts = splitPathSegments(path);
  return parts[parts.length - 1] || path;
};
