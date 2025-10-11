/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@/agent/acp/AcpDetector';
import { initAcpConversationBridge } from './acpConversationBridge';
import { initApplicationBridge } from './applicationBridge';
import { initAuthBridge } from './authBridge';
import { initCodexBridge } from './codexBridge';
import { initConversationBridge } from './conversationBridge';
import { initDialogBridge } from './dialogBridge';
import { initFsBridge } from './fsBridge';
import { initGeminiConversationBridge } from './geminiConversationBridge';
import { initMcpBridge } from './mcpBridge';
import { initModelBridge } from './modelBridge';
import { initShellBridge } from './shellBridge';

/**
 * 初始化所有IPC桥接模块
 */
export function initAllBridges(): void {
  initDialogBridge();
  initShellBridge();
  initFsBridge();
  initConversationBridge();
  initApplicationBridge();
  initGeminiConversationBridge();
  initAcpConversationBridge();
  initCodexBridge();
  initAuthBridge();
  initModelBridge();
  initMcpBridge();
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
export { initAcpConversationBridge, initApplicationBridge, initAuthBridge, initCodexBridge, initConversationBridge };
export { initDialogBridge, initFsBridge, initGeminiConversationBridge, initMcpBridge, initModelBridge, initShellBridge };
