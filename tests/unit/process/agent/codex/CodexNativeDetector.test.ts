/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'child_process';
import { accessSync, constants } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodexNativeDetector } from '@/process/agent/codex/CodexNativeDetector';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  accessSync: vi.fn(),
  constants: { X_OK: 1 },
}));

describe('CodexNativeDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects an executable Codex path without launching Codex', () => {
    vi.mocked(accessSync).mockReturnValue(undefined);

    expect(new CodexNativeDetector().detect('/bin/codex')).toEqual([
      expect.objectContaining({
        kind: 'codex',
        backend: 'codex',
        cliPath: '/bin/codex',
        appServer: true,
      }),
    ]);
    expect(accessSync).toHaveBeenCalledWith('/bin/codex', constants.X_OK);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('detects a Codex command through the shell without launching Codex', () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('/opt/homebrew/bin/codex\n'));

    expect(new CodexNativeDetector().detect('codex')).toEqual([
      expect.objectContaining({
        kind: 'codex',
        backend: 'codex',
        cliPath: 'codex',
        appServer: true,
      }),
    ]);
    expect(execFileSync).toHaveBeenCalledWith(expect.any(String), ['-lc', "command -v -- 'codex'"], {
      stdio: 'ignore',
      timeout: 1500,
    });
  });

  it('returns no native Codex agent when Codex is unavailable', () => {
    vi.mocked(accessSync).mockImplementation(() => {
      throw new Error('missing');
    });

    expect(new CodexNativeDetector().detect('/bin/codex')).toEqual([]);
  });
});
