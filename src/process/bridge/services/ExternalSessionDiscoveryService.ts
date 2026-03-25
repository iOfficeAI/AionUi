/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import type { TMessage } from '@/common/chat/chatLib';
import type { AcpBackendAll } from '@/common/types/acpTypes';
import type {
  ExternalSessionProvider,
  ExternalSessionSummary,
  ImportExternalSessionParams,
} from '@/common/types/externalSessions';
import { uuid } from '@/common/utils';
import type { IConversationService } from '@/process/services/IConversationService';
import { getDatabase } from '@/process/services/database';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import os from 'os';
import path from 'path';

type CodexThreadRow = {
  id: string;
  title: string;
  cwd: string;
  updated_at: number;
  source: string;
  model_provider: string | null;
  model: string | null;
  reasoning_effort: string | null;
  rollout_path?: string | null;
};

type ImportedConversationMessage = {
  content: string;
  createdAt: number;
  position: 'left' | 'right';
};

type CodexRolloutEntry = {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown> & {
    type?: string;
    role?: string;
    message?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  };
};

type ExternalSessionDiscoveryOptions = {
  codexHomeDir?: string;
  availableBackends?: Set<AcpBackendAll>;
};

type CodexStateDbInfo = {
  path: string;
  mtimeMs: number;
};

type CodexSessionCacheEntry = {
  dbPath: string;
  dbMtimeMs: number;
  sessions: ExternalSessionSummary[];
};

const CODEX_STATE_FILE_PATTERN = /^state_\d+\.sqlite$/;
const IMPORT_PLACEHOLDER_PROVIDER: TProviderWithModel = {
  id: 'external-session-import',
  platform: 'codex',
  name: 'Codex',
  baseUrl: '',
  apiKey: '',
  useModel: 'default',
};

let codexSessionCache: CodexSessionCacheEntry | null = null;

export class ExternalSessionDiscoveryService {
  constructor(
    private readonly conversationService: IConversationService,
    private readonly options: ExternalSessionDiscoveryOptions = {}
  ) {}

  async listSessions(): Promise<ExternalSessionSummary[]> {
    const sessions = await this.listCodexSessions();

    if (sessions.length === 0) {
      return [];
    }

    const conversations = await this.conversationService.listAllConversations();
    const managedSessions = this.collectManagedSessions(conversations);

    return sessions
      .filter((session) => !managedSessions.has(this.buildManagedKey(session.provider, session.sessionId)))
      .toSorted((left, right) => right.updatedAt - left.updatedAt);
  }

  async importSession(params: ImportExternalSessionParams): Promise<TChatConversation> {
    const { provider, sessionId } = params;
    const conversations = await this.conversationService.listAllConversations();
    const existingConversation = this.findImportedConversation(conversations, provider, sessionId);
    if (existingConversation) {
      return existingConversation;
    }

    switch (provider) {
      case 'codex':
        return this.importCodexSession(sessionId);
      default:
        throw new Error(`External session provider is not supported yet: ${provider}`);
    }
  }

  private async importCodexSession(sessionId: string): Promise<TChatConversation> {
    const session = (await this.listCodexSessions()).find((item) => item.sessionId === sessionId);
    if (!session) {
      throw new Error('External Codex session not found');
    }

    const conversation = await this.conversationService.createConversation({
      type: 'acp',
      name: session.title || path.basename(session.workspace) || session.sessionId,
      model: {
        ...IMPORT_PLACEHOLDER_PROVIDER,
        useModel: session.model || IMPORT_PLACEHOLDER_PROVIDER.useModel,
      },
      source: 'aionui',
      extra: {
        workspace: session.workspace,
        customWorkspace: true,
        backend: 'codex',
        cliPath: 'codex',
        agentName: 'Codex CLI',
        acpSessionId: session.sessionId,
        acpSessionUpdatedAt: session.updatedAt,
        currentModelId: session.model || undefined,
        externalSessionImported: true,
        deferInitialWorkspaceLoad: true,
      },
    });

    await this.importCodexHistory(conversation.id, sessionId);

    return conversation;
  }

