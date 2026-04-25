/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSyncMock = vi.hoisted(() => vi.fn());
const getEnhancedEnvMock = vi.hoisted(() => vi.fn(() => ({ PATH: 'C:\\Windows\\System32' })));

vi.mock('child_process', () => ({
  execFileSync: execFileSyncMock,
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: getEnhancedEnvMock,
}));

describe('resolveAionrsConfigPath', () => {
  beforeEach(() => {
    vi.resetModules();
    execFileSyncMock.mockReset();
    getEnhancedEnvMock.mockClear();
  });

  it('executes the aionrs binary with an argument array so Windows paths with spaces work', async () => {
    execFileSyncMock.mockReturnValue('C:\\Users\\tester\\.aionrs\\config.toml\n');

    const { resolveAionrsConfigPath } =
      await import('../../../../../../src/process/services/mcpServices/agents/AionrsMcpAgent');

    const cliPath = 'D:\\Program Files\\AionUi\\resources\\bundled-aionrs\\win32-x64\\aionrs.exe';
    const result = resolveAionrsConfigPath(cliPath);

    expect(result).toBe('C:\\Users\\tester\\.aionrs\\config.toml');
    expect(execFileSyncMock).toHaveBeenCalledWith(
      cliPath,
      ['--config-path'],
      expect.objectContaining({
        encoding: 'utf-8',
        timeout: 3000,
        env: { PATH: 'C:\\Windows\\System32' },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    );
  });
});
