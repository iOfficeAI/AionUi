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
import initStorage, { getSystemDir, getSkillsDir, getBuiltinSkillsDir } from './utils/initStorage';
import './utils/initBridge';
import './services/i18n'; // Initialize i18n for main process
import { getChannelManager } from '@process/channels';
import { ExtensionRegistry } from '@process/extensions';
import { needsPhase1Migration, runPhase1Migration, SkillRepository, WatchedImportBridge } from '@process/skills';

export const initializeProcess = async () => {
  await initStorage();

  // Initialize Extension Registry (scan and resolve all extensions)
  try {
    await ExtensionRegistry.getInstance().initialize();
  } catch (error) {
    console.error('[Process] Failed to initialize ExtensionRegistry:', error);
    // Don't fail app startup if extensions fail to initialize
  }

  // Skill System: Phase 1 migration + WatchedImportBridge startup
  try {
    const { workDir } = getSystemDir();
    if (await needsPhase1Migration(workDir)) {
      console.info('[SkillSystem] Running Phase 1 migration...');
      await runPhase1Migration(workDir, getBuiltinSkillsDir(), getSkillsDir(), workDir);
      console.info('[SkillSystem] Phase 1 migration complete.');
    }
    // Ensure SkillRepository singleton is created (loads cache from disk)
    SkillRepository.getInstance();
    // Start watching CLI skill directories for auto-import
    const bridge = new WatchedImportBridge();
    await bridge.start();
    console.info('[SkillSystem] WatchedImportBridge started.');
  } catch (error) {
    console.error('[SkillSystem] Failed to initialize skill system:', error);
    // Don't fail app startup if skill system fails
  }

  // Initialize Channel subsystem
  try {
    await getChannelManager().initialize();
  } catch (error) {
    console.error('[Process] Failed to initialize ChannelManager:', error);
    // Don't fail app startup if channel fails to initialize
  }
};
