/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';

// Force node-gyp-build to skip build/ directory and use prebuilds/ only in production
// This prevents loading wrong architecture binaries from development environment
// Only apply in packaged app to allow development builds to use build/Release/
if (app.isPackaged) {
  process.env.PREBUILDS_ONLY = '1';
}
import initStorage from './initStorage';
import './initBridge';
import './i18n'; // Initialize i18n for main process
import { getChannelManager } from '@/channels';
import { ExtensionRegistry } from '@/extensions';
import { isLegacyChannelRuntime } from '@/runtime/mode';

export const initializeProcess = async () => {
  await initStorage();

  // Initialize Extension Registry (scan and resolve all extensions)
  try {
    await ExtensionRegistry.getInstance().initialize();
  } catch (error) {
    console.error('[Process] Failed to initialize ExtensionRegistry:', error);
    // Don't fail app startup if extensions fail to initialize
  }

  // Channel lifecycle is fully replaced by standalone runtime mode by default.
  // Keep legacy in-process mode only as an explicit rollback switch.
  if (isLegacyChannelRuntime()) {
    try {
      await getChannelManager().initialize();
    } catch (error) {
      console.error('[Process] Failed to initialize ChannelManager (legacy mode):', error);
      // Don't fail app startup if channel fails to initialize
    }
  } else {
    console.log('[Process] Skip ChannelManager init: runtime mode enabled (AIONUI_CHANNEL_MODE!=legacy)');
  }
};
