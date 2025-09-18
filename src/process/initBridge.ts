/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@/agent/acp/AcpDetector';
import { logger } from '@office-ai/platform';
import { initAllBridges } from './bridge';

logger.config({ print: true });

// 初始化所有IPC桥接
initAllBridges();

// 初始化ACP检测器
export async function initializeAcpDetector(): Promise<void> {
  try {
    await acpDetector.initialize();
  } catch (error) {
    console.error('[ACP] Failed to initialize detector:', error);
  }
}
