/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcMain } from 'electron';
import { getBrowserProfileService, getExternalChromeLauncher } from '../services/browser';
import type { CreateProfileInput, ExternalChromeConfig, UpdateProfileInput } from '@/common/browser/types';

export function registerBrowserBridge(): void {
  ipcMain.handle('browser:getProfiles', async () => {
    try {
      const profiles = getBrowserProfileService().getProfiles();
      return { success: true, data: profiles };
    } catch (error) {
      console.error('[browserBridge] getProfiles error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:getActiveProfile', async () => {
    try {
      const profile = getBrowserProfileService().getActiveProfile();
      return { success: true, data: profile };
    } catch (error) {
      console.error('[browserBridge] getActiveProfile error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:setActiveProfile', async (_event, id: string) => {
    try {
      const profile = getBrowserProfileService().setActiveProfile(id);
      return { success: true, data: profile };
    } catch (error) {
      console.error('[browserBridge] setActiveProfile error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:createProfile', async (_event, input: CreateProfileInput) => {
    try {
      const profile = getBrowserProfileService().createProfile(input);
      return { success: true, data: profile };
    } catch (error) {
      console.error('[browserBridge] createProfile error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:updateProfile', async (_event, input: UpdateProfileInput) => {
    try {
      const profile = getBrowserProfileService().updateProfile(input);
      return { success: true, data: profile };
    } catch (error) {
      console.error('[browserBridge] updateProfile error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:deleteProfile', async (_event, id: string) => {
    try {
      const deleted = getBrowserProfileService().deleteProfile(id);
      return { success: true, data: deleted };
    } catch (error) {
      console.error('[browserBridge] deleteProfile error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:clearProfileData', async (_event, id: string) => {
    try {
      const result = await getBrowserProfileService().clearProfileData(id);
      return result;
    } catch (error) {
      console.error('[browserBridge] clearProfileData error:', error);
      return {
        success: false,
        profileId: id,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:probeExternalChrome', async (_event, port?: number) => {
    try {
      const status = await getExternalChromeLauncher().probeChrome(port);
      return { success: true, data: status };
    } catch (error) {
      console.error('[browserBridge] probeExternalChrome error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:launchExternalChrome', async (_event, config: ExternalChromeConfig) => {
    try {
      const status = await getExternalChromeLauncher().launch(config);
      return { success: true, data: status };
    } catch (error) {
      console.error('[browserBridge] launchExternalChrome error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
