/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { WorkspaceSnapshotService } from '@process/services/WorkspaceSnapshotService';

const snapshotService = new WorkspaceSnapshotService();

export function initWorkspaceSnapshotBridge(): void {
  // Fire-and-forget: clean up leftover snapshot dirs from previous sessions
  WorkspaceSnapshotService.cleanupStaleSnapshots().catch(() => {});

  ipcBridge.fileSnapshot.init.provider(async ({ workspace }) => {
    return snapshotService.init(workspace);
  });

  ipcBridge.fileSnapshot.compare.provider(async ({ workspace }) => {
    return snapshotService.compare(workspace);
  });

  ipcBridge.fileSnapshot.getBaselineContent.provider(async ({ workspace, file_path }) => {
    return snapshotService.getBaselineContent(workspace, file_path);
  });

  ipcBridge.fileSnapshot.getInfo.provider(async ({ workspace }) => {
    return snapshotService.getInfo(workspace);
  });

  ipcBridge.fileSnapshot.dispose.provider(async ({ workspace }) => {
    await snapshotService.dispose(workspace);
  });

  ipcBridge.fileSnapshot.stageFile.provider(async ({ workspace, file_path }) => {
    await snapshotService.stageFile(workspace, file_path);
  });

  ipcBridge.fileSnapshot.stageAll.provider(async ({ workspace }) => {
    await snapshotService.stageAll(workspace);
  });

  ipcBridge.fileSnapshot.unstageFile.provider(async ({ workspace, file_path }) => {
    await snapshotService.unstageFile(workspace, file_path);
  });

  ipcBridge.fileSnapshot.unstageAll.provider(async ({ workspace }) => {
    await snapshotService.unstageAll(workspace);
  });

  ipcBridge.fileSnapshot.discardFile.provider(async ({ workspace, file_path, operation }) => {
    await snapshotService.discardFile(workspace, file_path, operation);
  });

  ipcBridge.fileSnapshot.resetFile.provider(async ({ workspace, file_path, operation }) => {
    await snapshotService.resetFile(workspace, file_path, operation);
  });

  ipcBridge.fileSnapshot.getBranches.provider(async ({ workspace }) => {
    return snapshotService.getBranches(workspace);
  });
}

/** Clean up all snapshots on app exit */
export function disposeAllSnapshots(): Promise<void> {
  return snapshotService.disposeAll();
}
