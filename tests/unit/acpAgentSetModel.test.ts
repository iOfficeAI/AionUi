/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConnect, mockSetModel, mockDisconnect, mockGetInitializeResponse } = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockSetModel: vi.fn().mockResolvedValue(undefined),
  mockDisconnect: vi.fn().mockResolvedValue(undefined),
  mockGetInitializeResponse: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/process/agent/acp/AcpConnection', () => ({
  AcpConnection: class {
    hasActiveSession = true;
    isConnected = true;
    connect = mockConnect;
    setModel = mockSetModel;
    disconnect = mockDisconnect;
    getInitializeResponse = mockGetInitializeResponse;
    getConfigOptions = vi.fn().mockReturnValue(null);
    getModels = vi.fn().mockReturnValue(null);
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
  killChild: vi.fn(),
  readTextFile: vi.fn(),
  writeJsonRpcMessage: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock('../../src/process/agent/acp/modelInfo', () => ({
  buildAcpModelInfo: vi.fn().mockReturnValue(null),
  summarizeAcpModelInfo: vi.fn(),
}));

vi.mock('../../src/process/agent/acp/mcpSessionConfig', () => ({
  buildBuiltinAcpSessionMcpServers: vi.fn().mockResolvedValue([]),
  parseAcpMcpCapabilities: vi.fn().mockReturnValue([]),
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

describe('AcpAgent.start() — setModel for non-claude backends', () => {
  const baseConfig = {
    id: 'test-agent',
    backend: 'gemini' as const,
    workingDir: '/tmp',
    onStreamEvent: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockSetModel.mockResolvedValue(undefined);
    mockGetInitializeResponse.mockReturnValue(null);
  });

  it('calls connection.setModel when extra.currentModelId is set and backend is not claude', async () => {
    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'gemini',
        currentModelId: 'gemini-2.5-pro',
      },
    });

    await agent.start();

    expect(mockSetModel).toHaveBeenCalledOnce();
    expect(mockSetModel).toHaveBeenCalledWith('gemini-2.5-pro');
  });

  it('does not propagate error when setModel throws', async () => {
    mockSetModel.mockRejectedValue(new Error('model not supported'));

    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'gemini',
        currentModelId: 'gemini-2.5-pro',
      },
    });

    await expect(agent.start()).resolves.toBeUndefined();
    expect(mockSetModel).toHaveBeenCalledOnce();
  });

  it('does not call connection.setModel when extra.currentModelId is absent', async () => {
    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'gemini',
      },
    });

    await agent.start();

    expect(mockSetModel).not.toHaveBeenCalled();
  });
});
