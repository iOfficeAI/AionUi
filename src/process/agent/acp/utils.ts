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
 * Windows: taskkill tree kill. POSIX: collect descendants → SIGTERM → SIGKILL escalation.
 */
export async function killChild(child: ChildProcess, isDetached: boolean): Promise<void> {
  const pid = child.pid;
  if (process.platform === 'win32' && pid) {
    try {
      await execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
    } catch (forceError) {
      console.warn(`[ACP] taskkill /T /F failed for PID ${pid}:`, decodeWindowsError(forceError));
    }
    return;
  }

  // POSIX: collect all descendant PIDs BEFORE killing the parent,
  // because once the parent dies, orphans get reparented to PID 1
  // and we can no longer discover them via ppid.
  const descendantPids = pid ? await collectDescendantPids(pid) : [];

  if (isDetached && pid) {
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

    // Escalate to SIGKILL if the process ignored SIGTERM
    if (isProcessAlive(pid)) {
      console.warn(`[ACP] Process ${pid} did not exit after SIGTERM, escalating to SIGKILL`);
      try {
        if (isDetached) {
          process.kill(-pid, 'SIGKILL');
        } else {
          process.kill(pid, 'SIGKILL');
        }
      } catch {
        // Process may have exited between the check and the kill
      }
      await waitForProcessExit(pid, 2000);
    }
  }

  // Force-kill any descendants that survived (escaped the process group)
  for (const dpid of descendantPids) {
    try {
      if (isProcessAlive(dpid)) {
        process.kill(dpid, 'SIGKILL');
      }
    } catch {
      // Already exited
    }
  }
}

/**
 * Recursively collect all descendant PIDs of a process.
 * Uses `ps -o pid= --ppid` on Linux and `ps -o pid= -p` + manual ppid matching on macOS,
 * falling back to a single `ps` snapshot that works on both.
 */
async function collectDescendantPids(rootPid: number): Promise<number[]> {
  try {
    // `ps -eo pid=,ppid=` works on both macOS and Linux — parse the full process table
    const { stdout } = await execFile('ps', ['-eo', 'pid=,ppid='], { timeout: 3000 });
    const childMap = new Map<number, number[]>();
    for (const line of stdout.trim().split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const pid = parseInt(parts[0], 10);
      const ppid = parseInt(parts[1], 10);
      if (isNaN(pid) || isNaN(ppid)) continue;
      if (!childMap.has(ppid)) childMap.set(ppid, []);
      childMap.get(ppid)!.push(pid);
    }

    // BFS to collect all descendants
    const result: number[] = [];
    const queue = [rootPid];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = childMap.get(current) || [];
      for (const child of children) {
        result.push(child);
        queue.push(child);
      }
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * Decode a Windows command error for readable logging.
 * Windows commands like `taskkill` output in the system's native encoding (e.g. GBK for Chinese),
 * which gets garbled when Node.js interprets it as UTF-8. This re-decodes stderr as GBK if available.
 */
export function decodeWindowsError(error: unknown): string {
  const err = error as { stderr?: string | Buffer; code?: number; message?: string };
  if (err?.stderr) {
    const stderr = err.stderr;
    if (Buffer.isBuffer(stderr)) {
      try {
        return new TextDecoder('gbk').decode(stderr);
      } catch {
        return stderr.toString('utf-8');
      }
    }
    // stderr is a string — check if it looks garbled (contains replacement chars)
    if (typeof stderr === 'string' && stderr.includes('\ufffd')) {
      // Already garbled, fall back to exit code
      return `exit code ${err.code ?? 'unknown'}`;
    }
    return stderr;
  }
  return err?.message ?? String(error);
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
    throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
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
