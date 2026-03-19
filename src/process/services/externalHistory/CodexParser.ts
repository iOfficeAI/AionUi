/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parser for Codex CLI session history.
 *
 * Codex stores:
 * - Session index: ~/.codex/session_index.jsonl (id, thread_name, updated_at)
 * - Full conversation: ~/.codex/sessions/{yyyy}/{mm}/{dd}/rollout-{ts}-{id}.jsonl
 *   Each line has { timestamp, type, payload }
 *   type=session_meta → session metadata (first line, contains source/cwd)
 *   type=response_item → payload has { role, content: [{ type, text }] }
 *   type=event_msg → agent events (skipped)
 *
 * Subagent sessions have source as an object (e.g. { subagent: { ... } })
 * instead of a string ("cli", "exec", "vscode"). These are filtered out.
 */

import { createReadStream, promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createInterface } from 'readline';
import type { ExternalMessage, ExternalParseResult, ExternalSessionInfo } from './types';

type CodexSessionIndexEntry = {
  id: string;
  thread_name: string;
  updated_at: string;
};

type CodexSessionMeta = {
  id?: string;
  source?: string | Record<string, unknown>;
  cwd?: string;
};

type CodexRolloutEntry = {
  timestamp: string;
  type: string;
  payload: CodexSessionMeta & {
    type?: string;
    role?: string;
    content?: Array<{ type: string; text?: string }>;
  };
};

function getCodexConfigDir(): string {
  return path.join(os.homedir(), '.codex');
}

/**
 * Codex official interactive session sources.
 * Only sessions with these source values appear in the Codex UI thread list.
 * See: codex-rs/core/src/rollout/mod.rs → INTERACTIVE_SESSION_SOURCES
 */
const INTERACTIVE_SOURCES = new Set(['cli', 'vscode']);

/**
 * Scan all rollout files and collect interactive session IDs and workspace info.
 * Only reads the first line of each file (session_meta).
 * Non-interactive sessions (exec, unknown, subagent) are excluded.
 */
async function scanRolloutMeta(): Promise<{
  interactiveIds: Set<string>;
  workspaces: Map<string, string>;
}> {
  const sessionsDir = path.join(getCodexConfigDir(), 'sessions');
  const interactiveIds = new Set<string>();
  const workspaces = new Map<string, string>();

  try {
    const years = await fs.readdir(sessionsDir);
    for (const year of years) {
      const yearDir = path.join(sessionsDir, year);
      let months: string[];
      try {
        months = await fs.readdir(yearDir);
      } catch {
        continue;
      }
      for (const month of months) {
        const monthDir = path.join(yearDir, month);
        let days: string[];
        try {
          days = await fs.readdir(monthDir);
        } catch {
          continue;
        }
        for (const day of days) {
          const dayDir = path.join(monthDir, day);
          let files: string[];
          try {
            files = await fs.readdir(dayDir);
          } catch {
            continue;
          }
          for (const file of files) {
            if (!file.endsWith('.jsonl')) continue;
            try {
              const filePath = path.join(dayDir, file);
              const firstLine = await readFirstLine(filePath);
              if (!firstLine) continue;

              const entry = JSON.parse(firstLine) as CodexRolloutEntry;
              if (entry.type !== 'session_meta') continue;

              const sessionId = entry.payload?.id;
              if (!sessionId) continue;

              // Only include interactive sources (matching Codex official logic)
              const source = entry.payload?.source;
              if (typeof source === 'string' && INTERACTIVE_SOURCES.has(source)) {
                interactiveIds.add(sessionId);
              }

              // Extract workspace (cwd) for all sessions
              if (entry.payload?.cwd) {
                workspaces.set(sessionId, entry.payload.cwd);
              }
            } catch {
              // Skip unreadable files
            }
          }
        }
      }
    }
  } catch {
    // Sessions directory doesn't exist
  }

  return { interactiveIds, workspaces };
}

/**
 * Read only the first line of a file using Node streams.
 * Memory-efficient: only buffers data up to the first newline,
 * regardless of how long the line is (session_meta can be >100KB
 * when it contains full system instructions).
 */
function readFirstLine(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    let resolved = false;
    const done = (value: string) => {
      if (resolved) return;
      resolved = true;
      rl.close();
      stream.destroy();
      resolve(value);
    };

    rl.once('line', (line) => done(line.trim()));
    rl.once('close', () => done(''));
    stream.once('error', () => done(''));
  });
}

/**
 * List all Codex sessions from ~/.codex/session_index.jsonl.
 * Deduplicates by session id, filters out subagent sessions,
 * and enriches with workspace (cwd) from rollout metadata.
 */
