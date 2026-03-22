/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bridge initialiser for standalone (no-Electron) mode.
 * Skips 10 Electron-only bridges:
 *   dialogBridge, shellBridge, fsBridge, applicationBridge,
 *   windowControlsBridge, updateBridge, webuiBridge, notificationBridge,
 *   cronBridge, mcpBridge
 */
import { logger } from "@office-ai/platform";
import { acpDetector } from "@process/agent/acp/AcpDetector";
import { SqliteChannelRepository } from "@process/services/database/SqliteChannelRepository";
import { SqliteConversationRepository } from "@process/services/database/SqliteConversationRepository";
import { ConversationServiceImpl } from "@process/services/ConversationServiceImpl";
import { workerTaskManager } from "@process/task/workerTaskManagerSingleton";
import { initAcpConversationBridge } from "@process/bridge/acpConversationBridge";
import { initAuthBridge } from "@process/bridge/authBridge";
import { initBedrockBridge } from "@process/bridge/bedrockBridge";
import { initChannelBridge } from "@process/bridge/channelBridge";
import { initConversationBridge } from "@process/bridge/conversationBridge";
import { initDatabaseBridge } from "@process/bridge/databaseBridge";
import { initDocumentBridge } from "@process/bridge/documentBridge";
import { initExtensionsBridge } from "@process/bridge/extensionsBridge";
import { initFileWatchBridge } from "@process/bridge/fileWatchBridge";
import { initGeminiBridge } from "@process/bridge/geminiBridge";
import { initGeminiConversationBridge } from "@process/bridge/geminiConversationBridge";
import { initModelBridge } from "@process/bridge/modelBridge";
import { initPreviewHistoryBridge } from "@process/bridge/previewHistoryBridge";
import { initStarOfficeBridge } from "@process/bridge/starOfficeBridge";
import { initSystemSettingsBridge } from "@process/bridge/systemSettingsBridge";
import { initTaskBridge } from "@process/bridge/taskBridge";

logger.config({ print: true });

export async function initBridgeStandalone(): Promise<void> {
  const repo = new SqliteConversationRepository();
  const conversationService = new ConversationServiceImpl(repo);
  const channelRepo = new SqliteChannelRepository();

  // Skipped (Electron-only): dialogBridge, shellBridge, fsBridge, applicationBridge,
  // windowControlsBridge, updateBridge, webuiBridge, notificationBridge, cronBridge, mcpBridge

  initFileWatchBridge();
  initConversationBridge(conversationService, workerTaskManager);
  initGeminiConversationBridge(workerTaskManager);
  initGeminiBridge();
  initBedrockBridge();
  initAcpConversationBridge(workerTaskManager);
  initAuthBridge();
  initModelBridge();
  initPreviewHistoryBridge();
  initDocumentBridge();
  initChannelBridge(channelRepo);
  initDatabaseBridge(repo);
  initExtensionsBridge(repo, workerTaskManager);
  initSystemSettingsBridge();
  initTaskBridge(workerTaskManager);
  initStarOfficeBridge();

  // Initialize ACP detector to scan for installed CLI agents (claude, codex, etc.)
  // Must mirror Electron's initializeAcpDetector() call in src/index.ts
  try {
    await acpDetector.initialize();
  } catch (error) {
    console.error(
      "[ACP] Failed to initialize detector in standalone mode:",
      error,
    );
  }
}
