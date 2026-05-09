/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { initApplicationBridge } from './applicationBridge';
import { initAuthBridge } from './authBridge';
import { initDialogBridge } from './dialogBridge';
import { initShellBridge } from './shellBridge';
import { initSpeechToTextBridge } from './speechToTextBridge';
import { initTaskBridge } from './taskBridge';
import { initUpdateBridge } from './updateBridge';
import { initSystemSettingsBridge } from './systemSettingsBridge';
import { initWindowControlsBridge } from './windowControlsBridge';
import { initNotificationBridge } from './notificationBridge';
import { initWorkspaceSnapshotBridge } from './workspaceSnapshotBridge';
import { initRemoteAgentBridge } from './remoteAgentBridge';
import { initWebuiBridge } from './webuiBridge';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

export interface BridgeDependencies {
  workerTaskManager: IWorkerTaskManager;
}

export function initAllBridges(deps: BridgeDependencies): void {
  initDialogBridge();
  initShellBridge();
  initApplicationBridge(deps.workerTaskManager);
  initAuthBridge();
  initWindowControlsBridge();
  initUpdateBridge();
  initSystemSettingsBridge();
  initNotificationBridge();
  initTaskBridge(deps.workerTaskManager);
  initSpeechToTextBridge();
  initWorkspaceSnapshotBridge();
  initRemoteAgentBridge();
  initWebuiBridge();
}

export {
  initApplicationBridge,
  initAuthBridge,
  initDialogBridge,
  initNotificationBridge,
  initShellBridge,
  initSpeechToTextBridge,
  initSystemSettingsBridge,
  initTaskBridge,
  initUpdateBridge,
  initRemoteAgentBridge,
  initWindowControlsBridge,
  initWorkspaceSnapshotBridge,
  initWebuiBridge,
};
export { disposeAllSnapshots } from './workspaceSnapshotBridge';
export { registerWindowMaximizeListeners } from './windowControlsBridge';
export const disposeAllTeamSessions = (): Promise<void> => Promise.resolve();
