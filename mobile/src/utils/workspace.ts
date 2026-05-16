/**
 * Workspace utility functions for mobile
 * Ported from src/renderer/utils/workspace.ts
 */

const TEMP_WORKSPACE_REGEX = /-temp-\d+$/i;

const splitPathSegments = (targetPath: string): string[] => targetPath.split(/[\\/]+/).filter(Boolean);

/**
 * Check if a workspace path is a temporary workspace
 */
export const isTemporaryWorkspace = (workspacePath: string): boolean => {
  const parts = splitPathSegments(workspacePath);
  const lastSegment = parts[parts.length - 1] || '';
  return TEMP_WORKSPACE_REGEX.test(lastSegment);
};

/**
 * Get the display name for a workspace path
 */
export const getWorkspaceDisplayName = (workspacePath: string, t?: (key: string) => string): string => {
  if (isTemporaryWorkspace(workspacePath)) {
    const parts = splitPathSegments(workspacePath);
    const lastSegment = parts[parts.length - 1] || '';
    const match = lastSegment.match(/-temp-(\d+)$/i);

    if (match) {
      const timestamp = parseInt(match[1], 10);
      const date = new Date(timestamp);
      const dateStr = date.toLocaleDateString();
      const label = t ? t('workspace.temporarySpace') : 'Temporary Session';
      return `${label} (${dateStr})`;
    }
    return t ? t('workspace.temporarySpace') : 'Temporary Session';
  }

  const parts = splitPathSegments(workspacePath);
  return parts[parts.length - 1] || workspacePath;
};

/**
 * Get the last directory name from a path
 */
export const getLastDirectoryName = (path: string): string => {
  const parts = splitPathSegments(path);
  return parts[parts.length - 1] || path;
};
