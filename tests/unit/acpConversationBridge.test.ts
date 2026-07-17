import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

const handlers: Record<string, (...args: any[]) => any> = {};
const dbMock = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}));
const codexProbeMock = vi.hoisted(() => ({
  probeCodexModelInfo: vi.fn(),
  resolveCodexCliCommand: vi.fn((cliPath?: string) => cliPath || 'codex'),
  readCodexConfiguredModel: vi.fn(() => 'gpt-5.5'),
}));

function makeChannel(name: string) {
  return {
    provider: vi.fn((fn: (...args: any[]) => any) => {
      handlers[name] = fn;
    }),
    emit: vi.fn(),
    invoke: vi.fn(),
  };
}

vi.mock('../../src/common', () => ({
  ipcBridge: {
    acpConversation: {
      checkEnv: makeChannel('checkEnv'),
      detectCliPath: makeChannel('detectCliPath'),
      getAvailableAgents: makeChannel('getAvailableAgents'),
      refreshCustomAgents: makeChannel('refreshCustomAgents'),
      testCustomAgent: makeChannel('testCustomAgent'),
      checkAgentHealth: makeChannel('checkAgentHealth'),
      getMode: makeChannel('getMode'),
      getCapabilities: makeChannel('getCapabilities'),
      getModelInfo: makeChannel('getModelInfo'),
      probeModelInfo: makeChannel('probeModelInfo'),
      setModel: makeChannel('setModel'),
      setMode: makeChannel('setMode'),
      getConfigOptions: makeChannel('getConfigOptions'),
      setConfigOption: makeChannel('setConfigOption'),
    },
  },
}));

vi.mock('../../src/process/agent/AgentRegistry', () => ({
  agentRegistry: {
    getDetectedAgents: vi.fn(() => []),
    refreshCustomAgents: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/process/agent/acp/AcpConnection', () => ({
  AcpConnection: vi.fn(function () {
    return {
      connect: vi.fn(async () => {}),
      newSession: vi.fn(async () => {}),
      sendPrompt: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      getConfigOptions: vi.fn(() => []),
      getModels: vi.fn(() => []),
      getInitializeResponse: vi.fn(() => null),
    };
  }),
}));
vi.mock('../../src/process/task/AcpAgentManager', () => ({ default: class AcpAgentManager {} }));
vi.mock('../../src/process/task/GeminiAgentManager', () => ({ GeminiAgentManager: class GeminiAgentManager {} }));
vi.mock('../../src/process/agent/codex/appserver/CodexNativeAgentManager', () => ({
  default: class CodexNativeAgentManager {},
  resolveCodexCliCommand: codexProbeMock.resolveCodexCliCommand,
}));
vi.mock('../../src/process/agent/codex/appserver/CodexModelProbe', () => ({
  probeCodexModelInfo: codexProbeMock.probeCodexModelInfo,
}));

vi.mock('../../src/process/agent/codex/appserver/codexCliConfig', () => ({
  readCodexConfiguredModel: codexProbeMock.readCodexConfiguredModel,
}));

vi.mock('../../src/process/services/mcpServices/McpService', () => ({
  mcpService: { getSupportedTransportsForAgent: vi.fn(() => []) },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: dbMock.getDatabase,
}));

vi.mock('../../src/process/agent/aionrs/binaryResolver', () => ({
  detectAionrs: vi.fn(() => ({ available: false, path: null })),
}));

vi.mock('../../src/process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
}));

import { initAcpConversationBridge } from '../../src/process/bridge/acpConversationBridge';
import { AcpConnection } from '../../src/process/agent/acp/AcpConnection';
import CodexNativeAgentManager from '../../src/process/agent/codex/appserver/CodexNativeAgentManager';
import type { IWorkerTaskManager } from '../../src/process/task/IWorkerTaskManager';

function makeTaskManager(overrides?: Partial<IWorkerTaskManager>): IWorkerTaskManager {
  return {
    getTask: vi.fn(() => undefined),
    getOrBuildTask: vi.fn(async () => {
      throw new Error('not found');
    }),
    addTask: vi.fn(),
    kill: vi.fn(),
    clear: vi.fn(),
    listTasks: vi.fn(() => []),
    ...overrides,
  };
}

