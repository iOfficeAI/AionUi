/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { initApplicationBridge } from './applicationBridge';
import { initDialogBridge } from './dialogBridge';
import { initUpdateBridge } from './updateBridge';
import { initSystemSettingsBridge } from './systemSettingsBridge';
import { initWindowControlsBridge } from './windowControlsBridge';
import { initNotificationBridge } from './notificationBridge';
import { initWebuiBridge } from './webuiBridge';
import { initThemeBridge } from './themeBridge';
import { registerBrowserService } from '../services/browserService';
import { registerBrowserBridge } from './browserBridge';
import { registerTeamworkHandlers } from '../services/teamwork/teamworkHandler';
import { registerTeamScopingHandlers } from '../services/teamwork/teamScopingHandler';
import { registerKnowledgeRepoBridge } from './knowledgeRepoBridge';
import { registerGatewayBridge } from './gatewayBridge';
import { getGatewayService } from '../services/gateway';

export type BridgeDependencies = Record<string, never>;

export function initAllBridges(_deps: BridgeDependencies = {}): void {
  initDialogBridge();
  initApplicationBridge();
  initWindowControlsBridge();
  initUpdateBridge();
  initSystemSettingsBridge();
  initNotificationBridge();
  initWebuiBridge();
  initThemeBridge();
  registerBrowserService();
  registerBrowserBridge();
  registerTeamworkHandlers();
  registerTeamScopingHandlers();
  registerKnowledgeRepoBridge();
  registerGatewayBridge();
  void getGatewayService()
    .start()
    .catch((err) => {
      console.error('[Gateway] Failed to start gateway service:', err);
    });
}

export {
  initApplicationBridge,
  initDialogBridge,
  initNotificationBridge,
  initSystemSettingsBridge,
  initThemeBridge,
  initUpdateBridge,
  initWindowControlsBridge,
  initWebuiBridge,
};
export { registerWindowMaximizeListeners } from './windowControlsBridge';
export const disposeAllTeamSessions = (): Promise<void> => Promise.resolve();
