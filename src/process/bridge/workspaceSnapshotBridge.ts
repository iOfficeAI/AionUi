/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { WorkspaceSnapshotService } from '@process/services/WorkspaceSnapshotService';

const snapshotService = new WorkspaceSnapshotService();

export function initWorkspaceSnapshotBridge(): void {
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
}

/** Clean up all snapshots on app exit */
export function disposeAllSnapshots(): Promise<void> {
  return snapshotService.disposeAll();
}
