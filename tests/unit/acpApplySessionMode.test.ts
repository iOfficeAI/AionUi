/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConnect, mockSetSessionMode, mockSetModel, mockDisconnect, mockGetInitializeResponse } = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockSetSessionMode: vi.fn().mockResolvedValue(undefined),
  mockSetModel: vi.fn().mockResolvedValue(undefined),
  mockDisconnect: vi.fn().mockResolvedValue(undefined),
  mockGetInitializeResponse: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/process/agent/acp/AcpConnection', () => ({
  AcpConnection: class {
    hasActiveSession = true;
    isConnected = true;
    connect = mockConnect;
    setSessionMode = mockSetSessionMode;
    setModel = mockSetModel;
    disconnect = mockDisconnect;
    getInitializeResponse = mockGetInitializeResponse;
    getConfigOptions = vi.fn().mockReturnValue(null);
    getModels = vi.fn().mockReturnValue(null);
    getModes = vi.fn().mockReturnValue(null);
    setPromptTimeout = vi.fn();
    onSessionUpdate: unknown = undefined;
    onPermissionRequest: unknown = undefined;
    onEndTurn: unknown = undefined;
    onPromptUsage: unknown = undefined;
    onFileOperation: unknown = undefined;
    onDisconnect: unknown = undefined;
  },
}));

vi.mock('../../src/process/agent/acp/AcpAdapter', () => ({
  AcpAdapter: class {
    constructor() {}
  },
}));

vi.mock('../../src/process/agent/acp/ApprovalStore', () => ({
  AcpApprovalStore: class {
    constructor() {}
  },
  createAcpApprovalKey: vi.fn(),
}));

vi.mock('../../src/process/agent/acp/utils', () => ({
  getClaudeModel: vi.fn().mockReturnValue(null),
  getClaudeModelSlot: vi.fn().mockReturnValue(null),
  killChild: vi.fn(),
  readTextFile: vi.fn(),
  writeJsonRpcMessage: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock('../../src/process/services/ccSwitchModelSource', () => ({
  readClaudeModelInfoFromCcSwitch: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/process/agent/acp/modelInfo', () => ({
  buildAcpModelInfo: vi.fn().mockReturnValue(null),
  summarizeAcpModelInfo: vi.fn(),
}));

vi.mock('../../src/process/agent/acp/mcpSessionConfig', () => ({
  buildBuiltinAcpSessionMcpServers: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
}));

vi.mock('../../src/common/utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/common/utils')>();
  return { ...original, uuid: vi.fn().mockReturnValue('test-uuid') };
});

vi.mock('../../src/process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn().mockReturnValue({}),
  resolveNpxPath: vi.fn().mockReturnValue('npx'),
  getNpxCacheDir: vi.fn().mockReturnValue('/tmp/.npx-cache'),
  getWindowsShellExecutionOptions: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn().mockResolvedValue(null) },
}));

import { AcpAgent } from '../../src/process/agent/acp/index';

describe('AcpAgent.start() — applySessionMode', () => {
  const baseConfig = {
    id: 'test-agent',
    backend: 'claude' as const,
    workingDir: '/tmp',
    onStreamEvent: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockSetSessionMode.mockResolvedValue(undefined);
    mockSetModel.mockResolvedValue(undefined);
    mockGetInitializeResponse.mockReturnValue(null);
  });

  it('applies non-default sessionMode when yoloMode is off', async () => {
    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'claude',
        sessionMode: 'acceptEdits',
      },
    });

    await agent.start();

    expect(mockSetSessionMode).toHaveBeenCalledOnce();
    expect(mockSetSessionMode).toHaveBeenCalledWith('acceptEdits');
  });

  it('applies "auto" sessionMode', async () => {
    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'claude',
        sessionMode: 'auto',
      },
    });

    await agent.start();

    expect(mockSetSessionMode).toHaveBeenCalledOnce();
    expect(mockSetSessionMode).toHaveBeenCalledWith('auto');
  });

  it('applies "dontAsk" sessionMode', async () => {
    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'claude',
        sessionMode: 'dontAsk',
      },
    });

    await agent.start();

    expect(mockSetSessionMode).toHaveBeenCalledOnce();
    expect(mockSetSessionMode).toHaveBeenCalledWith('dontAsk');
  });

  it('applies "plan" sessionMode', async () => {
    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'claude',
        sessionMode: 'plan',
      },
    });

    await agent.start();

    expect(mockSetSessionMode).toHaveBeenCalledOnce();
    expect(mockSetSessionMode).toHaveBeenCalledWith('plan');
  });

  it('does not apply sessionMode when value is "default"', async () => {
    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'claude',
        sessionMode: 'default',
      },
    });

    await agent.start();

    expect(mockSetSessionMode).not.toHaveBeenCalled();
  });

  it('does not apply sessionMode when value is undefined', async () => {
    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'claude',
      },
    });

    await agent.start();

    expect(mockSetSessionMode).not.toHaveBeenCalled();
  });

  it('does not throw when non-YOLO sessionMode fails (fatal=false)', async () => {
    mockSetSessionMode.mockRejectedValue(new Error('mode not supported'));

    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'claude',
        sessionMode: 'acceptEdits',
      },
    });

    await expect(agent.start()).resolves.toBeUndefined();
    expect(mockSetSessionMode).toHaveBeenCalledOnce();
  });

  it('prefers YOLO mode over sessionMode when both are set', async () => {
    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'claude',
        yoloMode: true,
        sessionMode: 'acceptEdits',
      },
    });

    await agent.start();

    // Should apply YOLO mode (bypassPermissions), not the sessionMode
    expect(mockSetSessionMode).toHaveBeenCalledOnce();
    expect(mockSetSessionMode).toHaveBeenCalledWith('bypassPermissions');
  });

  it('throws when YOLO mode fails (fatal=true)', async () => {
    mockSetSessionMode.mockRejectedValue(new Error('connection lost'));

    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'claude',
        yoloMode: true,
      },
    });

    await expect(agent.start()).rejects.toThrow('Failed to enable claude YOLO mode');
  });
});
