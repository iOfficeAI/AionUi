/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configure Windows console to use UTF-8 encoding (code page 65001).
 * This prevents garbled output for CJK characters and emoji in console logs.
 *
 * Must be imported as early as possible in the main process entry point.
 */
if (process.platform === 'win32') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { execSync } = require('child_process');
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch {
    // Silently ignore — non-critical
  }
}
