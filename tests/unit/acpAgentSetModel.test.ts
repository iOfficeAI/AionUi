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

const mockReadClaudeModelInfoFromCcSwitch = vi.hoisted(() => vi.fn().mockReturnValue(null));

vi.mock('../../src/process/services/ccSwitchModelSource', () => ({
  readClaudeModelInfoFromCcSwitch: mockReadClaudeModelInfoFromCcSwitch,
}));

vi.mock('../../src/process/agent/acp/modelInfo', () => ({
  buildAcpModelInfo: vi.fn((_, __, preferredModelInfo) => preferredModelInfo ?? null),
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

describe('AcpAgent.start() — setModel for claude backend', () => {
  const baseConfig = {
    id: 'test-agent',
    backend: 'claude' as const,
    workingDir: '/tmp',
    onStreamEvent: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockSetModel.mockResolvedValue(undefined);
    mockGetInitializeResponse.mockReturnValue(null);
    mockReadClaudeModelInfoFromCcSwitch.mockReturnValue(null);
  });

  it('uses the cc-switch slot id when Claude model info is available', async () => {
    mockReadClaudeModelInfoFromCcSwitch.mockReturnValue({
      currentModelId: 'haiku',
      currentModelLabel: 'GLM 5.1x',
      availableModels: [
        { id: 'default', label: 'Gemini 3.1 Pro' },
        { id: 'opus', label: 'Claude Opus 4.6 CC' },
        { id: 'haiku', label: 'GLM 5.1x' },
      ],
      canSwitch: true,
      source: 'models',
      sourceDetail: 'cc-switch',
    });

    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'claude',
      },
    });

    await agent.start();

    expect(mockSetModel).toHaveBeenCalledOnce();
    expect(mockSetModel).toHaveBeenCalledWith('haiku');
  });

  it('keeps the user-selected Claude slot in model info after switching', async () => {
    mockReadClaudeModelInfoFromCcSwitch.mockReturnValue({
      currentModelId: 'haiku',
      currentModelLabel: 'GLM 5.1x',
      availableModels: [
        { id: 'default', label: 'Gemini 3.1 Pro' },
        { id: 'opus', label: 'Claude Opus 4.6 CC' },
        { id: 'haiku', label: 'GLM 5.1x' },
      ],
      canSwitch: true,
      source: 'models',
      sourceDetail: 'cc-switch',
    });

    const agent = new AcpAgent({
      ...baseConfig,
      extra: {
        backend: 'claude',
      },
    });

    await agent.start();
    const modelInfo = await agent.setModelByConfigOption('opus');

    expect(mockSetModel).toHaveBeenCalledWith('opus');
    expect(modelInfo?.currentModelId).toBe('opus');
    expect(modelInfo?.currentModelLabel).toBe('Claude Opus 4.6 CC');
  });
});

describe('AcpAgent turn-level thought/content observability', () => {
  const baseConfig = {
    id: 'obs-agent',
    backend: 'claude' as const,
    workingDir: '/tmp',
    onStreamEvent: vi.fn(),
    onSignalEvent: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warns at end of turn when thought exists but no content', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const agent = new AcpAgent({
      ...baseConfig,
      extra: { backend: 'claude' },
    });

    (agent as any).emitMessage({
      id: 'tips-1',
      conversation_id: 'obs-agent',
      type: 'tips',
      position: 'center',
      createdAt: Date.now(),
      content: { type: 'warning', content: 'Thinking...' },
    });
    (agent as any).handleEndTurn();

    expect(warnSpy).toHaveBeenCalledWith(
      '[ACP-STREAM] End turn with thought but no content (conversation=obs-agent, backend=claude)'
    );
    warnSpy.mockRestore();
  });

  it('does not warn at end of turn when content exists', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const agent = new AcpAgent({
      ...baseConfig,
      extra: { backend: 'claude' },
    });

    (agent as any).emitMessage({
      id: 'text-1',
      msg_id: 'text-1',
      conversation_id: 'obs-agent',
      type: 'text',
      position: 'left',
      createdAt: Date.now(),
      content: { content: 'Final answer' },
    });
    (agent as any).handleEndTurn();

    expect(warnSpy).not.toHaveBeenCalledWith(
      '[ACP-STREAM] End turn with thought but no content (conversation=obs-agent, backend=claude)'
    );
    warnSpy.mockRestore();
  });
});
