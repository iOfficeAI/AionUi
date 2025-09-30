/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@/agent/acp/AcpDetector';
import { initAcpBridge } from './acpBridge';
import { initApplicationBridge } from './applicationBridge';
import { initAuthBridge } from './authBridge';
import { initConversationBridge } from './conversationBridge';
import { initDialogBridge } from './dialogBridge';
import { initFsBridge } from './fsBridge';
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
  initAcpBridge();
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
export { initAcpBridge, initApplicationBridge, initAuthBridge, initConversationBridge, initDialogBridge, initFsBridge, initMcpBridge, initModelBridge, initShellBridge };
