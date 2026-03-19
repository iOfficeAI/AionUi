/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@/agent/acp/AcpDetector';
import type { IChannelRepository } from '@process/database/IChannelRepository';
import type { IConversationRepository } from '@process/database/IConversationRepository';
import type { IConversationService } from '@process/services/IConversationService';
import type { IWorkerTaskManager } from '@process/task/worker/IWorkerTaskManager';
import { initAcpConversationBridge } from './conversation/acpConversationBridge';
import { initApplicationBridge } from './system/applicationBridge';
import { initAuthBridge } from './platform/authBridge';
import { initBedrockBridge } from './agent/bedrockBridge';
import { initChannelBridge } from './platform/channelBridge';
import { initConversationBridge } from './conversation/conversationBridge';
import { initCronBridge } from './agent/cronBridge';
import { initDatabaseBridge } from './data/databaseBridge';
import { initDialogBridge } from './system/dialogBridge';
import { initDocumentBridge } from './data/documentBridge';
import { initFileWatchBridge } from './data/fileWatchBridge';
import { initFsBridge } from './data/fsBridge';
import { initGeminiBridge } from './platform/geminiBridge';
import { initGeminiConversationBridge } from './conversation/geminiConversationBridge';
import { initMcpBridge } from './agent/mcpBridge';
import { initModelBridge } from './agent/modelBridge';
import { initPreviewHistoryBridge } from './conversation/previewHistoryBridge';
import { initShellBridge } from './system/shellBridge';
import { initStarOfficeBridge } from './data/starOfficeBridge';
import { initTaskBridge } from './agent/taskBridge';
import { initUpdateBridge } from './system/updateBridge';
import { initWebuiBridge } from './platform/webuiBridge';
import { initSystemSettingsBridge } from './system/systemSettingsBridge';
import { initWindowControlsBridge } from './system/windowControlsBridge';
import { initNotificationBridge } from './system/notificationBridge';
import { initExtensionsBridge } from './agent/extensionsBridge';

export interface BridgeDependencies {
  conversationService: IConversationService;
  conversationRepo: IConversationRepository;
  workerTaskManager: IWorkerTaskManager;
  channelRepo: IChannelRepository;
}

/**
 * 初始化所有IPC桥接模块
 */
export function initAllBridges(deps: BridgeDependencies): void {
  initDialogBridge();
  initShellBridge();
  initFsBridge();
  initFileWatchBridge();
  initConversationBridge(deps.conversationService, deps.workerTaskManager);
  initApplicationBridge(deps.workerTaskManager);
  initGeminiConversationBridge(deps.workerTaskManager);
  // 额外的 Gemini 辅助桥（订阅检测等）需要在对话桥初始化后可用 / extra helpers after core bridges
  initGeminiBridge();
  initBedrockBridge();
  initAcpConversationBridge(deps.workerTaskManager);
  initAuthBridge();
  initModelBridge();
  initMcpBridge();
  initPreviewHistoryBridge();
  initDocumentBridge();
  initWindowControlsBridge();
  initUpdateBridge();
  initWebuiBridge();
  initChannelBridge(deps.channelRepo);
  initDatabaseBridge(deps.conversationRepo);
  initExtensionsBridge(deps.conversationRepo, deps.workerTaskManager);
  initCronBridge();
  initSystemSettingsBridge();
  initNotificationBridge();
  initTaskBridge(deps.workerTaskManager);
  initStarOfficeBridge();
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

export {
  initAcpConversationBridge,
  initApplicationBridge,
  initAuthBridge,
  initBedrockBridge,
  initChannelBridge,
  initConversationBridge,
  initCronBridge,
  initDatabaseBridge,
  initDialogBridge,
  initDocumentBridge,
  initExtensionsBridge,
  initFsBridge,
  initGeminiBridge,
  initGeminiConversationBridge,
  initMcpBridge,
  initModelBridge,
  initNotificationBridge,
  initPreviewHistoryBridge,
  initShellBridge,
  initStarOfficeBridge,
  initSystemSettingsBridge,
  initTaskBridge,
  initUpdateBridge,
  initWebuiBridge,
  initWindowControlsBridge,
};
export { setMainWindow } from './system/notificationBridge';

// 导出窗口控制相关工具函数
export { registerWindowMaximizeListeners } from './system/windowControlsBridge';
