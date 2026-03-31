/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parser for Claude Code session history.
 *
 * Claude Code stores:
 * - Session index: ~/.claude/history.jsonl (sessionId, display, project, timestamp)
 * - Full conversation: ~/.claude/projects/{project-path}/{sessionId}.jsonl
 *   Each line has { type, message, sessionId, ... }
 *   type=user → user message, type=assistant → assistant message
 *   message.content is an array of { type: 'text', text: '...' }
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { ExternalMessage, ExternalParseResult, ExternalSessionInfo } from './types';

type ClaudeHistoryEntry = {
  display: string;
  project: string;
  sessionId: string;
  timestamp: number;
};

type ClaudeContentBlock = {
  type: string;
  text?: string;
};

type ClaudeMessageEntry = {
  type: string;
  message?: {
    content: ClaudeContentBlock[] | string;
  };
  sessionId?: string;
  timestamp?: string;
};

function getClaudeConfigDir(): string {
  return path.join(os.homedir(), '.claude');
}

/**
 * List all Claude Code sessions from ~/.claude/history.jsonl.
 * Deduplicates by sessionId, keeping the latest entry as the title.
 */
export async function listClaudeCodeSessions(): Promise<ExternalSessionInfo[]> {
  const historyPath = path.join(getClaudeConfigDir(), 'history.jsonl');

  let content: string;
  try {
    content = await fs.readFile(historyPath, 'utf-8');
  } catch {
    return [];
  }

  const sessionMap = new Map<string, { name: string; workspace: string; updatedAt: number }>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const entry = JSON.parse(trimmed) as ClaudeHistoryEntry;
      if (!entry.sessionId) continue;

      const existing = sessionMap.get(entry.sessionId);
      if (!existing || entry.timestamp > existing.updatedAt) {
        sessionMap.set(entry.sessionId, {
          name: entry.display || 'Claude Code Session',
          workspace: entry.project || '',
          updatedAt: entry.timestamp,
        });
      }
    } catch {
      // Skip malformed lines
    }
  }

  return Array.from(sessionMap.entries()).map(([id, info]) => ({
    id,
    name: info.name,
    backend: 'claude' as const,
    workspace: info.workspace,
    updatedAt: info.updatedAt,
  }));
}

/**
 * Encode a project path to the Claude-style directory name.
 * Claude Code encodes `/Users/audi/Downloads/Data` as `-Users-audi-Downloads-Data`.
 * Handles both POSIX (/) and Windows (\) separators.
 */
function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/[\\/]/g, '-');
}

/**
 * Look up the project path and display name for a given session ID from history.jsonl.
 * Returns the entry with the latest timestamp, consistent with listClaudeCodeSessions.
 */
async function findSessionMeta(sessionId: string): Promise<{ project: string; name: string } | null> {
  const historyPath = path.join(getClaudeConfigDir(), 'history.jsonl');

  let content: string;
  try {
    content = await fs.readFile(historyPath, 'utf-8');
  } catch {
    return null;
  }

  let best: { project: string; name: string } | null = null;
  let bestTimestamp = -1;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as ClaudeHistoryEntry;
      if (entry.sessionId === sessionId && entry.project && entry.timestamp > bestTimestamp) {
        best = { project: entry.project, name: entry.display || '' };
        bestTimestamp = entry.timestamp;
      }
    } catch {
      // Skip malformed lines
    }
  }

  return best;
}

/**
 * Parse a Claude Code session JSONL file into messages.
 * Only extracts user and assistant text messages.
 * Looks up the project path and title from history.jsonl internally.
 */
export async function parseClaudeSession(sessionId: string): Promise<ExternalParseResult> {
  const meta = await findSessionMeta(sessionId);
  if (!meta) return { messages: [], workspace: '', name: '' };

  const encodedProject = encodeProjectPath(meta.project);
  const sessionFile = path.join(getClaudeConfigDir(), 'projects', encodedProject, `${sessionId}.jsonl`);

  let content: string;
  try {
    content = await fs.readFile(sessionFile, 'utf-8');
  } catch {
    return { messages: [], workspace: meta.project, name: meta.name };
  }

  const messages: ExternalMessage[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const entry = JSON.parse(trimmed) as ClaudeMessageEntry;
      if (entry.type !== 'user' && entry.type !== 'assistant') continue;

      const role = entry.type as 'user' | 'assistant';
      const messageContent = entry.message?.content;

      let text = '';
      if (Array.isArray(messageContent)) {
        text = messageContent
          .filter((block) => block.type === 'text' && block.text)
          .map((block) => block.text!)
          .join('\n');
      } else if (typeof messageContent === 'string') {
        text = messageContent;
      }

      if (!text) continue;

      messages.push({
        role,
        content: text,
        timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : undefined,
      });
    } catch {
      // Skip malformed lines
    }
  }

  return { messages, workspace: meta.project, name: meta.name };
}
