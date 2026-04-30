/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { initApplicationBridge } from './applicationBridge';
import { initAuthBridge } from './authBridge';
import { initBedrockBridge } from './bedrockBridge';
import { initDialogBridge } from './dialogBridge';
import { initDocumentBridge } from './documentBridge';
import { initPreviewHistoryBridge } from './previewHistoryBridge';
import { initShellBridge } from './shellBridge';
import { initSpeechToTextBridge } from './speechToTextBridge';
import { initTaskBridge } from './taskBridge';
import { initUpdateBridge } from './updateBridge';
import { initSystemSettingsBridge } from './systemSettingsBridge';
import { initWindowControlsBridge } from './windowControlsBridge';
import { initNotificationBridge } from './notificationBridge';
import { initPptPreviewBridge } from './pptPreviewBridge';
import { initOfficeWatchBridge } from './officeWatchBridge';
import { initWorkspaceSnapshotBridge } from './workspaceSnapshotBridge';
import { initRemoteAgentBridge } from './remoteAgentBridge';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

export interface BridgeDependencies {
  workerTaskManager: IWorkerTaskManager;
}

export function initAllBridges(deps: BridgeDependencies): void {
  initDialogBridge();
  initShellBridge();
  initApplicationBridge(deps.workerTaskManager);
  initBedrockBridge();
  initAuthBridge();
  initPreviewHistoryBridge();
  initDocumentBridge();
  initPptPreviewBridge();
  initOfficeWatchBridge();
  initWindowControlsBridge();
  initUpdateBridge();
  initSystemSettingsBridge();
  initNotificationBridge();
  initTaskBridge(deps.workerTaskManager);
  initSpeechToTextBridge();
  initWorkspaceSnapshotBridge();
  initRemoteAgentBridge();
}

export {
  initApplicationBridge,
  initAuthBridge,
  initBedrockBridge,
  initDialogBridge,
  initDocumentBridge,
  initNotificationBridge,
  initOfficeWatchBridge,
  initPptPreviewBridge,
  initPreviewHistoryBridge,
  initShellBridge,
  initSpeechToTextBridge,
  initSystemSettingsBridge,
  initTaskBridge,
  initUpdateBridge,
  initRemoteAgentBridge,
  initWindowControlsBridge,
  initWorkspaceSnapshotBridge,
};
export { disposeAllSnapshots } from './workspaceSnapshotBridge';
export { registerWindowMaximizeListeners } from './windowControlsBridge';
export const disposeAllTeamSessions = (): Promise<void> => Promise.resolve();
