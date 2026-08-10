/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';

/** Resolve the persistent application data directory. */
export function resolveDataDir(flags: Map<string, string | true>, env = process.env): string {
  const override = flags.get('data-dir');
  if (typeof override === 'string') return path.resolve(override);
  if (env.AIONUI_DATA_DIR) return path.resolve(env.AIONUI_DATA_DIR);
  return path.join(os.homedir(), '.aionui-web');
}

/** Resolve the application log directory relative to the selected data directory. */
export function resolveLogDir(flags: Map<string, string | true>, dataDir: string, env = process.env): string {
  const override = flags.get('log-dir');
  if (typeof override === 'string') return path.resolve(override);
  if (env.AIONUI_LOG_DIR) return path.resolve(env.AIONUI_LOG_DIR);
  return path.join(dataDir, 'logs');
}

/** Resolve the default workspace root independently from internal application data. */
export function resolveWorkDir(flags: Map<string, string | true>, dataDir: string, env = process.env): string {
  const override = flags.get('work-dir');
  if (typeof override === 'string') return path.resolve(override);
  if (env.AIONUI_WORK_DIR) return path.resolve(env.AIONUI_WORK_DIR);
  return dataDir;
}
