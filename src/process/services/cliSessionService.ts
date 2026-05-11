import type { CliSessionBackend, CliSessionSummary } from '@/common/types/cliSessionTypes';
import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { access, open, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

type ClaudeSessionSeed = Omit<CliSessionSummary, 'workspaceExists' | 'conversationId'>;
type CodexThreadRow = {
  id: string;
  cwd: string;
  title: string | null;
  first_user_message: string | null;
  created_at: number;
  updated_at: number;
  rollout_path: string;
};

const DEFAULT_LIMIT = 20;
const MAX_CLAUDE_SCAN_MULTIPLIER = 5;
const CLAUDE_HEAD_READ_BYTES = 64 * 1024;

function normalizePreview(text: string | undefined, fallback: string): string | undefined {
  const normalized = (text || fallback).replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function normalizeTitle(text: string | undefined, fallback: string): string {
  const preview = normalizePreview(text, fallback);
  if (!preview) {
    return fallback;
  }
  return preview.length > 80 ? `${preview.slice(0, 77)}...` : preview;
}

function extractClaudeMessageText(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  for (const item of content) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const typedItem = item as { type?: unknown; text?: unknown; content?: unknown };
    if (typedItem.type === 'text' && typeof typedItem.text === 'string') {
      return typedItem.text;
    }
    if (typeof typedItem.content === 'string') {
      return typedItem.content;
    }
  }

  return undefined;
}

async function pathExists(targetPath: string | undefined): Promise<boolean> {
  if (!targetPath) {
    return false;
  }

  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readClaudeSessionHead(filePath: string): Promise<{
  workspace?: string;
  firstUserMessage?: string;
  createdAt?: number;
}> {
  const handle = await open(filePath, 'r');
  let detectedWorkspace: string | undefined;
  let detectedCreatedAt: number | undefined;

  try {
    const buffer = Buffer.alloc(CLAUDE_HEAD_READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const chunk = buffer.subarray(0, bytesRead).toString('utf8');
    const lines = chunk.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const parsed = JSON.parse(trimmed) as {
          cwd?: unknown;
          timestamp?: unknown;
          type?: unknown;
          message?: { role?: unknown; content?: unknown };
        };

        const workspace = typeof parsed.cwd === 'string' ? parsed.cwd : undefined;
        const createdAt = typeof parsed.timestamp === 'string' ? Date.parse(parsed.timestamp) : undefined;
        const messageRole = parsed.message?.role;
        const userMessage =
          parsed.type === 'user' && messageRole === 'user'
            ? extractClaudeMessageText(parsed.message?.content)
            : undefined;

        if (workspace && !detectedWorkspace) {
          detectedWorkspace = workspace;
        }
        if (createdAt && !detectedCreatedAt) {
          detectedCreatedAt = createdAt;
        }

        if (userMessage) {
          return {
            workspace: detectedWorkspace,
            firstUserMessage: userMessage,
            createdAt: detectedCreatedAt,
          };
        }
      } catch {
        continue;
      }
    }
  } finally {
    await handle.close();
  }

  return {
    workspace: detectedWorkspace,
    createdAt: detectedCreatedAt,
  };
}

export async function listClaudeCliSessionsFromProjectsDir(
  projectsDir: string,
  limit = DEFAULT_LIMIT
): Promise<CliSessionSummary[]> {
  let projectEntries: string[] = [];

  try {
    projectEntries = await readdir(projectsDir);
  } catch {
    return [];
  }

  const sessionFiles: Array<{ filePath: string; updatedAt: number; createdAt: number }> = [];

  for (const projectEntry of projectEntries) {
    const projectPath = path.join(projectsDir, projectEntry);
    let files: string[] = [];

    try {
      files = await readdir(projectPath);
    } catch {
      continue;
    }

    for (const fileName of files) {
      if (!fileName.endsWith('.jsonl')) {
        continue;
      }

      const filePath = path.join(projectPath, fileName);

      try {
        const fileStat = await stat(filePath);
        sessionFiles.push({
          filePath,
          updatedAt: fileStat.mtimeMs,
          createdAt: fileStat.birthtimeMs || fileStat.ctimeMs || fileStat.mtimeMs,
        });
      } catch {
        continue;
      }
    }
  }

  const candidateFiles = sessionFiles
    .toSorted((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, Math.max(limit * MAX_CLAUDE_SCAN_MULTIPLIER, limit));

  const seeds = await Promise.all(
    candidateFiles.map(async ({ filePath, updatedAt, createdAt }): Promise<ClaudeSessionSeed | null> => {
      const sessionId = path.basename(filePath, '.jsonl');
      const head = await readClaudeSessionHead(filePath);
      const title = normalizeTitle(head.firstUserMessage, 'Claude Code Session');
      const preview = normalizePreview(head.firstUserMessage, title);

      return {
        sessionId,
        backend: 'claude',
        title,
        preview,
        workspace: head.workspace,
        sourcePath: filePath,
        createdAt: head.createdAt || createdAt,
        updatedAt,
      };
    })
  );

  const validSeeds = seeds.filter((seed): seed is ClaudeSessionSeed => seed !== null);
  const workspaceFlags = await Promise.all(validSeeds.map((seed) => pathExists(seed.workspace)));

  return validSeeds
    .map((seed, index) => ({
      ...seed,
      workspaceExists: workspaceFlags[index],
    }))
    .slice(0, limit);
}

function openCodexStateDb(databasePath: string): Database.Database {
  return new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true });
}

