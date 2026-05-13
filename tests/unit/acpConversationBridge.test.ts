import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DetectedAgent } from '../../src/common/types/detectedAgent';
import type { McpTransportType } from '../../src/process/services/mcpServices/McpProtocol';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

type ChannelHandler = (...args: unknown[]) => unknown;

const handlers: Record<string, ChannelHandler> = {};
function makeChannel(name: string) {
  return {
    provider: vi.fn((fn: ChannelHandler) => {
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
      getModelInfo: makeChannel('getModelInfo'),
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
vi.mock('../../src/process/task/AcpAgentManager', () => ({ default: vi.fn() }));
vi.mock('../../src/process/task/GeminiAgentManager', () => ({ GeminiAgentManager: vi.fn() }));

vi.mock('../../src/process/services/mcpServices/McpService', () => ({
  mcpService: { getSupportedTransportsForAgent: vi.fn(() => []) },
}));

vi.mock('../../src/process/agent/aionrs/binaryResolver', () => ({
  detectAionrs: vi.fn(() => ({ available: false, path: null })),
}));

vi.mock('../../src/process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
}));

import { initAcpConversationBridge } from '../../src/process/bridge/acpConversationBridge';
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
      { backend: 'claude', name: 'Claude', kind: 'acp', available: true, cliPath: '/usr/bin/claude' },
      {
        backend: 'aionrs',
        name: 'Aion CLI',
        kind: 'aionrs',
        available: true,
        cliPath: '/usr/local/bin/aionrs',
        version: 'aionrs 0.1.0',
      },
    ] as DetectedAgent[]);

    const { mcpService } = await import('../../src/process/services/mcpServices/McpService');
    vi.mocked(mcpService.getSupportedTransportsForAgent).mockReturnValue(['stdio'] as McpTransportType[]);

    const result = await handlers['getAvailableAgents']();
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({ backend: 'claude', available: true, cliPath: '/usr/bin/claude' });
    expect(result.data[0].supportedTransports).toEqual(['stdio']);
    expect(result.data[1]).toMatchObject({
      backend: 'aionrs',
      available: true,
      cliPath: '/usr/local/bin/aionrs',
      version: 'aionrs 0.1.0',
    });
  });

  it('getAvailableAgents returns error when registry throws', async () => {
    const { agentRegistry } = await import('../../src/process/agent/AgentRegistry');
    vi.mocked(agentRegistry.getDetectedAgents).mockImplementation(() => {
      throw new Error('detection failed');
    });

    const result = await handlers['getAvailableAgents']();
    expect(result).toEqual({ success: false, msg: 'detection failed' });
  });
});
