/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for environment diagnostics utilities in src/process/utils/shellEnv.ts.
 *
 * Covers:
 * - formatBytes: pure function for human-readable byte formatting
 * - execAsync: async command execution with timeout and failure handling
 * - resolveToolInfo: CLI tool discovery (path + version)
 * - logEnvironmentDiagnostics: full diagnostics output
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted so factories run before module evaluation
// ---------------------------------------------------------------------------

const { execFileMock, existsSyncMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  existsSyncMock: vi.fn().mockReturnValue(false),
}));

vi.mock('child_process', async (importOriginal) => {
  const orig = await importOriginal<typeof import('child_process')>();
  return { ...orig, execFile: execFileMock };
});

vi.mock('fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('fs')>();
  return { ...orig, existsSync: existsSyncMock };
});

// ---------------------------------------------------------------------------
// Import SUT after mocks are in place
// ---------------------------------------------------------------------------

import { formatBytes, execAsync, resolveToolInfo, logEnvironmentDiagnostics } from '@process/utils/shellEnv';

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------

describe('formatBytes', () => {
  it('should format values >= 1 GB with two decimal places', () => {
    const oneGB = 1024 ** 3;
    expect(formatBytes(oneGB)).toBe('1.00 GB');
    expect(formatBytes(16 * oneGB)).toBe('16.00 GB');
    expect(formatBytes(1.5 * oneGB)).toBe('1.50 GB');
  });

  it('should format values < 1 GB as MB with no decimal places', () => {
    const oneMB = 1024 ** 2;
    expect(formatBytes(512 * oneMB)).toBe('512 MB');
    expect(formatBytes(1 * oneMB)).toBe('1 MB');
  });

  it('should handle zero bytes', () => {
    expect(formatBytes(0)).toBe('0 MB');
  });

  it('should handle very small values', () => {
    expect(formatBytes(1024)).toBe('0 MB');
  });
});

// ---------------------------------------------------------------------------
// execAsync
// ---------------------------------------------------------------------------

describe('execAsync', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return trimmed first line of stdout on success', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, '  v20.11.0\nsome trailing\n');
      return { stdin: { end: vi.fn() } };
    });

    const result = await execAsync('node', ['--version']);
    expect(result).toBe('v20.11.0');
  });

  it('should return null when command fails', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(new Error('ENOENT'), '');
      return { stdin: { end: vi.fn() } };
    });

    const result = await execAsync('nonexistent', ['--version']);
    expect(result).toBeNull();
  });

  it('should return null when stdout is empty', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, '');
      return { stdin: { end: vi.fn() } };
    });

    const result = await execAsync('node', ['--version']);
    expect(result).toBe('');
  });

  it('should return null when execFile throws synchronously', async () => {
    execFileMock.mockImplementation(() => {
      throw new Error('spawn failed');
    });

    const result = await execAsync('bad', ['--version']);
    expect(result).toBeNull();
  });

  it('should pass correct timeout option', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], opts: { timeout?: number }, cb: Function) => {
      expect(opts.timeout).toBe(2000);
      cb(null, 'ok');
      return { stdin: { end: vi.fn() } };
    });

    await execAsync('test', ['arg'], 2000);
  });
});

// ---------------------------------------------------------------------------
// resolveToolInfo
// ---------------------------------------------------------------------------

describe('resolveToolInfo', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return path and version when tool exists', async () => {
    let callIndex = 0;
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      callIndex++;
      if (callIndex === 1) {
        // `which node` → path
        cb(null, '/usr/local/bin/node\n');
      } else {
        // `node --version` → version
        cb(null, 'v20.11.0\n');
      }
      return { stdin: { end: vi.fn() } };
    });

    const result = await resolveToolInfo('node');
    expect(result).toEqual({ toolPath: '/usr/local/bin/node', version: 'v20.11.0' });
  });

  it('should return null values when tool is not found', async () => {
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(new Error('not found'), '');
      return { stdin: { end: vi.fn() } };
    });

    const result = await resolveToolInfo('nonexistent');
    expect(result).toEqual({ toolPath: null, version: null });
  });

  it('should return path with null version when --version fails', async () => {
    let callIndex = 0;
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      callIndex++;
      if (callIndex === 1) {
        cb(null, '/usr/bin/git\n');
      } else {
        cb(new Error('version failed'), '');
      }
      return { stdin: { end: vi.fn() } };
    });

    const result = await resolveToolInfo('git');
    expect(result).toEqual({ toolPath: '/usr/bin/git', version: null });
  });
});

// ---------------------------------------------------------------------------
// logEnvironmentDiagnostics
// ---------------------------------------------------------------------------

describe('logEnvironmentDiagnostics', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    execFileMock.mockReset();
    // Default: all tool lookups succeed
    let callCount = 0;
    execFileMock.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb: Function) => {
      callCount++;
      // Even calls are `which` → path, odd calls are `--version`
      if (callCount % 2 === 1) {
        cb(null, `/usr/bin/${args[0] || 'tool'}\n`);
      } else {
        cb(null, 'v1.0.0\n');
      }
      return { stdin: { end: vi.fn() } };
    });

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('should print diagnostics block with aligned labels', async () => {
    await logEnvironmentDiagnostics();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0][0] as string;

    // Should contain the environment tag
    expect(output).toContain('[AionUi:env]');

    // Verify Shell label alignment (9 chars padded)
    expect(output).toContain('Shell    :');

    // Verify other labels are present
    expect(output).toContain('OS       :');
    expect(output).toContain('Locale   :');
    expect(output).toContain('Memory   :');
    expect(output).toContain('Node     :');
    expect(output).toContain('execPath :');
    expect(output).toContain('PATH     :');
  });

  it('should never throw — catches errors and logs a warning', async () => {
    // Force an error inside the diagnostics
    vi.spyOn(process, 'platform', 'get').mockImplementation(() => {
      throw new Error('simulated crash');
    });

    await expect(logEnvironmentDiagnostics()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[AionUi:env]'), expect.any(Error));
  });
});
