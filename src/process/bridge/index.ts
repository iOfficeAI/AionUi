/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@/agent/acp/AcpDetector';
import { initAcpConversationBridge } from './acpConversationBridge';
import { initApplicationBridge } from './applicationBridge';
import { initAuthBridge } from './authBridge';
import { initCodexConversationBridge } from './codexConversationBridge';
import { initConversationBridge } from './conversationBridge';
import { initConversionBridge } from './conversionBridge';
import { initDatabaseBridge } from './databaseBridge';
import { initDialogBridge } from './dialogBridge';
import { initFileWatchBridge } from './fileWatchBridge';
import { initFsBridge } from './fsBridge';
import { initGeminiConversationBridge } from './geminiConversationBridge';
import { initMcpBridge } from './mcpBridge';
import { initModelBridge } from './modelBridge';
import { initPreviewHistoryBridge } from './previewHistoryBridge';
import { initShellBridge } from './shellBridge';

/**
 * 初始化所有IPC桥接模块
 */
export function initAllBridges(): void {
  initDialogBridge();
  initShellBridge();
  initFsBridge();
  initFileWatchBridge();
  initConversationBridge();
  initApplicationBridge();
  initGeminiConversationBridge();
  initAcpConversationBridge();
  initCodexConversationBridge();
  initAuthBridge();
  initModelBridge();
  initMcpBridge();
  initDatabaseBridge();
  initPreviewHistoryBridge();
  initConversionBridge();
  // Conversion bridge is an object, not a function, so we just ensure it's imported if it has side effects,
  // but wait, the other bridges have init functions.
  // Let's check conversionBridge.ts again.
  // It exports an object 'conversionBridge' with invoke/handle methods.
  // Unlike others which seem to export an init function that calls ipcMain.handle.
  // Ah, looking at conversionBridge.ts, it has 'handle' properties which are functions calling ipcMain.handle.
  // But they are not called automatically.
  // I need to create an init function in conversionBridge.ts or call them here.
  // Let's look at how other bridges work.
  // e.g. initPreviewHistoryBridge.
}

/**
 * 初始化ACP检测器
 */
export async function initializeAcpDetector(): Promise<void> {
  try {
    await acpDetector.initialize();
  } catch (error) {
    console.error('[ACP] Failed to initialize detector:', error);
  }
}

// 导出初始化函数供单独使用
export { initAcpConversationBridge, initApplicationBridge, initAuthBridge, initCodexConversationBridge, initConversationBridge, initDatabaseBridge, initDialogBridge, initFsBridge, initGeminiConversationBridge, initMcpBridge, initModelBridge, initPreviewHistoryBridge, initShellBridge };
