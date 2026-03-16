/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TTY-safe command execution utilities.
 *
 * Uses `child_process.spawn` with `detached: true` so each child runs in its
 * own process group.  This prevents CLI tools that write to `/dev/tty`
 * (e.g. `gemini mcp add`, `claude mcp remove`) from triggering SIGTTOU on
 * the parent Electron process, which would otherwise cause:
 *   zsh: suspended (tty output)  npm start
 */

import type { ChildProcess } from 'child_process';
import { spawn, execFile } from 'child_process';

type ExecResult = { stdout: string; stderr: string };

/**
 * Kill a child process and its descendants.
 * On Windows, `detached` is false so negative-PID process group kill is not
 * available; use `taskkill /T /F` to terminate the entire tree instead.
 * On POSIX, kill the process group via negative PID (requires detached: true).
 */
function killChild(child: ChildProcess, isWindows: boolean): void {
  try {
    if (isWindows && child.pid) {
      execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else if (child.pid) {
      process.kill(-child.pid, 'SIGTERM');
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    /* already exited */
  }
}

interface SafeExecOptions {
  timeout?: number;
  env?: NodeJS.ProcessEnv;
}

/**
 * Shell-based command execution (replacement for `child_process.exec`).
 * Runs the command in `/bin/sh -c` (POSIX) or `cmd.exe /c` (Windows)
 * with `detached: true`.
 */
export function safeExec(command: string, options: SafeExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const shellCmd = isWindows ? process.env.COMSPEC || 'cmd.exe' : 'sh';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    const child = spawn(shellCmd, shellArgs, {
      detached: !isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: options.env,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = options.timeout
      ? setTimeout(() => {
          if (!settled) {
            settled = true;
            killChild(child, isWindows);
            reject(
              Object.assign(new Error(`Command timed out after ${options.timeout}ms`), { stdout, stderr, killed: true })
            );
          }
        }, options.timeout)
      : null;

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        if (timer) clearTimeout(timer);
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        if (timer) clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(Object.assign(new Error(`Command failed with exit code ${code}`), { stdout, stderr, code }));
        }
      }
    });

    // Don't let the detached child prevent Node from exiting (POSIX only)
    if (!isWindows) child.unref();
  });
}

/**
 * Direct executable invocation (replacement for `child_process.execFile`).
 * Does NOT use a shell — safer against injection.
 */
export function safeExecFile(file: string, args: string[], options: SafeExecOptions = {}): Promise<ExecResult> {
  const isWindows = process.platform === 'win32';

  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      detached: !isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: options.env,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = options.timeout
      ? setTimeout(() => {
          if (!settled) {
            settled = true;
            killChild(child, isWindows);
            reject(
              Object.assign(new Error(`Command timed out after ${options.timeout}ms`), { stdout, stderr, killed: true })
            );
          }
        }, options.timeout)
      : null;

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        if (timer) clearTimeout(timer);
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        if (timer) clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(Object.assign(new Error(`Command failed with exit code ${code}`), { stdout, stderr, code }));
        }
      }
    });

    if (!isWindows) child.unref();
  });
}
