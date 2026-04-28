/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { agentRegistry } from '@process/agent/AgentRegistry';
import type { TeamSessionService } from '@process/team/TeamSessionService';
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
import { initTeamBridge } from './teamBridge';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

export interface BridgeDependencies {
  workerTaskManager: IWorkerTaskManager;
  teamSessionService: TeamSessionService;
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
  initTeamBridge(deps.teamSessionService);
}

export async function initializeAcpDetector(): Promise<void> {
  try {
    await agentRegistry.initialize();
  } catch (error) {
    console.error('[ACP] Failed to initialize detector:', error);
  }
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
  initTeamBridge,
  initWindowControlsBridge,
  initWorkspaceSnapshotBridge,
};
export { disposeAllSnapshots } from './workspaceSnapshotBridge';
export { disposeAllTeamSessions } from './teamBridge';
export { registerWindowMaximizeListeners } from './windowControlsBridge';
