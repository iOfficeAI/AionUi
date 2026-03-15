/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

const WORKSPACE_UPDATE_TIME_KEY = 'aionui_workspace_update_time';

const normalizeWorkspaceHistoryPath = (workspace: string): string => workspace.replace(/[\\/]+$/, '').trim();

const readWorkspaceEntries = (): Array<{ workspace: string; updatedAt: number }> => {
  try {
    const stored = localStorage.getItem(WORKSPACE_UPDATE_TIME_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as Record<string, number>;
    const workspaceMap = new Map<string, { workspace: string; updatedAt: number }>();

    Object.entries(parsed).forEach(([workspace, updatedAt]) => {
      const normalizedWorkspace = normalizeWorkspaceHistoryPath(workspace);
      const normalizedUpdatedAt = Number(updatedAt);
      if (!normalizedWorkspace || !Number.isFinite(normalizedUpdatedAt)) {
        return;
      }

      const workspaceKey = normalizedWorkspace.toLowerCase();
      const currentRecord = workspaceMap.get(workspaceKey);
      if (!currentRecord || normalizedUpdatedAt > currentRecord.updatedAt) {
        workspaceMap.set(workspaceKey, {
          workspace: normalizedWorkspace,
          updatedAt: normalizedUpdatedAt,
        });
      }
    });

    return Array.from(workspaceMap.values());
  } catch {
    // Ignore parsing errors and fall back to default
    return [];
  }
};

const writeWorkspaceEntries = (entries: Array<{ workspace: string; updatedAt: number }>): void => {
  const nextRecord = Object.fromEntries(entries.map(({ workspace, updatedAt }) => [workspace, updatedAt]));
  localStorage.setItem(WORKSPACE_UPDATE_TIME_KEY, JSON.stringify(nextRecord));
};

const readWorkspaceTimes = (): Record<string, number> => {
  return Object.fromEntries(readWorkspaceEntries().map(({ workspace, updatedAt }) => [workspace, updatedAt]));
};

/**
 * 获取 workspace 的最后更新时间
 */
export const getWorkspaceUpdateTime = (workspace: string): number => {
  const normalizedWorkspace = normalizeWorkspaceHistoryPath(workspace).toLowerCase();
  if (!normalizedWorkspace) {
    return 0;
  }

  return readWorkspaceEntries().find((entry) => entry.workspace.toLowerCase() === normalizedWorkspace)?.updatedAt || 0;
};

/**
 * 获取所有已记录的 workspace 历史
 */
export const getWorkspaceHistoryRecords = (): Array<{ workspace: string; updatedAt: number }> => {
  const times = readWorkspaceTimes();

  return Object.entries(times)
    .map(([workspace, updatedAt]) => ({ workspace, updatedAt }))
    .sort((left, right) => right.updatedAt - left.updatedAt);
};

/**
 * 更新 workspace 的最后更新时间
 * 在创建新会话时调用此函数
 */
export const updateWorkspaceTime = (workspace: string): void => {
  try {
    const normalizedWorkspace = normalizeWorkspaceHistoryPath(workspace);
    if (!normalizedWorkspace) {
      return;
    }

    const workspaceKey = normalizedWorkspace.toLowerCase();
    const nextEntries = readWorkspaceEntries().filter((entry) => entry.workspace.toLowerCase() !== workspaceKey);
    nextEntries.push({
      workspace: normalizedWorkspace,
      updatedAt: Date.now(),
    });

    writeWorkspaceEntries(nextEntries);
  } catch (error) {
    console.error('[WorkspaceHistory] Failed to update workspace time:', error);
  }
};
