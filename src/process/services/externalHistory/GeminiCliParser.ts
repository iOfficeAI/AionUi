/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parser for Gemini CLI session history.
 *
 * Gemini CLI stores:
 * - Session index: ~/.gemini/history/<name>/.project_root (project path)
 * - Session data: ~/.gemini/tmp/<name>/chats/session-*.json
 *   Each JSON has { sessionId, projectHash, startTime, lastUpdated, messages[] }
 *   messages: { id, timestamp, type, content }
 *   type=user → content is Array<{ text }>, type=gemini → content is string
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { ExternalMessage, ExternalParseResult, ExternalSessionInfo } from './types';

type GeminiSession = {
  sessionId: string;
  projectHash?: string;
  startTime: string;
  lastUpdated: string;
  messages: GeminiMessage[];
  summary?: string;
  kind?: string;
};

type GeminiMessage = {
  id: string;
  timestamp: string;
  type: string;
  content: string | Array<{ text?: string }>;
  thoughts?: unknown;
};

function getGeminiBaseDir(): string {
  return path.join(os.homedir(), '.gemini');
}

/**
 * Strip Gemini CLI system instruction prefix from user message content.
 * Gemini CLI prepends "[Assistant Rules...]\n[Available Skills]...\n[User Request]\n"
 * to the first user message. Extract only the text after "[User Request]\n".
 */
function stripSystemPrefix(text: string): string {
  const marker = '[User Request]\n';
  const idx = text.indexOf(marker);
  if (idx !== -1) {
    return text.slice(idx + marker.length).trim();
  }
  return text;
}

/**
 * Extract text content from a Gemini message.
 * Handles both string content (gemini) and array content (user).
 * Strips system instruction prefixes from user messages.
 */
function extractContentText(content: string | Array<{ text?: string }>): string {
  let text: string;
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((block) => block.text)
      .map((block) => block.text!)
      .join('\n');
  } else {
    return '';
  }
  return stripSystemPrefix(text);
}

/**
 * List all Gemini CLI sessions by scanning ~/.gemini/history/ directories
 * and their corresponding ~/.gemini/tmp/<name>/chats/ session files.
 */
export async function listGeminiCliSessions(): Promise<ExternalSessionInfo[]> {
  const baseDir = getGeminiBaseDir();
  const historyDir = path.join(baseDir, 'history');
  const tmpDir = path.join(baseDir, 'tmp');

  let historyEntries: string[];
  try {
    historyEntries = await fs.readdir(historyDir);
  } catch {
    return [];
  }

  const sessions: ExternalSessionInfo[] = [];

  for (const dirName of historyEntries) {
    const chatsDir = path.join(tmpDir, dirName, 'chats');

    let chatFiles: string[];
    try {
      chatFiles = await fs.readdir(chatsDir);
    } catch {
      continue;
    }

    // Read workspace from .project_root
    let workspace = '';
    try {
      workspace = (await fs.readFile(path.join(historyDir, dirName, '.project_root'), 'utf-8')).trim();
    } catch {
      // No project root info
    }

    for (const file of chatFiles) {
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = path.join(chatsDir, file);
        const raw = await fs.readFile(filePath, 'utf-8');
        const session = JSON.parse(raw) as GeminiSession;

        if (!session.sessionId || !session.messages?.length) continue;

        // Skip sessions with only 1 message (no real conversation)
        if (session.messages.length < 2) continue;

        // Use summary field as title (Gemini CLI generates this)
        const name =
          session.summary ||
          extractContentText(session.messages.find((m) => m.type === 'user')?.content ?? '').slice(0, 80) ||
          'Gemini CLI Session';

        const updatedAt = new Date(session.lastUpdated || session.startTime).getTime();

        sessions.push({
          id: session.sessionId,
          name,
          backend: 'gemini-cli' as const,
          workspace,
          updatedAt,
        });
      } catch {
        // Skip malformed files
      }
    }
  }

  return sessions;
}

/**
 * Find the session JSON file path for a given Gemini CLI session ID.
 * Scans all tmp directories under ~/.gemini for matching session files.
 */
async function findSessionFile(sessionId: string): Promise<{ filePath: string; dirName: string } | null> {
  const tmpDir = path.join(getGeminiBaseDir(), 'tmp');

  let tmpEntries: string[];
  try {
    tmpEntries = await fs.readdir(tmpDir);
  } catch {
    return null;
  }

  for (const dirName of tmpEntries) {
    const chatsDir = path.join(tmpDir, dirName, 'chats');

    let chatFiles: string[];
    try {
      chatFiles = await fs.readdir(chatsDir);
    } catch {
      continue;
    }

    // Quick filename match first (session ID is in the filename)
    const match = chatFiles.find((f) => f.includes(sessionId) && f.endsWith('.json'));
    if (match) {
      return { filePath: path.join(chatsDir, match), dirName };
    }

    // Fallback: read and check sessionId field
    for (const file of chatFiles) {
      if (!file.endsWith('.json')) continue;
      try {
        const filePath = path.join(chatsDir, file);
        const raw = await fs.readFile(filePath, 'utf-8');
        const session = JSON.parse(raw) as GeminiSession;
        if (session.sessionId === sessionId) {
          return { filePath, dirName };
        }
      } catch {
        // Skip
      }
    }
  }

  return null;
}

/**
 * Parse a Gemini CLI session JSON file into messages.
 * Only extracts user and gemini (assistant) text messages.
 */
export async function parseGeminiCliSession(sessionId: string): Promise<ExternalParseResult> {
  const found = await findSessionFile(sessionId);
  if (!found) return { messages: [], workspace: '', name: '' };

  let raw: string;
  try {
    raw = await fs.readFile(found.filePath, 'utf-8');
  } catch {
    return { messages: [], workspace: '', name: '' };
  }

  const session = JSON.parse(raw) as GeminiSession;

  // Read workspace from .project_root
  let workspace = '';
  try {
    workspace = (
      await fs.readFile(path.join(getGeminiBaseDir(), 'history', found.dirName, '.project_root'), 'utf-8')
    ).trim();
  } catch {
    // No project root info
  }

  const messages: ExternalMessage[] = [];

  for (const msg of session.messages) {
    if (msg.type !== 'user' && msg.type !== 'gemini') continue;

    const role: 'user' | 'assistant' = msg.type === 'user' ? 'user' : 'assistant';
    const text = extractContentText(msg.content);
    if (!text) continue;

    messages.push({
      role,
      content: text,
      timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : undefined,
    });
  }

  // Session title: prefer summary, fallback to first user message
  const firstUser = messages.find((m) => m.role === 'user');
  const name = session.summary || firstUser?.content.slice(0, 80) || 'Gemini CLI Session';

  return { messages, workspace, name };
}
