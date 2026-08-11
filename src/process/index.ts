/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import '@/common/platform/register-electron';
// configureChromium sets app name (dev isolation) and Chromium flags — must run before other modules
import '@process/utils/configureChromium';

import { app } from 'electron';

// Force node-gyp-build to skip build/ directory and use prebuilds/ only in production
// This prevents loading wrong architecture binaries from development environment
// Only apply in packaged app to allow development builds to use build/Release/
if (app.isPackaged) {
  process.env.PREBUILDS_ONLY = '1';
}
import initStorage from './utils/initStorage';
import './utils/initBridge';
import './services/i18n'; // Initialize i18n for main process
import { getChannelManager } from '@process/channels';
import { ExtensionRegistry } from '@process/extensions';
import { ApiCallbackManager } from '@process/services/ApiCallbackManager';

export const initializeProcess = async () => {
  const t0 = performance.now();
  const mark = (label: string) => console.log(`[AionUi:process] ${label} +${Math.round(performance.now() - t0)}ms`);

  await initStorage();
  mark('initStorage');

  // Register conversation callback listeners for all app modes, not just WebUI.
  ApiCallbackManager.getInstance();
  mark('ApiCallbackManager');

  // Initialize Extension Registry (scan and resolve all extensions)
  try {
    await ExtensionRegistry.getInstance().initialize();
  } catch (error) {
    console.error('[Process] Failed to initialize ExtensionRegistry:', error);
    // Don't fail app startup if extensions fail to initialize
  }
  mark('ExtensionRegistry');

  // Initialize Channel subsystem
  try {
    await getChannelManager().initialize();
  } catch (error) {
    console.error('[Process] Failed to initialize ChannelManager:', error);
    // Don't fail app startup if channel fails to initialize
  }
  mark('ChannelManager');
};
