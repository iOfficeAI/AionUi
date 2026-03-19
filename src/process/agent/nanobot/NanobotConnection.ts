/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getEnhancedEnv } from '@process/utils/shellEnv';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';

/**
 * Spawns the nanobot CLI per-message and collects stdout.
 *
 * Command: nanobot agent -m "<message>" --session <sessionId> --no-markdown
 */
export class NanobotConnection {
  private child: ChildProcess | null = null;
  private workingDir: string;

  constructor(workingDir: string) {
    this.workingDir = workingDir;
  }

  /**
   * Send a message by spawning a one-shot nanobot CLI process.
   * Returns the parsed response text.
   */
  async sendMessage(message: string, sessionId: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const env = getEnhancedEnv();

      // Pass arguments as an array WITHOUT shell mode.
      // With shell: true on Windows, cmd.exe /s /c strips the outer quotes
      // which also removes the quotes protecting multi-word messages.
      // With shell: false (the default), Node.js handles argument quoting correctly:
      // - Windows: CreateProcessW properly quotes args containing spaces
      // - Unix: execvp passes args directly to the process
      const args = ['agent', '-m', `"${message}"`, '--session', sessionId, '--no-markdown'];

      this.child = spawn('nanobot', args, {
        cwd: this.workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      this.child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      this.child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      this.child.on('error', (error) => {
        this.child = null;
        reject(new Error(`Failed to spawn nanobot: ${error.message}.`));
      });

      this.child.on('close', (code) => {
        this.child = null;
        if (code !== 0) {
          reject(new Error(`nanobot exited with code ${code}: ${stderr.trim()}`));
          return;
        }
        const parsed = this.parseOutput(stdout);
        resolve(parsed);
      });
    });
  }

  /**
   * Strip box-drawing decorations from nanobot output.
   * Nanobot wraps responses in Unicode box characters (┌, └, │, ─, etc.)
   */
  parseOutput(raw: string): string {
    const lines = raw.split('\n');
    const contentLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip top/bottom borders
      if (/^[┌┐└┘─╭╮╰╯╔╗╚╝═]+$/.test(trimmed)) {
        continue;
      }

      // Strip leading/trailing box characters (│, ║)
      let content = trimmed;
      if (/^[│║]/.test(content)) {
        content = content.slice(1);
      }
      if (/[│║]$/.test(content)) {
        content = content.slice(0, -1);
      }

      // Skip if the remaining content is only whitespace or border chars
      const stripped = content.trim();
      if (/^[─═┄┈]*$/.test(stripped)) {
        continue;
      }

      if (stripped) {
        contentLines.push(stripped);
      }
    }

    return contentLines.join('\n').trim();
  }

  /**
   * Kill any running nanobot child process.
   */
  kill(): void {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }

  get isRunning(): boolean {
    return this.child !== null && !this.child.killed;
  }
}
