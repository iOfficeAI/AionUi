/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('configureConsoleLog', () => {
  const mockLog = {
    transports: {
      file: { fileName: '', level: '' as string | boolean, maxSize: 0 },
      console: { level: '' as string | boolean },
    },
    initialize: vi.fn(),
    functions: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  };

  // Save all console methods that Object.assign(console, log.functions) may overwrite
  const savedConsole: Record<string, unknown> = {};

  beforeEach(() => {
    // Capture every key that the mock will overwrite
    for (const key of Object.keys(mockLog.functions)) {
      savedConsole[key] = (console as any)[key];
    }
    vi.resetModules();
    vi.doMock('electron-log/main', () => ({ default: mockLog }));
    // Reset mock state
    mockLog.transports.file.fileName = '';
    mockLog.transports.file.level = '';
    mockLog.transports.console.level = '';
    mockLog.transports.file.maxSize = 0;
    mockLog.initialize.mockClear();
  });

  afterEach(() => {
    vi.doUnmock('electron-log/main');
    // Restore all overridden console methods
    for (const [key, fn] of Object.entries(savedConsole)) {
      (console as any)[key] = fn;
    }
  });

  it('sets daily log file name in YYYY-MM-DD.log format', async () => {
    await import('@process/utils/configureConsoleLog');

    expect(mockLog.transports.file.fileName).toMatch(/^\d{4}-\d{2}-\d{2}\.log$/);
  });

  it('sets file transport level to info', async () => {
    await import('@process/utils/configureConsoleLog');

    expect(mockLog.transports.file.level).toBe('info');
  });

  it('sets console transport level to silly', async () => {
    await import('@process/utils/configureConsoleLog');

    expect(mockLog.transports.console.level).toBe('silly');
  });

  it('caps daily log file at 10 MB', async () => {
    await import('@process/utils/configureConsoleLog');

    expect(mockLog.transports.file.maxSize).toBe(10 * 1024 * 1024);
  });

  it('calls log.initialize()', async () => {
    await import('@process/utils/configureConsoleLog');

    expect(mockLog.initialize).toHaveBeenCalledOnce();
  });

  it('redirects main-process console to electron-log functions', async () => {
    await import('@process/utils/configureConsoleLog');

    // After import, console.log should be replaced by electron-log's function
    expect(console.log).toBe(mockLog.functions.log);
    expect(console.warn).toBe(mockLog.functions.warn);
    expect(console.error).toBe(mockLog.functions.error);
  });
});
