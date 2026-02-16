/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session log discovery — maps AionUi conversation data to Claude Code JSONL session files.
 *
 * Claude Code stores session logs at:
 *   ~/.claude/projects/<encoded-path>/<session-id>.jsonl
 *
 * The encoded path replaces '/' with '-' (e.g., /Users/foo/project → -Users-foo-project).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Allow tests to override the base path
let _claudeBasePathOverride: string | null = null;

/** @internal Test-only override for the Claude base path. */
export function _setClaudeBasePathForTest(basePath: string | null): void {
  _claudeBasePathOverride = basePath;
}

/**
 * Get the base Claude directory path.
 */
export function getClaudeBasePath(): string {
  if (_claudeBasePathOverride) return _claudeBasePathOverride;
  return path.join(os.homedir(), '.claude');
}

/**
 * Encode an absolute path into Claude's directory name format.
 * Example: /Users/foo/project → -Users-foo-project
 */
export function encodePath(absolutePath: string): string {
  // Normalize and replace path separators with dashes
  const normalized = path.resolve(absolutePath);
  return normalized.replace(/\//g, '-').replace(/\\/g, '-');
}

/**
 * Find the JSONL session file for a given session ID and workspace.
 * Returns the file path if found, or null if not.
 */
export function findSessionFile(sessionId: string, workspace?: string): string | null {
  const claudeBase = getClaudeBasePath();
  const projectsDir = path.join(claudeBase, 'projects');

  if (!fs.existsSync(projectsDir)) {
    return null;
  }

  // Strategy 1: If workspace is provided, encode it and look directly
  if (workspace) {
    const encodedWorkspace = encodePath(workspace);
    const sessionFile = path.join(projectsDir, encodedWorkspace, `${sessionId}.jsonl`);
    if (fs.existsSync(sessionFile)) {
      return sessionFile;
    }
  }

  // Strategy 2: Search across all project directories
  try {
    const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;
      const sessionFile = path.join(projectsDir, dir.name, `${sessionId}.jsonl`);
      if (fs.existsSync(sessionFile)) {
        return sessionFile;
      }
    }
  } catch {
    // Silently handle read errors
  }

  return null;
}

/**
 * List all available session files for a given workspace.
 * Returns an array of { sessionId, filePath, modifiedAt }.
 */
export function listSessionFiles(workspace?: string): Array<{ sessionId: string; filePath: string; modifiedAt: number }> {
  const claudeBase = getClaudeBasePath();
  const projectsDir = path.join(claudeBase, 'projects');
  const results: Array<{ sessionId: string; filePath: string; modifiedAt: number }> = [];

  if (!fs.existsSync(projectsDir)) {
    return results;
  }

  const scanDirectory = (dirPath: string) => {
    try {
      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.jsonl')) {
          const filePath = path.join(dirPath, file.name);
          const sessionId = file.name.replace('.jsonl', '');
          try {
            const stat = fs.statSync(filePath);
            results.push({ sessionId, filePath, modifiedAt: stat.mtimeMs });
          } catch {
            // Skip files we can't stat
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  };

  if (workspace) {
    const encodedWorkspace = encodePath(workspace);
    const dirPath = path.join(projectsDir, encodedWorkspace);
    if (fs.existsSync(dirPath)) {
      scanDirectory(dirPath);
    }
  } else {
    // Scan all project directories
    try {
      const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true });
      for (const dir of projectDirs) {
        if (dir.isDirectory()) {
          scanDirectory(path.join(projectsDir, dir.name));
        }
      }
    } catch {
      // Silently handle errors
    }
  }

  // Sort by modification time, newest first
  results.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return results;
}

/**
 * Find subagent JSONL files for a given session.
 */
export function findSubagentFiles(sessionId: string, workspace?: string): string[] {
  const sessionFile = findSessionFile(sessionId, workspace);
  if (!sessionFile) return [];

  const sessionDir = path.dirname(sessionFile);
  const subagentPattern = /^agent-.*\.jsonl$/;
  const results: string[] = [];

  try {
    const files = fs.readdirSync(sessionDir, { withFileTypes: true });
    for (const file of files) {
      if (file.isFile() && subagentPattern.test(file.name)) {
        results.push(path.join(sessionDir, file.name));
      }
    }
  } catch {
    // Silently handle errors
  }

  return results;
}
