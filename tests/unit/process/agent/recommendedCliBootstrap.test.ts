/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const getEnhancedEnvMock = vi.fn();

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: (...args: unknown[]) => getEnhancedEnvMock(...args),
}));

describe('recommendedCliBootstrap', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    getEnhancedEnvMock.mockReset();
    getEnhancedEnvMock.mockImplementation((env?: NodeJS.ProcessEnv) => env ?? process.env);
  });

  it('skips installation when the CLI is already present', async () => {
    const { ensureRecommendedCliBootstrap } = await import('@process/agent/recommendedCliBootstrap');
    const runCommand = vi.fn();

    const results = await ensureRecommendedCliBootstrap(
      { PATH: '/mock/bin' },
      {
        isCommandAvailable: (command) =>
          command === 'claude' || command === 'bun' || command === 'bash' || command === 'curl',
        runCommand,
      }
    );

    expect(results.find((item) => item.cli === 'claude')).toEqual({ cli: 'claude', state: 'already-installed' });
    expect(runCommand).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['@anthropic-ai/claude-code']),
      expect.anything()
    );
  });

  it('installs missing npm-style CLIs through bun when available', async () => {
    const { ensureRecommendedCliBootstrap } = await import('@process/agent/recommendedCliBootstrap');
    const runCommand = vi.fn().mockResolvedValue(undefined);

    const results = await ensureRecommendedCliBootstrap(
      { PATH: '/mock/bin' },
      {
        isCommandAvailable: (command) => command === 'bun' || command === 'bash' || command === 'curl',
        runCommand,
      }
    );

    expect(runCommand).toHaveBeenCalledWith('bun', ['add', '-g', '@anthropic-ai/claude-code'], expect.any(Object));
    expect(runCommand).toHaveBeenCalledWith('bun', ['add', '-g', 'opencode-ai'], expect.any(Object));
    expect(runCommand).toHaveBeenCalledWith(
      'bash',
      ['-lc', 'curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard'],
      expect.any(Object)
    );
    expect(runCommand).toHaveBeenCalledWith(
      'bash',
      ['-lc', 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash'],
      expect.any(Object)
    );
    expect(results.find((item) => item.cli === 'claude')?.state).toBe('installed');
    expect(results.find((item) => item.cli === 'openclaw')?.state).toBe('installed');
    expect(results.find((item) => item.cli === 'opencode')?.state).toBe('installed');
  });

  it('marks Hermes auto-install unsupported on Windows', async () => {
    vi.stubEnv('AIONUI_SKIP_RECOMMENDED_CLI_BOOTSTRAP', '');
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    const { ensureRecommendedCliBootstrap } = await import('@process/agent/recommendedCliBootstrap');
    const runCommand = vi.fn();

    const results = await ensureRecommendedCliBootstrap(
      { PATH: 'C:\\mock\\bin' },
      {
        isCommandAvailable: (command) => command === 'bun',
        runCommand,
      }
    );

    expect(results.find((item) => item.cli === 'hermes')).toEqual({
      cli: 'hermes',
      state: 'unsupported',
      reason: 'Hermes auto-install is only supported on macOS/Linux with bash and curl',
    });
    expect(runCommand).not.toHaveBeenCalledWith('bash', expect.any(Array), expect.anything());
  });

  it('uses the official OpenClaw PowerShell installer on Windows', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    const { ensureRecommendedCliBootstrap } = await import('@process/agent/recommendedCliBootstrap');
    const runCommand = vi.fn().mockResolvedValue(undefined);

    const results = await ensureRecommendedCliBootstrap(
      { PATH: 'C:\\mock\\bin' },
      {
        isCommandAvailable: (command) => command === 'bun',
        runCommand,
      }
    );

    expect(runCommand).toHaveBeenCalledWith(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard',
      ],
      expect.any(Object)
    );
    expect(results.find((item) => item.cli === 'openclaw')?.state).toBe('installed');
  });

  it('supports skipping the whole bootstrap pass by env flag', async () => {
    vi.stubEnv('AIONUI_SKIP_RECOMMENDED_CLI_BOOTSTRAP', '1');

    const { ensureRecommendedCliBootstrap } = await import('@process/agent/recommendedCliBootstrap');
    const runCommand = vi.fn();

    const results = await ensureRecommendedCliBootstrap(undefined, {
      isCommandAvailable: () => false,
      runCommand,
    });

    expect(results).toHaveLength(4);
    expect(results.every((item) => item.state === 'skipped')).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('formats a concise bootstrap summary', async () => {
    const { formatRecommendedCliBootstrapSummary } = await import('@process/agent/recommendedCliBootstrap');

    expect(
      formatRecommendedCliBootstrapSummary([
        { cli: 'claude', state: 'already-installed' },
        { cli: 'openclaw', state: 'installed' },
        { cli: 'hermes', state: 'unsupported', reason: 'WSL2 required' },
      ])
    ).toBe('claude=skip(installed), openclaw=ok(installed), hermes=unsupported(WSL2 required)');
  });
});
