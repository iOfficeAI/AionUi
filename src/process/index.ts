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

export type InitializeProcessOptions = {
  initializeChannels?: boolean;
  initializeExtensions?: boolean;
};

export const initializeProcess = async (options: InitializeProcessOptions = {}) => {
  const { initializeChannels = true, initializeExtensions = true } = options;
  const t0 = performance.now();
  const mark = (label: string) => console.log(`[AionUi:process] ${label} +${Math.round(performance.now() - t0)}ms`);

  await initStorage();
  mark('initStorage');

  if (initializeExtensions) {
    // Initialize Extension Registry (scan and resolve all extensions)
    try {
      await ExtensionRegistry.getInstance().initialize();
    } catch (error) {
      console.error('[Process] Failed to initialize ExtensionRegistry:', error);
      // Don't fail app startup if extensions fail to initialize
    }
    mark('ExtensionRegistry');
  } else {
    mark('ExtensionRegistry skipped');
  }

  if (initializeChannels) {
    // Initialize Channel subsystem
    try {
      await getChannelManager().initialize();
    } catch (error) {
      console.error('[Process] Failed to initialize ChannelManager:', error);
      // Don't fail app startup if channel fails to initialize
    }
    mark('ChannelManager');
  } else {
    mark('ChannelManager skipped');
  }
};
