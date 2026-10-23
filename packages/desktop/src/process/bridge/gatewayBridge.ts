/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcMain } from 'electron';
import { getGatewayService } from '../services/gateway';
import type { GatewayAccount, GatewayCombo } from '@/common/types/gateway/gatewayTypes';

export function registerGatewayBridge(): void {
  const service = getGatewayService();
  const store = service.getStore();

  ipcMain.handle('gateway:getStatus', async () => {
    try {
      return { success: true, data: service.getStatus() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('gateway:getAccounts', async () => {
    try {
      return { success: true, data: store.getAccounts() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('gateway:saveAccount', async (_event, account: GatewayAccount) => {
    try {
      store.saveAccount(account);
      void service.syncWithBackend();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('gateway:deleteAccount', async (_event, id: string) => {
    try {
      store.deleteAccount(id);
      void service.syncWithBackend();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('gateway:getCombos', async () => {
    try {
      return { success: true, data: store.getCombos() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('gateway:saveCombo', async (_event, combo: GatewayCombo) => {
    try {
      store.saveCombo(combo);
      void service.syncWithBackend();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('gateway:deleteCombo', async (_event, id: string) => {
    try {
      store.deleteCombo(id);
      void service.syncWithBackend();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('gateway:syncBackend', async () => {
    try {
      await service.syncWithBackend();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('gateway:getLogs', async (_event, params?: { limit?: number; offset?: number }) => {
    try {
      const res = store.getLogs(params?.limit ?? 100, params?.offset ?? 0);
      return { success: true, data: res };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('gateway:clearLogs', async () => {
    try {
      store.clearLogs();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('gateway:resetCooldown', async (_event, accountId: string) => {
    try {
      store.updateAccountQuota(accountId, undefined, 'active', 0);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('gateway:syncLocalOmniRoute', async () => {
    try {
      const { syncOmniRouteIntoStore } = await import('../services/gateway/localOmniRouteSync');
      const res = await syncOmniRouteIntoStore(store);
      void service.syncWithBackend();
      return { success: true, data: res };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('gateway:checkOmniRouteStatus', async () => {
    try {
      const { checkOmniRouteRunning } = await import('../services/gateway/localOmniRouteSync');
      const isRunning = await checkOmniRouteRunning();
      return { success: true, isRunning, port: 20128 };
    } catch (error) {
      return { success: false, isRunning: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('gateway:googleOAuthLogin', async () => {
    try {
      const { loginWithGoogleInBrowser } = await import('../services/oauth/googleOAuthService');
      const res = await loginWithGoogleInBrowser();
      return res;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
