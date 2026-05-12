/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { initApplicationBridge } from './applicationBridge';
import { initDialogBridge } from './dialogBridge';
import { initSpeechToTextBridge } from './speechToTextBridge';
import { initUpdateBridge } from './updateBridge';
import { initSystemSettingsBridge } from './systemSettingsBridge';
import { initWindowControlsBridge } from './windowControlsBridge';
import { initNotificationBridge } from './notificationBridge';
import { initWorkspaceSnapshotBridge } from './workspaceSnapshotBridge';
import { initWebuiBridge } from './webuiBridge';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

export interface BridgeDependencies {
  workerTaskManager: IWorkerTaskManager;
}

export function initAllBridges(deps: BridgeDependencies): void {
  initDialogBridge();
  initApplicationBridge(deps.workerTaskManager);
  initWindowControlsBridge();
  initUpdateBridge();
  initSystemSettingsBridge();
  initNotificationBridge();
  initSpeechToTextBridge();
  initWorkspaceSnapshotBridge();
  initWebuiBridge();
}

export {
  initApplicationBridge,
  initDialogBridge,
  initNotificationBridge,
  initSpeechToTextBridge,
  initSystemSettingsBridge,
  initUpdateBridge,
  initWindowControlsBridge,
  initWorkspaceSnapshotBridge,
  initWebuiBridge,
};
export { disposeAllSnapshots } from './workspaceSnapshotBridge';
export { registerWindowMaximizeListeners } from './windowControlsBridge';
export const disposeAllTeamSessions = (): Promise<void> => Promise.resolve();
