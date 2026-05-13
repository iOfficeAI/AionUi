/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AcpAgent } from '../../../../src/process/agent/acp/index';

const { mockProcessConfigGet, getStartupBackendSyncState } = vi.hoisted(() => ({
  mockProcessConfigGet: vi.fn(),
  getStartupBackendSyncState: vi.fn(),
}));

vi.mock('@process/utils/initStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@process/utils/initStorage')>();
  return {
    ...actual,
    ProcessConfig: {
      ...actual.ProcessConfig,
      get: mockProcessConfigGet,
    },
  };
});

vi.mock('../../../../src/process/agent/modelSync/startupSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/process/agent/modelSync/startupSync')>();
  return {
    ...actual,
    getStartupBackendSyncState,
  };
});

function makeClaudeAgent(): AcpAgent {
  return new AcpAgent({
    id: 'claude-agent',
    backend: 'claude',
    workingDir: '/tmp',
    extra: {
      backend: 'claude',
      workspace: '/tmp',
      cliPath: 'claude',
    },
    onStreamEvent: vi.fn(),
  });
}

describe('AcpAgent Claude authentication gate', () => {
  beforeEach(() => {
    mockProcessConfigGet.mockReset();
    getStartupBackendSyncState.mockReset();
  });

  it('skips claude /login warmup when startup provider takeover is prepared', async () => {
    const agent = makeClaudeAgent();
    const connection = (agent as any).connection;
    vi.spyOn(connection, 'getInitializeResult').mockReturnValue({ authMethods: [{ id: 'login' }] } as any);
    vi.spyOn(agent as any, 'createOrResumeSession')
      .mockRejectedValueOnce(new Error('Not logged in'))
      .mockResolvedValueOnce(undefined);
    const ensureClaudeAuth = vi.spyOn(agent as any, 'ensureClaudeAuth').mockResolvedValue(undefined);
    const emitStatusMessage = vi.spyOn(agent as any, 'emitStatusMessage').mockReturnValue(undefined);
    getStartupBackendSyncState.mockResolvedValue('prepared');

    await (agent as any).performAuthentication();

    expect(ensureClaudeAuth).not.toHaveBeenCalled();
    expect(emitStatusMessage).toHaveBeenCalledWith('authenticated');
  });

  it('keeps claude /login warmup when startup provider takeover is not prepared', async () => {
    const agent = makeClaudeAgent();
    const connection = (agent as any).connection;
    vi.spyOn(connection, 'getInitializeResult').mockReturnValue({ authMethods: [{ id: 'login' }] } as any);
    vi.spyOn(agent as any, 'createOrResumeSession')
      .mockRejectedValueOnce(new Error('Not logged in'))
      .mockResolvedValueOnce(undefined);
    const ensureClaudeAuth = vi.spyOn(agent as any, 'ensureClaudeAuth').mockResolvedValue(undefined);
    const emitStatusMessage = vi.spyOn(agent as any, 'emitStatusMessage').mockReturnValue(undefined);
    getStartupBackendSyncState.mockResolvedValue('degraded');

    await (agent as any).performAuthentication();

    expect(ensureClaudeAuth).toHaveBeenCalledOnce();
    expect(emitStatusMessage).toHaveBeenCalledWith('authenticated');
  });
});
