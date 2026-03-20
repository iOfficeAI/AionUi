/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Imports an external CLI session into AionUi as a local conversation.
 * Creates a new conversation in the database and inserts all messages
 * within a single transaction for atomicity.
 */

import type { TMessage } from '@/common/chat/chatLib';
import type { ExternalSessionBackend, ImportSessionResult } from '@/common/externalHistoryTypes';
import type { TChatConversation } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import { getDatabase } from '@process/services/database';
import { parseClaudeSession } from './ClaudeCodeParser';
import { parseCodexSession } from './CodexParser';
import { parseGeminiCliSession } from './GeminiCliParser';
import { parseOpenCodeSession } from './OpenCodeParser';
import type { ExternalMessage, ExternalParseResult } from './types';

function convertToTMessages(
  conversationId: string,
  externalMessages: ExternalMessage[]
): TMessage[] {
  return externalMessages.map((msg) => ({
    id: uuid(),
    type: 'text' as const,
    conversation_id: conversationId,
    position: msg.role === 'user' ? ('right' as const) : ('left' as const),
    status: 'finish' as const,
    createdAt: msg.timestamp ?? Date.now(),
    content: { content: msg.content },
  }));
}

export type { ImportSessionResult };

/**
 * Import an external session into AionUi's database.
 * Only accepts backend + id; the importer resolves session data
 * from the local filesystem, never from renderer-supplied input.
 *
 * Uses getDatabase() directly to leverage better-sqlite3 transaction()
 * with proper error propagation (IQueryResult checked, throws on failure).
 */
export async function importExternalSession(
  _repo: unknown,
  backend: ExternalSessionBackend,
  sessionId: string
): Promise<ImportSessionResult> {
  try {
    // 1. Parse messages from the external session
    let result: ExternalParseResult;

    switch (backend) {
      case 'claude':
        result = await parseClaudeSession(sessionId);
        break;
      case 'codex':
        result = await parseCodexSession(sessionId);
        break;
      case 'gemini-cli':
        result = await parseGeminiCliSession(sessionId);
        break;
      case 'opencode':
        result = await parseOpenCodeSession(sessionId);
        break;
      default:
        return { success: false, error: `Unsupported backend: ${backend as string}` };
    }

    const { messages: externalMessages, workspace, name: sessionName } = result;

    if (externalMessages.length === 0) {
      return { success: false, error: 'No messages found in the session' };
    }

    // 2. Create conversation + insert messages in a single transaction
    const db = await getDatabase();
    const conversationId = uuid();
    const now = Date.now();

    // Map external backend to native conversation type + model
    const isGemini = backend === 'gemini-cli';
    const conversationType = isGemini ? 'gemini' : 'acp';
    const model = isGemini
      ? {
          id: 'gemini-placeholder',
          name: 'Gemini',
          useModel: 'default',
          platform: 'gemini-with-google-auth',
          baseUrl: '',
          apiKey: '',
        }
      : { platform: '', name: '' };

    const extra: Record<string, unknown> = {
      workspace,
      customWorkspace: Boolean(workspace),
    };
    // ACP conversations need backend in extra for proper routing/display
    if (conversationType === 'acp') {
      // Map external backend names to their ACP backend identifiers
      const acpBackendMap: Record<string, string> = {
        claude: 'claude',
        codex: 'codex',
        opencode: 'opencode',
      };
      extra.backend = acpBackendMap[backend] ?? backend;
    }

    const conversation = {
      id: conversationId,
      name: sessionName || externalMessages[0]?.content.slice(0, 80) || `Imported ${backend} session`,
      type: conversationType,
      createTime: now,
      modifyTime: now,
      model,
      source: 'external-import',
      extra,
    } as TChatConversation;

    const tMessages = convertToTMessages(conversationId, externalMessages);

    // Use transaction for atomicity — check IQueryResult and throw on failure
    // so that better-sqlite3 rolls back the entire transaction.
    db.runInTransaction(() => {
      const convResult = db.createConversation(conversation);
      if (!convResult.success) {
        throw new Error(`Failed to create conversation: ${convResult.error}`);
      }

      for (const msg of tMessages) {
        const msgResult = db.insertMessage(msg);
        if (!msgResult.success) {
          throw new Error(`Failed to insert message: ${msgResult.error}`);
        }
      }
    });

    return {
      success: true,
      conversationId,
      messageCount: tMessages.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[ExternalSessionImporter] Import failed:', errorMessage);
    return { success: false, error: errorMessage };
  }
}
