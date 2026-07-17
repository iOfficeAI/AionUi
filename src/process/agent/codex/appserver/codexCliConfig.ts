/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { parse } from 'smol-toml';

export function getCodexConfigPath(homeDir = os.homedir()): string {
  const codexHome = process.env.CODEX_HOME?.trim();
  return path.join(codexHome || path.join(homeDir, '.codex'), 'config.toml');
}

export function readCodexConfiguredModel(configPath = getCodexConfigPath()): string | undefined {
  try {
    if (!existsSync(configPath)) {
      return undefined;
    }

    const parsed = parse(readFileSync(configPath, 'utf8')) as { model?: unknown };
    return typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : undefined;
  } catch {
    return undefined;
  }
}