export async function listCodexSessions(): Promise<ExternalSessionInfo[]> {
  const indexPath = path.join(getCodexConfigDir(), 'session_index.jsonl');

  let content: string;
  try {
    content = await fs.readFile(indexPath, 'utf-8');
  } catch {
    return [];
  }

  const sessionMap = new Map<string, { name: string; updatedAt: number }>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const entry = JSON.parse(trimmed) as CodexSessionIndexEntry;
      if (!entry.id) continue;

      const updatedAt = new Date(entry.updated_at).getTime();
      const existing = sessionMap.get(entry.id);

      if (!existing || updatedAt > existing.updatedAt) {
        sessionMap.set(entry.id, {
          name: entry.thread_name || 'Codex Session',
          updatedAt,
        });
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Scan rollout files to identify interactive sessions and collect workspaces
  const { interactiveIds, workspaces } = await scanRolloutMeta();

  return Array.from(sessionMap.entries())
    .filter(([id]) => interactiveIds.has(id))
    .map(([id, info]) => ({
      id,
      name: info.name,
      backend: 'codex' as const,
      workspace: workspaces.get(id),
      updatedAt: info.updatedAt,
    }));
}

/**
 * Find the rollout JSONL file for a given Codex session ID.
 * Searches ~/.codex/sessions/{yyyy}/{mm}/{dd}/ directories.
 */
async function findRolloutFile(sessionId: string): Promise<string | null> {
  const sessionsDir = path.join(getCodexConfigDir(), 'sessions');

  try {
    const years = await fs.readdir(sessionsDir);
    // Search in reverse chronological order for efficiency
    for (const year of years.sort().reverse()) {
      const yearDir = path.join(sessionsDir, year);
      const yearStat = await fs.stat(yearDir);
      if (!yearStat.isDirectory()) continue;

      const months = await fs.readdir(yearDir);
      for (const month of months.sort().reverse()) {
        const monthDir = path.join(yearDir, month);
        const monthStat = await fs.stat(monthDir);
        if (!monthStat.isDirectory()) continue;

        const days = await fs.readdir(monthDir);
        for (const day of days.sort().reverse()) {
          const dayDir = path.join(monthDir, day);
          const dayStat = await fs.stat(dayDir);
          if (!dayStat.isDirectory()) continue;

          const files = await fs.readdir(dayDir);
          const match = files.find((f) => f.includes(sessionId) && f.endsWith('.jsonl'));
          if (match) {
            return path.join(dayDir, match);
          }
        }
      }
    }
  } catch {
    // Sessions directory doesn't exist or is unreadable
  }

  return null;
}

/**
 * Look up the session name (thread_name) from session_index.jsonl.
 */
async function findSessionName(sessionId: string): Promise<string> {
  const indexPath = path.join(getCodexConfigDir(), 'session_index.jsonl');
  let content: string;
  try {
    content = await fs.readFile(indexPath, 'utf-8');
  } catch {
    return '';
  }

  let bestName = '';
  let bestTime = -1;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as CodexSessionIndexEntry;
      if (entry.id === sessionId) {
        const t = new Date(entry.updated_at).getTime();
        if (t > bestTime) {
          bestName = entry.thread_name || '';
          bestTime = t;
        }
      }
    } catch {
      // Skip
    }
  }

  return bestName;
}

/**
 * Parse a Codex rollout JSONL file into messages.
 * Only extracts user and assistant messages (skips developer/system role).
 * Returns workspace (cwd) from session_meta and name from session_index for proper grouping.
 */
export async function parseCodexSession(sessionId: string): Promise<ExternalParseResult> {
  const [rolloutPath, sessionName] = await Promise.all([
    findRolloutFile(sessionId),
    findSessionName(sessionId),
  ]);
  if (!rolloutPath) return { messages: [], workspace: '', name: sessionName };

  let content: string;
  try {
    content = await fs.readFile(rolloutPath, 'utf-8');
  } catch {
    return { messages: [], workspace: '', name: sessionName };
  }

  const messages: ExternalMessage[] = [];
  let workspace = '';

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const entry = JSON.parse(trimmed) as CodexRolloutEntry;

      // Extract workspace from session_meta (first line)
      if (entry.type === 'session_meta' && entry.payload?.cwd) {
        workspace = entry.payload.cwd as string;
        continue;
      }

      if (entry.type !== 'response_item') continue;

      const role = entry.payload?.role;
      if (role !== 'user' && role !== 'assistant') continue;

      const contentBlocks = entry.payload?.content;
      if (!Array.isArray(contentBlocks)) continue;

      const text = contentBlocks
        .filter((block) => block.text)
        .map((block) => block.text!)
        .join('\n');

      if (!text) continue;

      messages.push({
        role: role as 'user' | 'assistant',
        content: text,
        timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : undefined,
      });
    } catch {
      // Skip malformed lines
    }
  }

  return { messages, workspace, name: sessionName };
}
