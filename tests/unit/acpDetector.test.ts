/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecSync = vi.fn();
const mockExistsSync = vi.fn();
const mockGetEnhancedEnv = vi.fn(() => ({ PATH: '/usr/bin:/bin' }));

vi.mock('child_process', () => ({
  execSync: mockExecSync,
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: mockExistsSync,
  };
});

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: mockGetEnhancedEnv,
}));

vi.mock('@/process/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/extensions', () => ({
  ExtensionRegistry: {
    getInstance: () => ({
      getAcpAdapters: () => [],
    }),
  },
}));

describe('AcpDetector', () => {
  beforeEach(() => {
    vi.resetModules();
    mockExecSync.mockReset();
    mockExistsSync.mockReset();
    mockGetEnhancedEnv.mockClear();
  });

  it('detects Codex from the macOS app bundle when PATH lookup fails', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    mockExistsSync.mockImplementation((candidate: string) => candidate === '/Applications/Codex.app/Contents/Resources/codex');

    const { acpDetector } = await import('@/agent/acp/AcpDetector');
    await acpDetector.initialize();

    const codex = acpDetector.getDetectedAgents().find((agent) => agent.backend === 'codex');
    expect(codex?.cliPath).toBe('/Applications/Codex.app/Contents/Resources/codex');
  });

  it('reconciles Codex after startup when the CLI appears later', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    mockExistsSync.mockReturnValue(false);

    const { acpDetector } = await import('@/agent/acp/AcpDetector');
    await acpDetector.initialize();

    expect(acpDetector.getDetectedAgents().some((agent) => agent.backend === 'codex')).toBe(false);

    mockExecSync.mockImplementation((command: string) => {
      if (command === 'which codex') {
        return '/Applications/Codex.app/Contents/Resources/codex\n';
      }
      throw new Error('not found');
    });

    const codex = acpDetector.getDetectedAgents().find((agent) => agent.backend === 'codex');
    expect(codex?.cliPath).toBe('/Applications/Codex.app/Contents/Resources/codex');
  });
});
