import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

const handlers: Record<string, (...args: any[]) => any> = {};
const hoisted = vi.hoisted(() => ({
  conversationListChangedEmit: vi.fn(),
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
    conversation: {
      listChanged: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          handlers['conversation.listChanged'] = fn;
        }),
        emit: hoisted.conversationListChangedEmit,
        invoke: vi.fn(),
      },
    },
    acpConversation: {
      checkEnv: makeChannel('checkEnv'),
      detectCliPath: makeChannel('detectCliPath'),
      getAvailableAgents: makeChannel('getAvailableAgents'),
      listExternalSessions: makeChannel('listExternalSessions'),
      importExternalSession: makeChannel('importExternalSession'),
      refreshCustomAgents: makeChannel('refreshCustomAgents'),
      checkAgentHealth: makeChannel('checkAgentHealth'),
      getMode: makeChannel('getMode'),
      getModelInfo: makeChannel('getModelInfo'),
      probeModelInfo: makeChannel('probeModelInfo'),
      setModel: makeChannel('setModel'),
      setMode: makeChannel('setMode'),
      getConfigOptions: makeChannel('getConfigOptions'),
      setConfigOption: makeChannel('setConfigOption'),
    },
  },
}));

vi.mock('../../src/process/agent/acp/AcpDetector', () => ({
  acpDetector: { getDetectedAgents: vi.fn(() => []), refreshCustomAgents: vi.fn(async () => {}) },
}));

vi.mock('../../src/process/agent/acp/AcpConnection', () => ({
  AcpConnection: vi.fn(() => ({
    connect: vi.fn(async () => {}),
    newSession: vi.fn(async () => {}),
    sendPrompt: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    getConfigOptions: vi.fn(() => []),
    getModels: vi.fn(() => []),
    getInitializeResponse: vi.fn(() => null),
  })),
}));

vi.mock('../../src/process/agent/acp/modelInfo', () => ({
  buildAcpModelInfo: vi.fn(() => ({})),
  summarizeAcpModelInfo: vi.fn(() => ({})),
}));

vi.mock('../../src/process/agent/codex/connection/CodexConnection', () => ({
  CodexConnection: vi.fn(() => ({
    start: vi.fn(async () => {}),
    waitForServerReady: vi.fn(async () => {}),
    ping: vi.fn(async () => true),
    stop: vi.fn(async () => {}),
  })),
}));

vi.mock('../../src/process/task/AcpAgentManager', () => ({ default: class AcpAgentManager {} }));
vi.mock('../../src/process/task/CodexAgentManager', () => ({ default: class CodexAgentManager {} }));
vi.mock('../../src/process/task/GeminiAgentManager', () => ({ GeminiAgentManager: class GeminiAgentManager {} }));

vi.mock('../../src/process/services/mcpServices/McpService', () => ({
  mcpService: { getSupportedTransportsForAgent: vi.fn(() => []) },
}));

vi.mock('../../src/process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
}));

vi.mock('../../src/process/utils/tray', () => ({
  refreshTrayMenu: vi.fn(async () => {}),
}));

const listSessionsMock = vi.fn(async () => []);
const importSessionMock = vi.fn(async () => ({
  id: 'imported-conversation',
  type: 'acp',
  source: 'aionui',
  name: 'Imported',
  extra: { backend: 'codex', workspace: '/tmp/project', customWorkspace: true, acpSessionId: 'session-1' },
  createTime: Date.now(),
  modifyTime: Date.now(),
}));

vi.mock('../../src/process/bridge/services/ExternalSessionDiscoveryService', () => ({
  ExternalSessionDiscoveryService: vi.fn(function ExternalSessionDiscoveryService() {
    return {
      listSessions: listSessionsMock,
      importSession: importSessionMock,
    };
  }),
}));

import { initAcpConversationBridge } from '../../src/process/bridge/acpConversationBridge';
import type { IConversationService } from '../../src/process/services/IConversationService';
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
  let conversationService: IConversationService;

  beforeEach(() => {
    vi.clearAllMocks();
    taskManager = makeTaskManager();
    conversationService = {
      createConversation: vi.fn(),
      deleteConversation: vi.fn(),
      updateConversation: vi.fn(),
      getConversation: vi.fn(),
      createWithMigration: vi.fn(),
      listAllConversations: vi.fn(),
    };
    initAcpConversationBridge(taskManager, conversationService);
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

  it('returns discovered external sessions through the bridge', async () => {
    listSessionsMock.mockResolvedValue([
      {
        provider: 'codex',
        sessionId: 'session-1',
        title: 'Resume me',
        workspace: '/tmp/project',
        updatedAt: 123,
      },
    ]);

    const result = await handlers['listExternalSessions']({});

    expect(result).toEqual({
      success: true,
      data: {
        sessions: [
          {
            provider: 'codex',
            sessionId: 'session-1',
            title: 'Resume me',
            workspace: '/tmp/project',
            updatedAt: 123,
          },
        ],
      },
    });
  });

  it('imports an external session and emits a conversation list update', async () => {
    const result = await handlers['importExternalSession']({ provider: 'codex', sessionId: 'session-1' });

    expect(importSessionMock).toHaveBeenCalledWith({ provider: 'codex', sessionId: 'session-1' });
    expect(result.success).toBe(true);
    expect(hoisted.conversationListChangedEmit).toHaveBeenCalledWith({
      conversationId: 'imported-conversation',
      action: 'created',
      source: 'aionui',
    });
  });
});
