/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IPC bridge for external CLI session history.
 * Provides list and import operations to the renderer process.
 *
 * Security: IPC import only accepts {backend, id} — the main process
 * looks up session details from its own parsed data, never trusting
 * renderer-supplied paths.
 */

import { ipcBridge } from '@/common';
import type { ExternalSessionBackend } from '@/common/externalHistoryTypes';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import { listAllExternalSessions } from '@process/services/externalHistory/ExternalSessionReader';
import { importExternalSession } from '@process/services/externalHistory/ExternalSessionImporter';

const VALID_BACKENDS = new Set<ExternalSessionBackend>(['claude', 'codex', 'gemini-cli', 'opencode']);

export function initExternalHistoryBridge(repo: IConversationRepository): void {
  // List all external sessions from supported CLI agents
  ipcBridge.externalHistory.list.provider(async () => {
    return await listAllExternalSessions();
  });

  // Import an external session as a local AionUi conversation
  ipcBridge.externalHistory.import.provider(async (params) => {
    try {
      // Validate input from renderer
      if (!VALID_BACKENDS.has(params.backend)) {
        return { success: false, error: `Invalid backend: ${String(params.backend)}` };
      }
      if (!params.id || typeof params.id !== 'string' || params.id.length > 200) {
        return { success: false, error: 'Invalid session ID format' };
      }

      const result = await importExternalSession(repo, params.backend, params.id);

      // Notify renderer to refresh the conversation list
      if (result.success && result.conversationId) {
        ipcBridge.conversation.listChanged.emit({
          conversationId: result.conversationId,
          action: 'created',
          source: 'external-import',
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ExternalHistoryBridge] Error importing session:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });
}
