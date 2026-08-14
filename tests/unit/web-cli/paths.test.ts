/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDataDir, resolveLogDir, resolveWorkDir } from '../../../packages/web-cli/src/paths.js';

describe('Web CLI path resolution', () => {
  it('keeps data, logs, and workspaces separate when configured', () => {
    const flags = new Map<string, string | true>();
    const env = {
      AIONUI_DATA_DIR: '/srv/aionui/data',
      AIONUI_LOG_DIR: '/srv/aionui/logs',
      AIONUI_WORK_DIR: '/srv/aionui/workspace',
    };
    const dataDir = resolveDataDir(flags, env);

    expect(dataDir).toBe(path.resolve('/srv/aionui/data'));
    expect(resolveLogDir(flags, dataDir, env)).toBe(path.resolve('/srv/aionui/logs'));
    expect(resolveWorkDir(flags, dataDir, env)).toBe(path.resolve('/srv/aionui/workspace'));
  });

  it('prefers CLI flags and otherwise keeps backward-compatible defaults', () => {
    const flags = new Map<string, string | true>([
      ['data-dir', '/cli/data'],
      ['log-dir', '/cli/logs'],
      ['work-dir', '/cli/workspace'],
    ]);
    const dataDir = resolveDataDir(flags, {});

    expect(dataDir).toBe(path.resolve('/cli/data'));
    expect(resolveLogDir(flags, dataDir, {})).toBe(path.resolve('/cli/logs'));
    expect(resolveWorkDir(flags, dataDir, {})).toBe(path.resolve('/cli/workspace'));
    expect(resolveWorkDir(new Map(), dataDir, {})).toBe(dataDir);
  });
});
