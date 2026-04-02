import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSetProcessing, mockAgentSendMessage, mockResponseEmit, streamCallbacks } = vi.hoisted(() => ({
  mockSetProcessing: vi.fn(),
  mockAgentSendMessage: vi.fn(async () => ({ success: true })),
  mockResponseEmit: vi.fn(),
  streamCallbacks: {
    onStreamEvent: undefined as undefined | ((message: any) => void),
    onSignalEvent: undefined as undefined | ((signal: any) => Promise<void>),
  },
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: mockSetProcessing },
}));
vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { getConfig: vi.fn(() => ({})), get: vi.fn(async () => null), set: vi.fn(async () => undefined) },
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: { responseStream: { emit: mockResponseEmit } },
    conversation: {
      confirmation: {
        add: { emit: vi.fn() },
        update: { emit: vi.fn() },
        remove: { emit: vi.fn() },
      },
    },
  },
}));
vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() =>
    Promise.resolve({ updateConversation: vi.fn(), getConversation: vi.fn(() => ({ success: false })) })
  ),
}));
vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  nextTickToLocalFinish: vi.fn((cb: () => void) => cb()),
}));
vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emitAgentMessage: vi.fn(),
  },
}));
vi.mock('@process/utils/previewUtils', () => ({ handlePreviewOpenEvent: vi.fn(() => false) }));
vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: vi.fn(() => ({ getAll: vi.fn(() => []), getAcpAdapters: vi.fn(() => []) })),
  },
}));
vi.mock('@process/agent/acp', () => ({
  AcpAgent: class {
    sendMessage = mockAgentSendMessage;
    start = vi.fn(() => Promise.resolve());
    setMode = vi.fn(() => Promise.resolve());
    setModelByConfigOption = vi.fn(() => Promise.resolve());
    stop = vi.fn();
    kill = vi.fn();
    cancelPrompt = vi.fn();
    getModelInfo = vi.fn(() => null);
    getSessionState = vi.fn(() => null);
    on = vi.fn().mockReturnThis();
    isConnected = true;
    hasActiveSession = true;

    constructor(options: { onStreamEvent?: (message: any) => void; onSignalEvent?: (signal: any) => Promise<void> }) {
      streamCallbacks.onStreamEvent = options.onStreamEvent;
      streamCallbacks.onSignalEvent = options.onSignalEvent;
    }
  },
}));
vi.mock('@process/task/BaseAgentManager', () => ({
  default: class {
    conversation_id = '';
    status: string | undefined;
    workspace = '';
    yoloMode = false;
    protected _lastActivityAt = Date.now();
    get lastActivityAt() {
      return this._lastActivityAt;
    }
    constructor(_type: string, data: Record<string, unknown>, _emitter: unknown) {
      if (data?.conversation_id) this.conversation_id = String(data.conversation_id);
      if (data?.workspace) this.workspace = String(data.workspace);
    }
    isYoloMode() {
      return false;
    }
    addConfirmation() {}
  },
}));
vi.mock('@process/task/IpcAgentEventEmitter', () => ({ IpcAgentEventEmitter: vi.fn() }));
vi.mock('@process/task/CronCommandDetector', () => ({ hasCronCommands: vi.fn(() => false) }));
vi.mock('@process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(() => ''),
  processCronInMessage: vi.fn(),
}));
vi.mock('@process/task/ThinkTagDetector', () => ({
  stripThinkTags: vi.fn((value: string) => value),
  extractAndStripThinkTags: vi.fn((value: string) => ({ thinking: '', content: value })),
}));
vi.mock('@process/utils/initAgent', () => ({ hasNativeSkillSupport: vi.fn(() => true) }));
vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: vi.fn((content: string) => Promise.resolve(content)),
}));
vi.mock('@/common/utils', () => ({ parseError: vi.fn((e: unknown) => e), uuid: vi.fn(() => 'test-uuid') }));
vi.mock('@/common/chat/chatLib', () => ({ transformMessage: vi.fn(() => null) }));