  private async listCodexSessions(): Promise<ExternalSessionSummary[]> {
    if (!this.isBackendAvailable('codex')) {
      return [];
    }

    const stateDb = await this.resolveLatestCodexStateDb();
    if (!stateDb) {
      return [];
    }

    if (
      codexSessionCache &&
      codexSessionCache.dbPath === stateDb.path &&
      codexSessionCache.dbMtimeMs === stateDb.mtimeMs
    ) {
      return codexSessionCache.sessions;
    }

    let database: DatabaseSync | null = null;
    try {
      database = new DatabaseSync(stateDb.path, {
        open: true,
        readOnly: true,
      });
      const rows = database
        .prepare(`
          SELECT id, title, cwd, updated_at, source, model_provider, model, reasoning_effort
          FROM threads
          WHERE archived = 0
          ORDER BY updated_at DESC
        `)
        .all() as CodexThreadRow[];

      const sessions = rows
        .filter((row) => typeof row.id === 'string' && typeof row.cwd === 'string' && row.cwd.trim())
        .map((row) => ({
          provider: 'codex' as const,
          sessionId: row.id,
          title: row.title || row.id,
          workspace: row.cwd,
          updatedAt: this.normalizeTimestamp(row.updated_at),
          origin: row.source || undefined,
          modelProvider: row.model_provider || undefined,
          model: row.model || undefined,
          reasoningEffort: row.reasoning_effort || undefined,
        }));

      codexSessionCache = {
        dbPath: stateDb.path,
        dbMtimeMs: stateDb.mtimeMs,
        sessions,
      };

      return sessions;
    } catch (error) {
      console.warn('[ExternalSessionDiscoveryService] Failed to list Codex sessions:', error);
      return [];
    } finally {
      database?.close();
    }
  }

