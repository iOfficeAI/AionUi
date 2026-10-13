/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserWindow, ipcMain } from 'electron';
import {
  getBrowserProfileService,
  getExternalChromeLauncher,
  getBrowserToolService,
  getBrowserSafetyGateService,
} from '../services/browser';
import type { CreateProfileInput, ExternalChromeConfig, UpdateProfileInput } from '@/common/browser/types';

export function registerBrowserBridge(): void {
  try {
    getBrowserToolService().on('progress', (event) => {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('browser:toolProgress', event);
        }
      }
    });

    getBrowserSafetyGateService().on('safetyApprovalRequest', (req) => {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('browser:safetyApprovalRequest', req);
        }
      }
    });
  } catch {
    // Ignore in headless/mock test environments
  }

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

  ipcMain.handle(
    'browser:executeAction',
    async (_event, request: import('@/common/browser/types').BrowserActionRequest) => {
      try {
        const { getBrowserAutomationEngine } = await import('../services/browser');
        const result = await getBrowserAutomationEngine().execute(request);
        return result;
      } catch (error) {
        console.error('[browserBridge] executeAction error:', error);
        return {
          success: false,
          action: request?.action || 'navigate',
          error: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        };
      }
    }
  );

  ipcMain.handle('browser:getSnapshot', async (_event, options?: import('@/common/browser/types').SnapshotOptions) => {
    try {
      const { getBrowserAutomationEngine } = await import('../services/browser');
      const snapshot = await getBrowserAutomationEngine().getSnapshot(options);
      return { success: true, data: snapshot };
    } catch (error) {
      console.error('[browserBridge] getSnapshot error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(
    'browser:takeScreenshot',
    async (_event, options?: import('@/common/browser/types').ScreenshotOptions) => {
      try {
        const { getBrowserAutomationEngine } = await import('../services/browser');
        const res = await getBrowserAutomationEngine().screenshot(options);
        return { success: true, data: res.data };
      } catch (error) {
        console.error('[browserBridge] takeScreenshot error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'browser:waitForDownload',
    async (_event, options?: import('@/common/browser/types').DownloadOptions) => {
      try {
        const { getBrowserDownloadManager } = await import('../services/browser');
        const record = await getBrowserDownloadManager().waitForDownload(options);
        return { success: true, data: record };
      } catch (error) {
        console.error('[browserBridge] waitForDownload error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle('browser:getDownloads', async () => {
    try {
      const { getBrowserDownloadManager } = await import('../services/browser');
      const list = getBrowserDownloadManager().getDownloads();
      return { success: true, data: list };
    } catch (error) {
      console.error('[browserBridge] getDownloads error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:getToolDefinitions', async () => {
    try {
      const { getBrowserToolService } = await import('../services/browser');
      const defs = getBrowserToolService().getToolDefinitions();
      return { success: true, data: defs };
    } catch (error) {
      console.error('[browserBridge] getToolDefinitions error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(
    'browser:callTool',
    async (
      _event,
      payload: {
        tool: import('../services/browser').BrowserToolName;
        args?: Record<string, unknown>;
        taskId?: string;
      }
    ) => {
      try {
        const { getBrowserToolService } = await import('../services/browser');
        const res = await getBrowserToolService().executeTool(payload.tool, payload.args, {
          taskId: payload.taskId,
        });
        return res;
      } catch (error) {
        console.error('[browserBridge] callTool error:', error);
        return {
          success: false,
          tool: payload?.tool,
          error: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        };
      }
    }
  );

  ipcMain.handle('browser:cancelToolTask', async (_event, taskId: string) => {
    try {
      const { getBrowserToolService } = await import('../services/browser');
      const cancelled = getBrowserToolService().cancelTask(taskId);
      return { success: true, data: cancelled };
    } catch (error) {
      console.error('[browserBridge] cancelToolTask error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('browser:getWorkflows', async () => {
    try {
      const { getBrowserWorkflowEngine } = await import('../services/browser');
      const workflows = getBrowserWorkflowEngine().getWorkflows();
      return { success: true, data: workflows };
    } catch (error) {
      console.error('[browserBridge] getWorkflows error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(
    'browser:executeWorkflow',
    async (
      _event,
      payload: {
        workflowId: string;
        params?: Record<string, unknown>;
        profileId?: string;
      }
    ) => {
      try {
        const { getBrowserWorkflowEngine } = await import('../services/browser');
        const res = await getBrowserWorkflowEngine().executeWorkflow(payload.workflowId, payload.params, {
          profileId: payload.profileId,
        });
        return res;
      } catch (error) {
        console.error('[browserBridge] executeWorkflow error:', error);
        return {
          success: false,
          workflowId: payload?.workflowId,
          stepResults: [],
          outputs: {},
          error: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        };
      }
    }
  );

  ipcMain.handle(
    'browser:postSocial',
    async (_event, options: import('@/common/browser/safetyTypes').SocialPostOptions) => {
      try {
        const { getSocialApiService } = await import('../services/browser');
        const res = await getSocialApiService().post(options);
        return res;
      } catch (error) {
        console.error('[browserBridge] postSocial error:', error);
        return {
          success: false,
          platform: options?.platform || 'instagram',
          mode: 'official_api',
          error: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        };
      }
    }
  );

  ipcMain.handle(
    'browser:respondSafetyApproval',
    async (_event, payload: { requestId: string; approved: boolean; rememberChoice?: boolean }) => {
      try {
        const { getBrowserSafetyGateService } = await import('../services/browser');
        const res = getBrowserSafetyGateService().respondApproval(
          payload.requestId,
          payload.approved,
          payload.rememberChoice
        );
        return { success: true, data: res };
      } catch (error) {
        console.error('[browserBridge] respondSafetyApproval error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'browser:setSafetyAutoApprove',
    async (
      _event,
      payload: { actionType: import('@/common/browser/safetyTypes').SafetyActionType; enabled: boolean }
    ) => {
      try {
        const { getBrowserSafetyGateService } = await import('../services/browser');
        getBrowserSafetyGateService().setAutoApprove(payload.actionType, payload.enabled);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  ipcMain.handle(
    'browser:getSafetyAutoApprove',
    async (_event, actionType: import('@/common/browser/safetyTypes').SafetyActionType) => {
      try {
        const { getBrowserSafetyGateService } = await import('../services/browser');
        const enabled = getBrowserSafetyGateService().isAutoApproveEnabled(actionType);
        return { success: true, data: enabled };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  ipcMain.handle('browser:setSocialDailyCap', async (_event, cap: number) => {
    try {
      const { getSocialRateLimiter } = await import('../services/browser');
      getSocialRateLimiter().setMaxDailyPosts(cap);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('browser:getSocialDailyCap', async () => {
    try {
      const { getSocialRateLimiter } = await import('../services/browser');
      const cap = getSocialRateLimiter().getMaxDailyPosts();
      return { success: true, data: cap };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('browser:getSocialDailyCount', async (_event, platform: string) => {
    try {
      const { getSocialRateLimiter } = await import('../services/browser');
      const count = getSocialRateLimiter().getDailyCount(platform);
      return { success: true, data: count };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
