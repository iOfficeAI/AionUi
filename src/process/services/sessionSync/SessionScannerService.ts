/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { DiscoveredSession } from './types';

/**
 * Extract session ID and last modified time from a Claude Code JSONL session file.
 */
async function parseClaudeSessionFile(filePath: string): Promise<{ sessionId: string; lastModified: number } | null> {
  let fileHandle;
  try {
    fileHandle = await fs.open(filePath, 'r');
    const stat = await fileHandle.stat();

    const chunkSize = 4096;
    const decoder = new TextDecoder('utf-8');
    let accumulated = '';
    let offset = 0;

    // Read in chunks until we find a newline or reach EOF
    while (true) {
      const buffer = Buffer.alloc(chunkSize);
      // Chunked reads must stay sequential because each read depends on the previous offset.
      // oxlint-disable-next-line no-await-in-loop
      const { bytesRead } = await fileHandle.read(buffer, 0, chunkSize, offset);
      if (bytesRead === 0) break;

      // Use TextDecoder stream mode to safely handle multi-byte chars split across chunks
      accumulated += decoder.decode(buffer.subarray(0, bytesRead), { stream: true });

      const newlineIdx = accumulated.indexOf('\n');
      if (newlineIdx !== -1) {
        // Found newline — use everything before it
        accumulated = accumulated.slice(0, newlineIdx);
        break;
      }

      // Memory safety guard: bail if first line exceeds 64KB
      if (accumulated.length > 64 * 1024) return null;

      if (bytesRead < chunkSize) {
        // Reached EOF without newline — flush decoder and use entire content
        accumulated += decoder.decode();
        break;
      }

      offset += bytesRead;
    }

    if (!accumulated) return null;
    const parsed = JSON.parse(accumulated);
    if (parsed && typeof parsed === 'object' && typeof parsed.sessionId === 'string') {
      return { sessionId: parsed.sessionId, lastModified: stat.mtimeMs };
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fileHandle) await fileHandle.close();
  }
}

/**
 * Scans local directories of desktop CLI tools (Claude Code, Codex, etc.)
 */
