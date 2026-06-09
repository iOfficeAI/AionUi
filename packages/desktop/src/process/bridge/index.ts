/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { initApplicationBridge } from './applicationBridge';
import { initDialogBridge } from './dialogBridge';
import { initGitBridge } from './gitBridge';
import { initLocalHistoryBridge } from './localHistoryBridge';
import { initTerminalBridge } from './terminalBridge';
import { initUpdateBridge } from './updateBridge';
import { initSystemSettingsBridge } from './systemSettingsBridge';
import { initUntitledBackupBridge } from './untitledBackupBridge';
import { initWindowControlsBridge } from './windowControlsBridge';
import { initNotificationBridge } from './notificationBridge';
import { initWebuiBridge } from './webuiBridge';

export type BridgeDependencies = Record<string, never>;

export function initAllBridges(_deps: BridgeDependencies = {}): void {
  initDialogBridge();
  initApplicationBridge();
  initTerminalBridge();
  initGitBridge();
  initLocalHistoryBridge();
  initWindowControlsBridge();
  initUpdateBridge();
  initSystemSettingsBridge();
  initNotificationBridge();
  initWebuiBridge();
  initUntitledBackupBridge();
}

export {
  initApplicationBridge,
  initDialogBridge,
  initGitBridge,
  initLocalHistoryBridge,
  initNotificationBridge,
  initSystemSettingsBridge,
  initTerminalBridge,
  initUpdateBridge,
  initUntitledBackupBridge,
  initWindowControlsBridge,
  initWebuiBridge,
};
export { disposeGitBridge } from './gitBridge';
export { disposeTerminalBridge } from './terminalBridge';
export { registerWindowMaximizeListeners } from './windowControlsBridge';
export const disposeAllTeamSessions = (): Promise<void> => Promise.resolve();
