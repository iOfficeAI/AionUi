/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChildProcess } from 'child_process';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { promises as fsAsync } from 'fs';
import * as os from 'os';
import * as path from 'path';

const execFile = promisify(execFileCb);

// ── Process utilities ───────────────────────────────────────────────

/** Check whether a process with the given PID is still running. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Poll until a process exits or the timeout expires. */
export async function waitForProcessExit(pid: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Kill a child process with platform-specific handling.
 * Windows: taskkill tree kill. POSIX detached: process group kill. Otherwise: SIGTERM.
 */
export async function killChild(child: ChildProcess, isDetached: boolean): Promise<void> {
  const pid = child.pid;
  if (process.platform === 'win32' && pid) {
    try {
      await execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
    } catch (forceError) {
      console.warn(`[ACP] taskkill /T /F failed for PID ${pid}:`, forceError);
    }
  } else if (isDetached && pid) {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  } else {
    child.kill('SIGTERM');
  }

  if (pid) {
    await waitForProcessExit(pid, 3000);
  }
}

// ── File I/O utilities ──────────────────────────────────────────────

/** Read a text file from the filesystem. */
export async function readTextFile(filePath: string): Promise<{ content: string }> {
  try {
    const content = await fsAsync.readFile(filePath, 'utf-8');
    return { content };
  } catch (error) {
    throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** Write a text file and emit a file-stream update to the preview panel. */
export async function writeTextFile(filePath: string, content: string): Promise<null> {
  try {
    await fsAsync.mkdir(path.dirname(filePath), { recursive: true });
    await fsAsync.writeFile(filePath, content, 'utf-8');

    // Send streaming content update to preview panel (for real-time updates)
    try {
      const { ipcBridge } = await import('@/common');
      const pathSegments = filePath.split(path.sep);
      const fileName = pathSegments[pathSegments.length - 1];
      const workspace = pathSegments.slice(0, -1).join(path.sep);

      ipcBridge.fileStream.contentUpdate.emit({
        filePath,
        content,
        workspace,
        relativePath: fileName,
        operation: 'write' as const,
      });
    } catch (emitError) {
      console.error('[ACP] Failed to emit file stream update:', emitError);
    }

    return null;
  } catch (error) {
    throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

// ── JSON-RPC I/O ────────────────────────────────────────────────────

/** Write a JSON-RPC message to a child process stdin. */
export function writeJsonRpcMessage(child: ChildProcess, message: object): void {
  if (child.stdin) {
    const lineEnding = process.platform === 'win32' ? '\r\n' : '\n';
    child.stdin.write(JSON.stringify(message) + lineEnding);
  }
}

// ── Agent settings ──────────────────────────────────────────────────

export interface ClaudeSettings {
  env?: {
    ANTHROPIC_MODEL?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Get Claude settings file path (cross-platform)
 * - macOS/Linux: ~/.claude/settings.json
 * - Windows: %USERPROFILE%\.claude\settings.json
 */
export function getClaudeSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

/**
 * Read Claude settings from settings.json
 */
export function readClaudeSettings(): ClaudeSettings | null {
  try {
    const settingsPath = getClaudeSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return null;
    }
    const content = fs.readFileSync(settingsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Get ANTHROPIC_MODEL from Claude settings (under env object)
 */
export function getClaudeModel(): string | null {
  const settings = readClaudeSettings();
  return settings?.env?.ANTHROPIC_MODEL ?? null;
}

// --- CodeBuddy settings support ---
// Note: CodeBuddy settings (~/.codebuddy/settings.json) contains sandbox/trust config,
// NOT model preferences. Model selection is handled by the CLI itself.
// MCP servers are configured in ~/.codebuddy/mcp.json