export class SessionScannerService {
  async scanAll(): Promise<{ sessions: DiscoveredSession[]; errors: string[] }> {
    const allSessions: DiscoveredSession[] = [];
    const errors: string[] = [];

    const scanners = [
      { name: 'Claude Code', fn: () => this.scanClaude() },
      { name: 'Codex', fn: () => this.scanCodex() },
    ];

    for (const scanner of scanners) {
      try {
        // Keep scanner execution isolated so one backend failure does not block the other.
        // oxlint-disable-next-line no-await-in-loop
        const sessions = await scanner.fn();
        allSessions.push(...sessions);
      } catch (err) {
        errors.push(`${scanner.name} scan failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { sessions: allSessions, errors };
  }

  async scanClaude(): Promise<DiscoveredSession[]> {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    try {
      await fs.access(projectsDir);
    } catch {
      return [];
    }

    const sessions: DiscoveredSession[] = [];
    const projectDirs = await fs.readdir(projectsDir, { withFileTypes: true });

    // Process project directories in batches of 8 to limit concurrency
    const batchSize = 8;
    for (let i = 0; i < projectDirs.length; i += batchSize) {
      const batch = projectDirs.slice(i, i + batchSize);
      // Await each batch before moving to the next one to cap parallel filesystem work.
      // oxlint-disable-next-line no-await-in-loop
      await Promise.all(
        batch.map(async (projectDir) => {
          if (!projectDir.isDirectory()) return;

          const workspace = projectDir.name;
          const projectPath = path.join(projectsDir, projectDir.name);

          try {
            const files = await fs.readdir(projectPath, { withFileTypes: true });
            for (const file of files) {
              if (!file.isFile() || !file.name.endsWith('.jsonl')) continue;

              const filePath = path.join(projectPath, file.name);
              // Each file is parsed independently, but within one directory we keep the loop simple and bounded.
              // oxlint-disable-next-line no-await-in-loop
              const parsed = await parseClaudeSessionFile(filePath);
              if (!parsed) continue;

              // Workspace directories usually follow the pattern: `path-to-workspace-ID`.
              // Claude Code uses URL-encoded path slugs (e.g., -Users-foo-my-app).
              // We replace '-' with '/' to simulate the path, decode components, and take the basename.
              const workspaceName = path.basename(decodeURIComponent(workspace.replace(/-/g, '/')));

              sessions.push({
                agentType: 'claude',
                sessionId: parsed.sessionId,
                workspace,
                name: `Claude Code - ${workspaceName}`,
                lastModified: parsed.lastModified,
                sourcePath: filePath,
              });
            }
          } catch {
            // Skip unreadable project directories
          }
        })
      );
    }

    return sessions;
  }

  /**
   * Scan Codex sessions from ~/.codex/sessions/.
   * Covers all Codex origins: CLI, Desktop app, VS Code extension.
   * Session metadata is in the first line of each rollout JSONL file.
   */
  async scanCodex(): Promise<DiscoveredSession[]> {
    const codexDir = path.join(os.homedir(), '.codex');
    const sessionsDir = path.join(codexDir, 'sessions');
    try {
      await fs.access(sessionsDir);
    } catch {
      return [];
    }

    // Build a name lookup from session_index.jsonl (best-effort)
    const nameMap = await this.loadCodexSessionIndex(codexDir);

    const sessions: DiscoveredSession[] = [];
    const rolloutFiles = await this.findCodexRolloutFiles(sessionsDir);

    const batchSize = 8;
    for (let i = 0; i < rolloutFiles.length; i += batchSize) {
      const batch = rolloutFiles.slice(i, i + batchSize);
      // Await batch completion before scheduling the next group to avoid unbounded parallel scans.
      // oxlint-disable-next-line no-await-in-loop
      await Promise.all(
        batch.map(async (filePath) => {
          const meta = await this.parseCodexRolloutFile(filePath);
          if (!meta) return;

          const indexName = nameMap.get(meta.sessionId);
          const displayName = indexName || `Codex - ${path.basename(meta.cwd || 'session')}`;

          sessions.push({
            agentType: 'codex',
            sessionId: meta.sessionId,
            workspace: meta.cwd || '',
            name: displayName,
            lastModified: meta.lastModified,
            sourcePath: filePath,
            originator: meta.originator,
          });
        })
      );
    }

    return sessions;
  }

  /**
   * Load session_index.jsonl to get human-readable thread names for Codex sessions.
   */
  private async loadCodexSessionIndex(codexDir: string): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>();
    const indexPath = path.join(codexDir, 'session_index.jsonl');
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as { id?: string; thread_name?: string };
          if (entry.id && entry.thread_name) {
            nameMap.set(entry.id, entry.thread_name);
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Index file may not exist
    }
    return nameMap;
  }

  /**
   * Recursively find all rollout JSONL files under ~/.codex/sessions/.
   * Directory structure: sessions/YYYY/MM/DD/rollout-*.jsonl
   */
  private async findCodexRolloutFiles(sessionsDir: string): Promise<string[]> {
    const files: string[] = [];

    const walk = async (dir: string, depth: number): Promise<void> => {
      // sessions/YYYY/MM/DD = 3 levels deep, files at level 3
      if (depth > 4) return;
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            // Recursive traversal is intentionally depth-first to keep directory walking bounded.
            // oxlint-disable-next-line no-await-in-loop
            await walk(fullPath, depth + 1);
          } else if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
            files.push(fullPath);
          }
        }
      } catch {
        // Skip unreadable directories
      }
    };

    await walk(sessionsDir, 0);

    // Also scan archived_sessions/ (flat directory)
    const archivedDir = path.join(path.dirname(sessionsDir), 'archived_sessions');
    try {
      const entries = await fs.readdir(archivedDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
          files.push(path.join(archivedDir, entry.name));
        }
      }
    } catch {
      // archived_sessions may not exist
    }

    return files;
  }

  /**
   * Parse the first line of a Codex rollout JSONL file to extract session metadata.
   * First line can be ~15KB+ (contains full system prompt in base_instructions),
   * so we read in chunks like parseClaudeSessionFile.
   */
  private async parseCodexRolloutFile(
    filePath: string
  ): Promise<{ sessionId: string; cwd: string; originator: string; lastModified: number } | null> {
    let fileHandle;
    try {
      fileHandle = await fs.open(filePath, 'r');
      const stat = await fileHandle.stat();

      const chunkSize = 8192;
      const decoder = new TextDecoder('utf-8');
      let accumulated = '';
      let offset = 0;

      while (true) {
        const buffer = Buffer.alloc(chunkSize);
        // Chunked reads must stay sequential because each read depends on the previous offset.
        // oxlint-disable-next-line no-await-in-loop
        const { bytesRead } = await fileHandle.read(buffer, 0, chunkSize, offset);
        if (bytesRead === 0) break;

        accumulated += decoder.decode(buffer.subarray(0, bytesRead), { stream: true });

        const newlineIdx = accumulated.indexOf('\n');
        if (newlineIdx !== -1) {
          accumulated = accumulated.slice(0, newlineIdx);
          break;
        }

        // Codex first lines can be ~15KB; cap at 128KB for safety
        if (accumulated.length > 128 * 1024) return null;

        if (bytesRead < chunkSize) {
          accumulated += decoder.decode();
          break;
        }

        offset += bytesRead;
      }

      if (!accumulated) return null;

      const parsed = JSON.parse(accumulated);
      if (!parsed || typeof parsed !== 'object') return null;

      // Codex rollout first line: { type: "session_meta", payload: { id, cwd, originator } }
      const payload = parsed.type === 'session_meta' ? parsed.payload : parsed;
      if (!payload || typeof payload !== 'object') return null;

      const sessionId = payload.id as string | undefined;
      if (!sessionId) return null;

      return {
        sessionId,
        cwd: (payload.cwd as string) || '',
        originator: (payload.originator as string) || 'unknown',
        lastModified: stat.mtimeMs,
      };
    } catch {
      return null;
    } finally {
      if (fileHandle) await fileHandle.close();
    }
  }
}