describe('acpConversationBridge', () => {
  let taskManager: IWorkerTaskManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    taskManager = makeTaskManager();
    dbMock.getDatabase.mockReset();
    codexProbeMock.probeCodexModelInfo.mockReset();
    codexProbeMock.resolveCodexCliCommand.mockClear();
    codexProbeMock.readCodexConfiguredModel.mockClear();
    const { agentRegistry } = await import('../../src/process/agent/AgentRegistry');
    vi.mocked(agentRegistry.getDetectedAgents).mockReturnValue([]);
    initAcpConversationBridge(taskManager);
  });

  // --- getMode ---

  it('returns { initialized: false } when no task exists for the conversation', async () => {
    vi.mocked(taskManager.getTask).mockReturnValue(undefined);

    const result = await handlers['getMode']({ conversationId: 'missing' });

    expect(result).toEqual({ success: true, data: { mode: 'default', initialized: false } });
  });

  it('uses injected taskManager to look up task by conversation id', async () => {
    vi.mocked(taskManager.getTask).mockReturnValue(undefined);

    await handlers['getMode']({ conversationId: 'c1' });

    expect(taskManager.getTask).toHaveBeenCalledWith('c1');
  });

  // --- refreshCustomAgents ---

  it('refreshCustomAgents delegates to agentRegistry and returns success', async () => {
    const { agentRegistry } = await import('../../src/process/agent/AgentRegistry');
    const result = await handlers['refreshCustomAgents']();
    expect(result).toEqual({ success: true });
    expect(agentRegistry.refreshCustomAgents).toHaveBeenCalledTimes(1);
  });

  it('refreshCustomAgents can be called multiple times', async () => {
    const { agentRegistry } = await import('../../src/process/agent/AgentRegistry');
    await handlers['refreshCustomAgents']();
    const result = await handlers['refreshCustomAgents']();
    expect(result).toEqual({ success: true });
    expect(agentRegistry.refreshCustomAgents).toHaveBeenCalledTimes(2);
  });

  // --- getAvailableAgents ---

  it('getAvailableAgents returns enriched agent list', async () => {
    const { agentRegistry } = await import('../../src/process/agent/AgentRegistry');
    vi.mocked(agentRegistry.getDetectedAgents).mockReturnValue([
      { backend: 'claude', name: 'Claude', cliPath: '/usr/bin/claude' },
    ] as any);

    const { mcpService } = await import('../../src/process/services/mcpServices/McpService');
    vi.mocked(mcpService.getSupportedTransportsForAgent).mockReturnValue(['stdio'] as any);

    const result = await handlers['getAvailableAgents']();
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].supportedTransports).toEqual(['stdio']);
  });

  it('getAvailableAgents returns error when registry throws', async () => {
    const { agentRegistry } = await import('../../src/process/agent/AgentRegistry');
    vi.mocked(agentRegistry.getDetectedAgents).mockImplementation(() => {
      throw new Error('detection failed');
    });

    const result = await handlers['getAvailableAgents']();
    expect(result).toEqual({ success: false, msg: 'detection failed' });
  });

  it('getModelInfo loads native Codex task model info through the app-server', async () => {
    const modelInfo = {
      currentModelId: 'gpt-5.3-codex',
      currentModelLabel: 'GPT-5.3 Codex',
      availableModels: [{ id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' }],
      canSwitch: false,
      source: 'models',
    };
    const task = new CodexNativeAgentManager() as CodexNativeAgentManager & {
      getModelInfo: ReturnType<typeof vi.fn>;
      loadModelInfo: ReturnType<typeof vi.fn>;
    };
    task.getModelInfo = vi.fn(() => modelInfo);
    task.loadModelInfo = vi.fn(async () => modelInfo);
    vi.mocked(taskManager.getTask).mockReturnValue(task as never);

    const result = await handlers['getModelInfo']({ conversationId: 'codex-1' });

    expect(taskManager.getTask).toHaveBeenCalledWith('codex-1');
    expect(task.getModelInfo).not.toHaveBeenCalled();
    expect(task.loadModelInfo).toHaveBeenCalledOnce();
    expect(result).toEqual({ success: true, data: { modelInfo } });
  });

  it('getModelInfo returns persisted native Codex model info without building a task', async () => {
    vi.mocked(taskManager.getTask).mockReturnValue(undefined);
    dbMock.getDatabase.mockResolvedValue({
      getConversation: vi.fn(() => ({
        success: true,
        data: {
          type: 'codex',
          extra: { codexNative: true, currentModelId: 'gpt-5.6-sol' },
        },
      })),
    });

    const result = await handlers['getModelInfo']({ conversationId: 'codex-not-started' });

    expect(taskManager.getOrBuildTask).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      data: {
        modelInfo: expect.objectContaining({
          currentModelId: 'gpt-5.6-sol',
          currentModelLabel: 'gpt-5.6-sol',
          availableModels: expect.arrayContaining([{ id: 'gpt-5.6-sol', label: 'gpt-5.6-sol' }]),
          canSwitch: true,
          source: 'models',
          sourceDetail: 'codex-stream',
        }),
      },
    });
  });

  it('probes Codex models through the native app-server', async () => {
    const modelInfo = {
      currentModelId: 'gpt-5.6-sol',
      currentModelLabel: 'GPT-5.6-Sol',
      availableModels: [
        { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
        { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna' },
      ],
      canSwitch: true,
      source: 'models',
    };
    const { agentRegistry } = await import('../../src/process/agent/AgentRegistry');
    vi.mocked(agentRegistry.getDetectedAgents).mockReturnValue([
      {
        id: 'codex',
        name: 'Codex',
        kind: 'codex',
        backend: 'codex',
        available: true,
        cliPath: '/opt/codex/bin/codex',
        appServer: true,
      },
    ]);
    codexProbeMock.probeCodexModelInfo.mockResolvedValue(modelInfo);

    const result = await handlers['probeModelInfo']({ backend: 'codex' });

    expect(codexProbeMock.resolveCodexCliCommand).toHaveBeenCalledWith('/opt/codex/bin/codex');
    expect(codexProbeMock.probeCodexModelInfo).toHaveBeenCalledWith({
      command: '/opt/codex/bin/codex',
      cwd: expect.any(String),
      currentModelId: 'gpt-5.5',
    });
    expect(vi.mocked(AcpConnection)).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: { modelInfo, configOptions: [] } });
  });

  it('getModelInfo returns persisted native Codex model info when the task was rebuilt away', async () => {
    vi.mocked(taskManager.getTask).mockReturnValue(undefined);
    dbMock.getDatabase.mockResolvedValue({
      getConversation: vi.fn(() => ({
        success: true,
        data: {
          type: 'codex',
          extra: {
            codexNative: true,
            currentModelId: 'gpt-5.3-codex',
          },
        },
      })),
    });

    const result = await handlers['getModelInfo']({ conversationId: 'codex-1' });

    expect(result).toEqual({
      success: true,
      data: {
        modelInfo: expect.objectContaining({
          currentModelId: 'gpt-5.3-codex',
          currentModelLabel: 'gpt-5.3-codex',
          availableModels: expect.arrayContaining([
            { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
            { id: 'gpt-5.6-sol', label: 'gpt-5.6-sol' },
          ]),
          canSwitch: true,
          source: 'models',
          sourceDetail: 'codex-stream',
        }),
      },
    });
  });

  it('setModel delegates native Codex model selection and rebuilds the task on next send', async () => {
    const modelInfo = {
      currentModelId: 'gpt-5.3-codex',
      currentModelLabel: 'GPT-5.3 Codex',
      availableModels: [{ id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' }],
      canSwitch: false,
      source: 'models',
    };
    const task = new CodexNativeAgentManager() as CodexNativeAgentManager & {
      getModelInfo: ReturnType<typeof vi.fn>;
      setModel: ReturnType<typeof vi.fn>;
    };
    task.getModelInfo = vi.fn(() => ({
      currentModelId: 'gpt-5.2-codex',
      currentModelLabel: 'GPT-5.2 Codex',
      availableModels: [{ id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' }],
      canSwitch: false,
      source: 'models',
    }));
    task.setModel = vi.fn(async () => modelInfo);
    vi.mocked(taskManager.getOrBuildTask).mockResolvedValue(task as never);

    const result = await handlers['setModel']({ conversationId: 'codex-1', modelId: 'gpt-5.3-codex' });

    expect(task.setModel).toHaveBeenCalledWith('gpt-5.3-codex');
    expect(taskManager.kill).toHaveBeenCalledWith('codex-1');
    expect(result).toEqual({ success: true, data: { modelInfo } });
  });

  it('setModel does not rebuild a native Codex task when the selected model is unchanged', async () => {
    const modelInfo = {
      currentModelId: 'gpt-5.3-codex',
      currentModelLabel: 'GPT-5.3 Codex',
      availableModels: [{ id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' }],
      canSwitch: false,
      source: 'models',
    };
    const task = new CodexNativeAgentManager() as CodexNativeAgentManager & {
      getModelInfo: ReturnType<typeof vi.fn>;
      setModel: ReturnType<typeof vi.fn>;
    };
    task.getModelInfo = vi.fn(() => modelInfo);
    task.setModel = vi.fn(async () => modelInfo);
    vi.mocked(taskManager.getOrBuildTask).mockResolvedValue(task as never);

    const result = await handlers['setModel']({ conversationId: 'codex-1', modelId: 'gpt-5.3-codex' });

    expect(task.setModel).toHaveBeenCalledWith('gpt-5.3-codex');
    expect(taskManager.kill).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: { modelInfo } });
  });
});
