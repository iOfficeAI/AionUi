/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bridge initialiser for standalone (no-Electron) mode.
 * Skips Electron-only bridges:
 *   dialogBridge, applicationBridge (partial — core handlers in applicationBridgeCore),
 *   windowControlsBridge, updateBridge, webuiBridge
 * Note: shellBridge is replaced by shellBridgeStandalone (child_process-based).
 */
import { logger } from '@office-ai/platform';
import { agentRegistry } from '@process/agent/AgentRegistry';
import { SqliteChannelRepository } from '@process/services/database/SqliteChannelRepository';
import { SqliteConversationRepository } from '@process/services/database/SqliteConversationRepository';
import { ConversationServiceImpl } from '@process/services/ConversationServiceImpl';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import { initAcpConversationBridge } from '@process/bridge/acpConversationBridge';
import { initAuthBridge } from '@process/bridge/authBridge';
import { initBedrockBridge } from '@process/bridge/bedrockBridge';
import { initChannelBridge } from '@process/bridge/channelBridge';
import { initConversationBridge } from '@process/bridge/conversationBridge';
import { initDatabaseBridge } from '@process/bridge/databaseBridge';
import { initDocumentBridge } from '@process/bridge/documentBridge';
import { initExtensionsBridge } from '@process/bridge/extensionsBridge';
import { initFileWatchBridge } from '@process/bridge/fileWatchBridge';
import { initGeminiBridge } from '@process/bridge/geminiBridge';
import { initGeminiConversationBridge } from '@process/bridge/geminiConversationBridge';
import { initModelBridge } from '@process/bridge/modelBridge';
import { initPreviewHistoryBridge } from '@process/bridge/previewHistoryBridge';
import { initPptPreviewBridge } from '@process/bridge/pptPreviewBridge';
import { initOfficeWatchBridge } from '@process/bridge/officeWatchBridge';
import { initStarOfficeBridge } from '@process/bridge/starOfficeBridge';
import { initApplicationBridgeCore } from '@process/bridge/applicationBridgeCore';
import { initShellBridgeStandalone } from '@process/bridge/shellBridgeStandalone';
import { initCronBridge } from '@process/bridge/cronBridge';
import { initFsBridge } from '@process/bridge/fsBridge';
import { initMcpBridge } from '@process/bridge/mcpBridge';
import { initNotificationBridge } from '@process/bridge/notificationBridge';
import { initSystemSettingsBridge } from '@process/bridge/systemSettingsBridge';
import { initTaskBridge } from '@process/bridge/taskBridge';
import { initSpeechToTextBridge } from '@process/bridge/speechToTextBridge';
import { initHubBridge } from '@process/bridge/hubBridge';

logger.config({ print: true });

export async function initBridgeStandalone(): Promise<void> {
  const repo = new SqliteConversationRepository();
  const conversationService = new ConversationServiceImpl(repo);
  const channelRepo = new SqliteChannelRepository();

  // Skipped (Electron-only): dialogBridge, applicationBridge (partial — see applicationBridgeCore),
  // windowControlsBridge, updateBridge, webuiBridge

  initApplicationBridgeCore();
  initShellBridgeStandalone();
  initFileWatchBridge();
  initFsBridge();
  initConversationBridge(conversationService, workerTaskManager);
  initGeminiConversationBridge(workerTaskManager);
  initGeminiBridge();
  initBedrockBridge();
  initAcpConversationBridge(workerTaskManager);
  initAuthBridge();
  initModelBridge();
  initPreviewHistoryBridge();
  initDocumentBridge();
  initPptPreviewBridge();
  initOfficeWatchBridge();
  initChannelBridge(channelRepo);
  initDatabaseBridge(repo);
  initExtensionsBridge(repo, workerTaskManager);
  initSystemSettingsBridge();
  initCronBridge();
  initMcpBridge();
  initNotificationBridge();
  initTaskBridge(workerTaskManager);
  initStarOfficeBridge();
  initSpeechToTextBridge();
  initHubBridge();

  // Initialize ACP detector to scan for installed CLI agents (claude, codex, etc.)
  // Must mirror Electron's initializeAcpDetector() call in src/index.ts
  try {
    await agentRegistry.initialize();
  } catch (error) {
    console.error('[ACP] Failed to initialize detector in standalone mode:', error);
  }
}
