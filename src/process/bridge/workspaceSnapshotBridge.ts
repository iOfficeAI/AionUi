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

  ipcBridge.fileSnapshot.getBaselineContent.provider(async ({ workspace, filePath }) => {
    return snapshotService.getBaselineContent(workspace, filePath);
  });

  ipcBridge.fileSnapshot.getInfo.provider(async ({ workspace }) => {
    return snapshotService.getInfo(workspace);
  });

  ipcBridge.fileSnapshot.dispose.provider(async ({ workspace }) => {
    await snapshotService.dispose(workspace);
  });

  ipcBridge.fileSnapshot.stageFile.provider(async ({ workspace, filePath }) => {
    await snapshotService.stageFile(workspace, filePath);
  });

  ipcBridge.fileSnapshot.stageAll.provider(async ({ workspace }) => {
    await snapshotService.stageAll(workspace);
  });

  ipcBridge.fileSnapshot.unstageFile.provider(async ({ workspace, filePath }) => {
    await snapshotService.unstageFile(workspace, filePath);
  });

  ipcBridge.fileSnapshot.unstageAll.provider(async ({ workspace }) => {
    await snapshotService.unstageAll(workspace);
  });

  ipcBridge.fileSnapshot.discardFile.provider(async ({ workspace, filePath, operation }) => {
    await snapshotService.discardFile(workspace, filePath, operation);
  });

  ipcBridge.fileSnapshot.resetFile.provider(async ({ workspace, filePath, operation }) => {
    await snapshotService.resetFile(workspace, filePath, operation);
  });

  ipcBridge.fileSnapshot.getBranches.provider(async ({ workspace }) => {
    return snapshotService.getBranches(workspace);
  });
}

/** Clean up all snapshots on app exit */
export function disposeAllSnapshots(): Promise<void> {
  return snapshotService.disposeAll();
}
