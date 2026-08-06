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

/**
 * Fold a file-watch event path so it can be compared against a local path.
 *
 * **What it solves.** On macOS, `/var` and `/tmp` are symlinks into `/private`,
 * and the OS reports watch events under the resolved `/private/...` form — while
 * a workspace path held on this side normally is not resolved. Backslashes are
 * folded too, so a Windows-style path compares equal to its POSIX form.
 *
 * **What happens without it.** Comparing the two raw strings *silently* never
 * matches on macOS: no error, no warning — events simply appear to belong to a
 * different workspace and are dropped. That failure looks like "the subscription
 * isn't working", which sends you investigating the socket, the subscribe
 * ordering, or the backend long before the path prefix.
 *
 * **Who should use it.** Anything that matches a file-watch event's path against
 * a locally held path — notably the preview panel's own directory-change
 * subscription, which is the next consumer to need this. Normalize *both* sides
 * before comparing; folding only one is the same bug.
 *
 * Extracted from the workspace Office watch (removed with its auto-open
 * behaviour); it was the only implementation of this fold in the repo, so it is
 * kept here rather than rediscovered later.
 */
export const normalizeWatchPath = (value: string): string => {
  const normalized = value.replaceAll('\\', '/');

  if (normalized === '/private/var') return '/var';
  if (normalized.startsWith('/private/var/')) return normalized.slice('/private'.length);
  if (normalized === '/private/tmp') return '/tmp';
  if (normalized.startsWith('/private/tmp/')) return normalized.slice('/private'.length);

  return normalized;
};
