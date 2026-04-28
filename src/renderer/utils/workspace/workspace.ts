/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Workspace utility functions
 * 工作空间工具函数
 */

/**
 * Legacy pattern for auto-provisioned workspaces: <backend>-temp-<timestamp>.
 * Kept so historical directories still render as "Temporary Session" even
 * though new conversations no longer use this naming.
 */
const LEGACY_TEMP_WORKSPACE_REGEX = /-temp-\d+$/i;

/**
 * Matches a UUID v4-ish last segment (conservative but sufficient for paths
 * minted by `uuid()`).
 */
const UUID_LAST_SEGMENT_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const splitPathSegments = (targetPath: string): string[] => targetPath.split(/[\\/]+/).filter(Boolean);

/**
 * Check if a workspace path is an auto-provisioned temporary workspace.
 *
 * 检查工作空间路径是否为自动分配的临时工作空间。
 *
 * Matches either the legacy `<backend>-temp-<timestamp>` naming or the new
 * `.../conversations/<uuid>` layout introduced when auto-provisioning was
 * aligned with the backend workspace convention.
 */
export const isTemporaryWorkspace = (workspacePath: string): boolean => {
  const parts = splitPathSegments(workspacePath);
  const lastSegment = parts[parts.length - 1] || '';
  const parentSegment = parts[parts.length - 2] || '';

  if (LEGACY_TEMP_WORKSPACE_REGEX.test(lastSegment)) {
    return true;
  }
  // New convention: `{workDir}/conversations/{uuid}`.
  return parentSegment === 'conversations' && UUID_LAST_SEGMENT_REGEX.test(lastSegment);
};

/**
 * Get the display name for a workspace path
 * 获取工作空间的显示名称
 *
 * @param workspacePath - The full workspace path
 * @param t - Optional i18n translation function
 * @returns The display name for the workspace
 */
export const getWorkspaceDisplayName = (workspacePath: string, t?: (key: string) => string): string => {
  // Check for temporary workspace
  if (isTemporaryWorkspace(workspacePath)) {
    const parts = splitPathSegments(workspacePath);
    const lastSegment = parts[parts.length - 1] || '';
    // Legacy timestamped temp names still carry a creation date we can surface.
    const match = lastSegment.match(/-temp-(\d+)$/i);

    if (match) {
      const timestamp = parseInt(match[1], 10);
      const date = new Date(timestamp);
      const dateStr = date.toLocaleDateString();
      const label = t ? t('conversation.workspace.temporarySpace') : 'Temporary Session';
      return `${label} (${dateStr})`;
    }
    return t ? t('conversation.workspace.temporarySpace') : 'Temporary Session';
  }

  // For regular workspace, show the last directory name
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
