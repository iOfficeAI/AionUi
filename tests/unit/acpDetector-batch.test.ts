/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('@process/utils/safeExec', () => ({
  safeExec: vi.fn(),
  safeExecFile: vi.fn(),
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(),
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: { getInstance: () => ({ getAcpAdapters: () => [] }) },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn() },
}));

import { safeExec } from '@process/utils/safeExec';
import { getEnhancedEnv } from '@process/utils/shellEnv';
import { acpDetector } from '@process/agent/acp/AcpDetector';

const mockSafeExec = vi.mocked(safeExec);
const mockGetEnhancedEnv = vi.mocked(getEnhancedEnv);

// The POSIX `command -v` batch + fallback paths are only exercised on non-Windows.
// On Windows the implementation takes a separate `where`/PowerShell path.
const itPosix = process.platform === 'win32' ? it.skip : it;

describe('AcpDetector.batchCheckCliAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acpDetector.clearEnvCache();
    mockGetEnhancedEnv.mockReturnValue({ PATH: '/usr/bin:/bin' });
  });

  it('returns an empty set for empty input without spawning a shell', async () => {
    const result = await acpDetector.batchCheckCliAvailability([]);
    expect(result.size).toBe(0);
    expect(mockSafeExec).not.toHaveBeenCalled();
  });

  it('filters injection-unsafe command names and never spawns a shell for them', async () => {
    const result = await acpDetector.batchCheckCliAvailability(['foo; rm -rf /', '&& evil', '$(pwn)']);
    expect(result.size).toBe(0);
    expect(mockSafeExec).not.toHaveBeenCalled();
  });

  itPosix('parses batch stdout into the available set on the happy path', async () => {
    mockSafeExec.mockResolvedValueOnce({ stdout: 'claude\nqwen\n', stderr: '' });

    const result = await acpDetector.batchCheckCliAvailability(['claude', 'qwen', 'goose']);

    expect([...result].toSorted()).toEqual(['claude', 'qwen']);
    expect(mockSafeExec).toHaveBeenCalledTimes(1);
    const [script, opts] = mockSafeExec.mock.calls[0];
    expect(script).toContain("command -v 'claude'");
    expect(script).toContain("command -v 'goose'");
    expect(opts?.timeout).toBeGreaterThanOrEqual(8000);
  });

  itPosix('falls back to per-CLI probes when the batch invocation times out', async () => {
    mockSafeExec
      // Batch fails (simulated timeout)
      .mockRejectedValueOnce(new Error('Command timed out after 8000ms'))
      // Per-CLI fallback — order matches the input array
      .mockResolvedValueOnce({ stdout: '/usr/bin/claude\n', stderr: '' })
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({ stdout: '/usr/bin/goose\n', stderr: '' });

    const result = await acpDetector.batchCheckCliAvailability(['claude', 'qwen', 'goose']);

    expect([...result].toSorted()).toEqual(['claude', 'goose']);
    // 1 batch + 3 per-CLI calls
    expect(mockSafeExec).toHaveBeenCalledTimes(4);
    // Per-CLI calls each get a shorter timeout than the batch so a single slow
    // entry cannot block the rest.
    const perCliCalls = mockSafeExec.mock.calls.slice(1);
    for (const [, opts] of perCliCalls) {
      expect(opts?.timeout).toBeLessThanOrEqual(3000);
    }
  });

  itPosix('returns an empty set when batch and every per-CLI probe fail', async () => {
    mockSafeExec.mockRejectedValue(new Error('filesystem unresponsive'));

    const result = await acpDetector.batchCheckCliAvailability(['claude', 'qwen']);

    expect(result.size).toBe(0);
    // 1 batch + 2 per-CLI attempts
    expect(mockSafeExec).toHaveBeenCalledTimes(3);
  });
});
