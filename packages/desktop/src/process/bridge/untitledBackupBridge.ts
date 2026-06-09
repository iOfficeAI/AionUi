/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bridges the renderer's `untitledBackup.*` IPC namespace to the
 * main-process `UntitledBackupService` singleton (VS Code-style
 * transparent hot-exit backups for untitled files).
 *
 * Mirrors the `localHistoryBridge` pattern: each method wraps the
 * service call in an `IBridgeResponse` envelope. Registered once at
 * app start.
 */

import { ipcBridge } from '@/common';
import { getUntitledBackupService } from '@process/services/untitledBackup/UntitledBackupService';

export function initUntitledBackupBridge(): void {
  const service = getUntitledBackupService();

  ipcBridge.untitledBackup.write.provider(async (req) => {
    try {
      const data = await service.write(req);
      return { success: true, data };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.untitledBackup.read.provider(async (req) => {
    try {
      const data = await service.read(req);
      return { success: true, data };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.untitledBackup.delete.provider(async (req) => {
    try {
      await service.delete(req);
      return { success: true };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.untitledBackup.list.provider(async () => {
    try {
      const data = await service.list();
      return { success: true, data };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
