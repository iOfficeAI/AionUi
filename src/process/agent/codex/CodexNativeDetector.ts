/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'child_process';
import type { CodexDetectedAgent } from '@/common/types/detectedAgent';

export class CodexNativeDetector {
  isAvailable(cliPath = 'codex'): boolean {
    try {
      execFileSync(cliPath, ['app-server', '--help'], { stdio: 'ignore', timeout: 3000 });
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
