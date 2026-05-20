/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';

export const FALLBACK_DEV_URL = 'http://localhost:3000/';

const SCRIPT_KEYS = ['dev', 'start', 'serve', 'preview'];

/**
 * Parse a port number from a typical package.json script command.
 * Looks for, in order: `--port N`, `-p N`, `PORT=N` (env-style prefix).
 * Returns null when no port is found or the value is out of range.
 */
export function parseDevPort(script: string): number | null {
  if (!script || typeof script !== 'string') return null;

  const patterns: RegExp[] = [/--port[=\s]+(\d{2,5})/, /\s-p[=\s]+(\d{2,5})/, /(?:^|\s)PORT=(\d{2,5})/];

  for (const re of patterns) {
    const m = script.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 65535) return n;
    }
  }
  return null;
}

/**
 * Inspect package.json scripts (dev/start/serve/preview, in that order) for a port.
 * Returns null when no scripts contain a recognizable port.
 */
export function pickDevPortFromPackageJson(rawJson: string): number | null {
  let pkg: unknown;
  try {
    pkg = JSON.parse(rawJson);
  } catch {
    return null;
  }
  if (!pkg || typeof pkg !== 'object') return null;
  const scripts = (pkg as { scripts?: Record<string, string> }).scripts;
  if (!scripts || typeof scripts !== 'object') return null;

  for (const key of SCRIPT_KEYS) {
    const cmd = scripts[key];
    if (typeof cmd !== 'string') continue;
    const port = parseDevPort(cmd);
    if (port !== null) return port;
  }
  return null;
}

/**
 * Best-effort discovery of a workspace's dev server URL.
 * Reads `${workspacePath}/package.json` via the fs bridge, then parses a port.
 * Always resolves — falls back to FALLBACK_DEV_URL when nothing usable is found.
 */
export async function fetchProjectDevUrl(workspacePath: string | undefined): Promise<string> {
  if (!workspacePath) return FALLBACK_DEV_URL;
  const sep = workspacePath.endsWith('/') || workspacePath.endsWith('\\') ? '' : '/';
  const pkgPath = `${workspacePath}${sep}package.json`;
  try {
    const content = await ipcBridge.fs.readFile.invoke({ path: pkgPath });
    if (!content) return FALLBACK_DEV_URL;
    const port = pickDevPortFromPackageJson(content);
    if (port) return `http://localhost:${port}/`;
  } catch {
    // Ignore — fall back below.
  }
  return FALLBACK_DEV_URL;
}