export async function getLatestCodexStateDbPath(codexRoot: string): Promise<string | null> {
  let entries: string[] = [];

  try {
    entries = await readdir(codexRoot);
  } catch {
    return null;
  }

  const matches = await Promise.all(
    entries
      .filter((entry) => /^state_\d+\.sqlite$/.test(entry))
      .map(async (entry) => {
        const filePath = path.join(codexRoot, entry);
        const fileStat = await stat(filePath);
        return { filePath, updatedAt: fileStat.mtimeMs };
      })
  );

  if (matches.length === 0) {
    return null;
  }

  matches.sort((left, right) => right.updatedAt - left.updatedAt);
  return matches[0]?.filePath ?? null;
}

export async function listCodexCliSessionsFromStateDb(
  databasePath: string,
  limit = DEFAULT_LIMIT
): Promise<CliSessionSummary[]> {
  let db: Database.Database | null = null;

  try {
    db = openCodexStateDb(databasePath);
    const rows = db
      .prepare(
        `SELECT id, cwd, title, first_user_message, created_at, updated_at, rollout_path
         FROM threads
         WHERE archived = 0 AND has_user_event = 1
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(limit) as CodexThreadRow[];

    const workspaceFlags = await Promise.all(rows.map((row) => pathExists(row.cwd)));

    return rows.map((row, index) => {
      const fallbackTitle = 'Codex Session';
      const preview = normalizePreview(row.first_user_message || undefined, row.title || fallbackTitle);

      return {
        sessionId: row.id,
        backend: 'codex' as CliSessionBackend,
        title: normalizeTitle(row.title || row.first_user_message || undefined, fallbackTitle),
        preview,
        workspace: row.cwd,
        workspaceExists: workspaceFlags[index] ?? false,
        sourcePath: row.rollout_path,
        createdAt: row.created_at * 1000,
        updatedAt: row.updated_at * 1000,
      };
    });
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export class CliSessionService {
  private readonly claudeProjectsDir: string;
  private readonly codexRoot: string;

  constructor(options?: { claudeProjectsDir?: string; codexRoot?: string }) {
    const homeDirectory = homedir();
    this.claudeProjectsDir = options?.claudeProjectsDir ?? path.join(homeDirectory, '.claude', 'projects');
    this.codexRoot = options?.codexRoot ?? path.join(homeDirectory, '.codex');
  }

  async listRecentSessions(limit = DEFAULT_LIMIT): Promise<CliSessionSummary[]> {
    const [claudeSessions, codexSessions] = await Promise.all([
      listClaudeCliSessionsFromProjectsDir(this.claudeProjectsDir, limit),
      this.listCodexSessions(limit),
    ]);

    return [...claudeSessions, ...codexSessions]
      .toSorted((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, limit);
  }

  async findSession(backend: CliSessionBackend, sessionId: string): Promise<CliSessionSummary | null> {
    const sessions =
      backend === 'claude'
        ? await listClaudeCliSessionsFromProjectsDir(this.claudeProjectsDir, 200)
        : await this.listCodexSessions(200);

    return sessions.find((session) => session.sessionId === sessionId) ?? null;
  }

  private async listCodexSessions(limit: number): Promise<CliSessionSummary[]> {
    const databasePath = await getLatestCodexStateDbPath(this.codexRoot);
    if (!databasePath) {
      return [];
    }

    return listCodexCliSessionsFromStateDb(databasePath, limit);
  }
}
