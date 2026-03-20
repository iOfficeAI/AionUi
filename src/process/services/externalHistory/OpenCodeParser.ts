/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parser for OpenCode session history.
 *
 * OpenCode stores conversations in an SQLite database:
 * - Location: ~/.local/share/opencode/opencode.db
 * - Schema: session → message → part (three-layer)
 * - message.data: JSON { role, time: { created, completed }, ... }
 * - part.data: JSON { type, text } — only type=text is extracted
 */

import os from 'os';
import path from 'path';
import type DatabaseConstructor from 'better-sqlite3';
import type { ExternalMessage, ExternalParseResult, ExternalSessionInfo } from './types';

type OpenCodeSessionRow = {
  id: string;
  title: string;
  directory: string;
  time_updated: number;
};

type OpenCodeMessageRow = {
  id: string;
  data: string;
  time_created: number;
};

type OpenCodePartRow = {
  data: string;
};

type OpenCodeMessageData = {
  role: string;
  time?: { created?: number; completed?: number };
};

type OpenCodePartData = {
  type: string;
  text?: string;
};

function getOpenCodeDbPath(): string {
  return path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
}

/**
 * Open the OpenCode SQLite database in read-only mode.
 * Returns null if the database doesn't exist or can't be opened.
 */
function openDb(): DatabaseConstructor.Database | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require('better-sqlite3') as typeof DatabaseConstructor;
    const dbPath = getOpenCodeDbPath();
    return new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }
}

/**
 * List all OpenCode sessions from the SQLite database.
 */
export async function listOpenCodeSessions(): Promise<ExternalSessionInfo[]> {
  const db = openDb();
  if (!db) return [];

  try {
    const rows = db.prepare(
      'SELECT id, title, directory, time_updated FROM session ORDER BY time_updated DESC',
    ).all() as OpenCodeSessionRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.title || 'OpenCode Session',
      backend: 'opencode' as const,
      workspace: row.directory && row.directory !== '.' ? row.directory : '',
      updatedAt: row.time_updated,
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/**
 * Parse an OpenCode session into messages.
 * Queries message + part tables, extracting only text parts
 * from user and assistant messages.
 */
export async function parseOpenCodeSession(sessionId: string): Promise<ExternalParseResult> {
  const db = openDb();
  if (!db) return { messages: [], workspace: '', name: '' };

  try {
    // Get session info for workspace
    const sessionRow = db.prepare(
      'SELECT title, directory FROM session WHERE id = ?',
    ).get(sessionId) as { title: string; directory: string } | undefined;

    const dir = sessionRow?.directory;
    const workspace = dir && dir !== '.' ? dir : '';
    const name = sessionRow?.title ?? 'OpenCode Session';

    // Get messages ordered by creation time
    const messageRows = db.prepare(
      'SELECT id, data, time_created FROM message WHERE session_id = ? ORDER BY time_created ASC',
    ).all(sessionId) as OpenCodeMessageRow[];

    const messages: ExternalMessage[] = [];

    for (const msgRow of messageRows) {
      let msgData: OpenCodeMessageData;
      try {
        msgData = JSON.parse(msgRow.data) as OpenCodeMessageData;
      } catch {
        continue;
      }

      if (msgData.role !== 'user' && msgData.role !== 'assistant') continue;

      // Get text parts for this message
      const partRows = db.prepare(
        'SELECT data FROM part WHERE message_id = ? ORDER BY time_created ASC',
      ).all(msgRow.id) as OpenCodePartRow[];

      const textParts: string[] = [];
      for (const partRow of partRows) {
        try {
          const partData = JSON.parse(partRow.data) as OpenCodePartData;
          if (partData.type === 'text' && partData.text) {
            textParts.push(partData.text);
          }
        } catch {
          // Skip malformed parts
        }
      }

      if (textParts.length === 0) continue;

      messages.push({
        role: msgData.role as 'user' | 'assistant',
        content: textParts.join('\n'),
        timestamp: msgData.time?.created ?? msgRow.time_created,
      });
    }

    return { messages, workspace, name };
  } catch {
    return { messages: [], workspace: '', name: '' };
  } finally {
    db.close();
  }
}
