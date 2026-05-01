/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'child_process';
import { describe, expect, it, vi } from 'vitest';
import { CodexNativeDetector } from '@/process/agent/codex/CodexNativeDetector';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

describe('CodexNativeDetector', () => {
  it('detects codex app-server support', () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(''));

    expect(new CodexNativeDetector().detect('/bin/codex')).toEqual([
      expect.objectContaining({
        kind: 'codex',
        backend: 'codex',
        cliPath: '/bin/codex',
        appServer: true,
      }),
    ]);
    expect(execFileSync).toHaveBeenCalledWith('/bin/codex', ['app-server', '--help'], {
      stdio: 'ignore',
      timeout: 3000,
    });
  });

  it('returns no native Codex agent when app-server is unavailable', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('missing');
    });

    expect(new CodexNativeDetector().detect('/bin/codex')).toEqual([]);
  });
});
