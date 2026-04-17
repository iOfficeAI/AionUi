/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { getEnhancedEnv } from '@process/utils/shellEnv';

function getBinaryName(): string {
  return process.platform === 'win32' ? 'aionrs.exe' : 'aionrs';
}

/**
 * Resolve the aionrs binary path.
 * Search order:
 *  1. Bundled with app (production)
 *  2. System PATH
 */
export function resolveAionrsBinary(): string | null {
  // 1. Bundled binary (production) — same layout as bundled-bun
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const runtimeKey = `${process.platform}-${process.arch}`;
    const bundled = join(resourcesPath, 'bundled-aionrs', runtimeKey, getBinaryName());
    if (existsSync(bundled)) return bundled;
  }

  // 2. System PATH
  try {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'where.exe' : 'which';
    const args = ['aionrs'];
    const env = getEnhancedEnv();
    const result = execFileSync(command, args, {
      encoding: 'utf-8',
      env,
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      ...(isWindows ? { windowsHide: true } : {}),
    })
      .trim()
      .split(/\r?\n/)[0];
    if (result && existsSync(result)) return result;
  } catch {
    // not found in PATH
  }

  return null;
}

export function isAionrsAvailable(): boolean {
  return resolveAionrsBinary() !== null;
}

/**
 * Detect aionrs availability and version for settings UI.
 */
export function detectAionrs(): {
  available: boolean;
  version?: string;
  path?: string;
} {
  const binaryPath = resolveAionrsBinary();
  if (!binaryPath) return { available: false };

  try {
    const version = execFileSync(binaryPath, ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      ...(process.platform === 'win32' ? { windowsHide: true } : {}),
    }).trim();
    return { available: true, version, path: binaryPath };
  } catch {
    return { available: true, path: binaryPath };
  }
}
