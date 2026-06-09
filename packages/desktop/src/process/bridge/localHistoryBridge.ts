/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bridges the renderer's `localHistory.*` IPC namespace to the main-process
 * `LocalHistoryService` singleton (VS Code-style Timeline, git-independent).
 *
 * Mirrors the `gitBridge` pattern: each method wraps the service call in an
 * `IBridgeResponse` envelope. Registered once at app start.
 */

import { ipcBridge } from '@/common';
import { getLocalHistoryService } from '@process/services/localHistory/LocalHistoryService';

export function initLocalHistoryBridge(): void {
  const service = getLocalHistoryService();

  ipcBridge.localHistory.addSnapshot.provider(async (req) => {
    try {
      const data = await service.addSnapshot(req);
      return { success: true, data };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.localHistory.listEntries.provider(async (req) => {
    try {
      const data = await service.listEntries(req);
      return { success: true, data };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.localHistory.getEntryContent.provider(async (req) => {
    try {
      const data = await service.getEntryContent(req);
      return { success: true, data };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.localHistory.deleteEntry.provider(async (req) => {
    try {
      const data = await service.deleteEntry(req);
      return { success: true, data };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.localHistory.clear.provider(async (req) => {
    try {
      await service.clear(req);
      return { success: true };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