import AcpAgentManager from '@/process/task/AcpAgentManager';
import type { AcpBackend } from '@/common/types/acpTypes';

describe('AcpAgentManager turn lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamCallbacks.onStreamEvent = undefined;
    streamCallbacks.onSignalEvent = undefined;
  });

  it('reconciles a stale running turn after ACP timeout budget is exceeded', async () => {
    const manager = new AcpAgentManager({
      conversation_id: 'conv-test',
      backend: 'claude' as AcpBackend,
      workspace: '/tmp/workspace',
    });

    await manager.sendMessage({
      content: 'hello',
      msg_id: 'msg-1',
    });

    const internals = manager as unknown as {
      activeTurnStartedAt: number | null;
      activeTurnTimeoutMs: number;
      reconcileActiveTurnIfStale: (now?: number) => void;
    };
    const now = Date.now();
    internals.activeTurnStartedAt = now - 20_000;
    internals.activeTurnTimeoutMs = 1_000;

    internals.reconcileActiveTurnIfStale(now);

    expect(manager.status).toBe('finished');
    expect(mockResponseEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'finish',
        conversation_id: 'conv-test',
      })
    );
  });

  it('does not reconcile while the turn is waiting for permission', async () => {
    const manager = new AcpAgentManager({
      conversation_id: 'conv-test',
      backend: 'claude' as AcpBackend,
      workspace: '/tmp/workspace',
    });

    await manager.sendMessage({
      content: 'hello',
      msg_id: 'msg-1',
    });

    await streamCallbacks.onSignalEvent?.({
      type: 'acp_permission',
      conversation_id: 'conv-test',
      msg_id: 'permission-1',
      data: {
        toolCall: {
          title: 'Need permission',
          rawInput: { description: 'Allow tool' },
          toolCallId: 'tool-1',
        },
        options: [],
      },
    });

    const beforeCalls = mockResponseEmit.mock.calls.length;
    const internals = manager as unknown as {
      activeTurnStartedAt: number | null;
      activeTurnTimeoutMs: number;
      reconcileActiveTurnIfStale: (now?: number) => void;
    };
    const now = Date.now();
    internals.activeTurnStartedAt = now - 20_000;
    internals.activeTurnTimeoutMs = 1_000;

    internals.reconcileActiveTurnIfStale(now);

    expect(manager.status).toBe('running');
    expect(mockResponseEmit).toHaveBeenCalledTimes(beforeCalls);
  });

  it('keeps runtime busy until a finish signal arrives', async () => {
    const manager = new AcpAgentManager({
      conversation_id: 'conv-test',
      backend: 'claude' as AcpBackend,
      workspace: '/tmp/workspace',
    });

    expect(manager.status).toBe('finished');

    await manager.sendMessage({
      content: 'hello',
      msg_id: 'msg-1',
    });

    expect(manager.status).toBe('running');
    expect(mockSetProcessing).toHaveBeenCalledWith('conv-test', true);
    expect(streamCallbacks.onStreamEvent).toBeTypeOf('function');
    expect(streamCallbacks.onSignalEvent).toBeTypeOf('function');

    streamCallbacks.onStreamEvent?.({
      type: 'agent_status',
      conversation_id: 'conv-test',
      msg_id: 'status-1',
      data: { status: 'connected' },
    });
    expect(manager.status).toBe('running');

    streamCallbacks.onStreamEvent?.({
      type: 'content',
      conversation_id: 'conv-test',
      msg_id: 'assistant-1',
      data: 'partial response',
    });
    expect(manager.status).toBe('running');

    await streamCallbacks.onSignalEvent?.({
      type: 'finish',
      conversation_id: 'conv-test',
      msg_id: 'finish-1',
      data: null,
    });

    expect(manager.status).toBe('finished');
    expect(mockSetProcessing).toHaveBeenLastCalledWith('conv-test', false);
  });
});