  private async resolveLatestCodexStateDb(): Promise<CodexStateDbInfo | null> {
    const codexHomeDir = this.options.codexHomeDir || path.join(os.homedir(), '.codex');

    try {
      const entries = await fs.readdir(codexHomeDir, { withFileTypes: true });
      const candidates = entries
        .filter((entry) => entry.isFile() && CODEX_STATE_FILE_PATTERN.test(entry.name))
        .map((entry) => path.join(codexHomeDir, entry.name));

      if (candidates.length === 0) {
        return null;
      }

      const stats = await Promise.all(
        candidates.map(async (candidatePath) => ({
          path: candidatePath,
          stat: await fs.stat(candidatePath),
        }))
      );

      stats.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);
      const latest = stats[0];

      if (!latest) {
        return null;
      }

      return {
        path: latest.path,
        mtimeMs: latest.stat.mtimeMs,
      };
    } catch {
      return null;
    }
  }

  private async importCodexHistory(conversationId: string, sessionId: string): Promise<void> {
    try {
      const thread = await this.getCodexThread(sessionId);
      if (!thread?.rollout_path) {
        return;
      }

      const importedMessages = await this.readCodexRolloutMessages(thread.rollout_path);
      if (importedMessages.length === 0) {
        return;
      }

      const db = await getDatabase();
      for (const importedMessage of importedMessages) {
        const message: TMessage = {
          id: uuid(36),
          msg_id: uuid(36),
          conversation_id: conversationId,
          type: 'text',
          position: importedMessage.position,
          status: 'finish',
          createdAt: importedMessage.createdAt,
          content: {
            content: importedMessage.content,
          },
        };

        const result = db.insertMessage(message);
        if (!result.success) {
          throw new Error(result.error || 'Failed to insert imported Codex history message');
        }
      }
    } catch (error) {
      console.warn('[ExternalSessionDiscoveryService] Failed to import Codex history:', error);
    }
  }

  private async getCodexThread(sessionId: string): Promise<CodexThreadRow | null> {
    const stateDb = await this.resolveLatestCodexStateDb();
    if (!stateDb) {
      return null;
    }

    let database: DatabaseSync | null = null;
    try {
      database = new DatabaseSync(stateDb.path, {
        open: true,
        readOnly: true,
      });

      const row = database
        .prepare(`
          SELECT id, title, cwd, updated_at, source, model_provider, model, reasoning_effort, rollout_path
          FROM threads
          WHERE archived = 0 AND id = ?
          LIMIT 1
        `)
        .get(sessionId) as CodexThreadRow | undefined;

      return row ?? null;
    } catch (error) {
      console.warn('[ExternalSessionDiscoveryService] Failed to load Codex thread:', error);
      return null;
    } finally {
      database?.close();
    }
  }

  private async readCodexRolloutMessages(rolloutPath: string): Promise<ImportedConversationMessage[]> {
    const importedMessages: ImportedConversationMessage[] = [];
    const stream = createReadStream(rolloutPath, { encoding: 'utf8' });
    const lineReader = createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    try {
      for await (const line of lineReader) {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
          continue;
        }

        try {
          const entry = JSON.parse(trimmedLine) as CodexRolloutEntry;
          const importedMessage = this.parseCodexRolloutEntry(entry);
          if (importedMessage) {
            importedMessages.push(importedMessage);
          }
        } catch {
          continue;
        }
      }
    } finally {
      lineReader.close();
      stream.destroy();
    }

    return importedMessages.toSorted((left, right) => left.createdAt - right.createdAt);
  }

  private parseCodexRolloutEntry(entry: CodexRolloutEntry): ImportedConversationMessage | null {
    const createdAt = this.parseRolloutTimestamp(entry.timestamp);

    if (entry.type === 'event_msg' && entry.payload?.type === 'user_message') {
      const content = typeof entry.payload.message === 'string' ? entry.payload.message.trim() : '';
      if (!content) {
        return null;
      }

      return {
        content,
        createdAt,
        position: 'right',
      };
    }

    if (entry.type === 'response_item' && entry.payload?.type === 'message' && entry.payload.role === 'assistant') {
      const content = Array.isArray(entry.payload.content)
        ? entry.payload.content
            .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
            .map((item) => item.text?.trim() || '')
            .filter(Boolean)
            .join('\n\n')
        : '';

      if (!content) {
        return null;
      }

      return {
        content,
        createdAt,
        position: 'left',
      };
    }

    return null;
  }

  private collectManagedSessions(conversations: TChatConversation[]): Set<string> {
    const managed = new Set<string>();

    for (const conversation of conversations) {
      if (conversation.type === 'acp' && conversation.extra?.backend === 'codex' && conversation.extra.acpSessionId) {
        managed.add(this.buildManagedKey('codex', conversation.extra.acpSessionId));
      }

      if (
        conversation.type === 'openclaw-gateway' &&
        typeof conversation.extra?.sessionKey === 'string' &&
        conversation.extra.sessionKey
      ) {
        managed.add(this.buildManagedKey('openclaw-gateway', conversation.extra.sessionKey));
      }
    }

    return managed;
  }

  private findImportedConversation(
    conversations: TChatConversation[],
    provider: ExternalSessionProvider,
    sessionId: string
  ): TChatConversation | undefined {
    return conversations.find((conversation) => {
      if (provider === 'codex') {
        return (
          conversation.type === 'acp' &&
          conversation.extra?.backend === 'codex' &&
          conversation.extra.acpSessionId === sessionId
        );
      }

      if (provider === 'openclaw-gateway') {
        return conversation.type === 'openclaw-gateway' && conversation.extra?.sessionKey === sessionId;
      }

      return false;
    });
  }

  private buildManagedKey(provider: ExternalSessionProvider, sessionId: string): string {
    return `${provider}:${sessionId}`;
  }

  private isBackendAvailable(backend: AcpBackendAll): boolean {
    return this.options.availableBackends?.has(backend) ?? true;
  }

  private normalizeTimestamp(timestamp: number): number {
    return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  }

  private parseRolloutTimestamp(timestamp?: string): number {
    if (!timestamp) {
      return Date.now();
    }

    const parsed = Date.parse(timestamp);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
}
