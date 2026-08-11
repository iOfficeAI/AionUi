/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'child_process';
import { accessSync, constants } from 'fs';
import type { CodexDetectedAgent } from '@/common/types/detectedAgent';

export class CodexNativeDetector {
  isAvailable(cliPath = 'codex'): boolean {
    const command = cliPath.trim();
    if (!command) return false;

    try {
      if (isPathLikeCommand(command)) {
        accessSync(command, constants.X_OK);
      } else if (process.platform === 'win32') {
        execFileSync('where', [command], { stdio: 'ignore', timeout: 1500 });
      } else {
        const shell = process.env.SHELL?.trim() || '/bin/bash';
        execFileSync(shell, ['-lc', `command -v -- ${shellQuote(command)}`], {
          stdio: 'ignore',
          timeout: 1500,
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  detect(cliPath = 'codex'): CodexDetectedAgent[] {
    if (!this.isAvailable(cliPath)) {
      return [];
    }

    return [
      {
        id: 'codex',
        name: 'Codex',
        kind: 'codex',
        available: true,
        backend: 'codex',
        cliPath,
        appServer: true,
      },
    ];
  }
}

export const codexNativeDetector = new CodexNativeDetector();

function isPathLikeCommand(command: string): boolean {
  return command.includes('/') || command.includes('\\');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
