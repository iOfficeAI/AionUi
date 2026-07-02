/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
}));

vi.mock('electron-log/main', () => ({
  default: {
    functions: {},
    hooks: [],
    initialize: vi.fn(),
    transports: {
      console: { level: undefined },
      file: {
        fileName: undefined,
        level: undefined,
        maxSize: undefined,
        resolvePathFn: undefined,
      },
    },
  },
}));

import { buildDatedLogFileName } from '@/process/utils/configureConsoleLog';

describe('configureConsoleLog', () => {
  it('uses year/month/day directories for frontend log files', () => {
    const date = new Date(Date.UTC(2026, 6, 2, 12));

    expect(buildDatedLogFileName(date)).toBe('2026/07/02/2026-07-02.log');
  });
});
