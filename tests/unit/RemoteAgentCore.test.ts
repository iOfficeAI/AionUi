/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IResponseMessage } from '../../src/common/adapter/ipcBridge';
import type { RemoteAgentCoreConfig } from '../../src/process/agent/remote/RemoteAgentCore';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockConnection = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  isConnected: false,
  sessionKey: null as string | null,
  chatSend: vi.fn().mockResolvedValue(undefined),
  chatHistory: vi.fn().mockResolvedValue({ messages: [] }),
  sessionsResolve: vi.fn().mockResolvedValue({ key: 'resolved-key' }),
  sessionsReset: vi.fn().mockResolvedValue({ key: 'reset-key' }),
}));

const capturedCallbacks = vi.hoisted(() => ({
  onEvent: null as ((evt: unknown) => void) | null,
  onHelloOk: null as ((hello: unknown) => void) | null,
  onConnectError: null as ((err: Error) => void) | null,
  onClose: null as ((code: number, reason: string) => void) | null,
}));

vi.mock('../../src/process/agent/openclaw/OpenClawGatewayConnection', () => ({
  OpenClawGatewayConnection: vi.fn().mockImplementation((opts: Record<string, unknown>) => {
    capturedCallbacks.onEvent = opts.onEvent as typeof capturedCallbacks.onEvent;
    capturedCallbacks.onHelloOk = opts.onHelloOk as typeof capturedCallbacks.onHelloOk;
    capturedCallbacks.onConnectError = opts.onConnectError as typeof capturedCallbacks.onConnectError;
    capturedCallbacks.onClose = opts.onClose as typeof capturedCallbacks.onClose;
    return mockConnection;
  }),
}));

vi.mock('../../src/process/agent/acp/AcpAdapter', () => {
  return {
    AcpAdapter: class {
      resetMessageTracking = vi.fn();
      convertSessionUpdate = vi.fn(() => []);
    },
  };
});

vi.mock('../../src/process/agent/acp/ApprovalStore', () => {
  return {
    AcpApprovalStore: class {
      clear = vi.fn();
    },
  };
});

vi.mock('../../src/common/utils', () => {
  let counter = 0;
  return { uuid: () => `uuid-${++counter}` };
});

vi.mock('../../src/common/types/acpTypes', () => ({
  AcpErrorType: { UNKNOWN: 'unknown' },
  createAcpError: (type: string, msg: string, retryable: boolean) => ({ type, message: msg, retryable }),
}));

vi.mock('../../src/common/chat/navigation', () => ({
  NavigationInterceptor: {
    isNavigationTool: vi.fn(() => false),
    extractUrl: vi.fn(() => null),
    createPreviewMessage: vi.fn(),
  },
}));

vi.mock('../../src/process/services/database', () => ({
  getDatabase: vi.fn().mockResolvedValue({
    updateRemoteAgent: vi.fn(),
  }),
}));

import { RemoteAgentCore } from '../../src/process/agent/remote/RemoteAgentCore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<RemoteAgentCoreConfig>): RemoteAgentCoreConfig {
  return {
    conversationId: 'conv-1',
    remoteConfig: {
      id: 'agent-1',
      name: 'Test Agent',
      protocol: 'openclaw',
      url: 'wss://example.com',
      authType: 'bearer',
      authToken: 'tok',
      createdAt: 0,
      updatedAt: 0,
    },
    onStreamEvent: vi.fn(),
    onSignalEvent: vi.fn(),
    onSessionKeyUpdate: vi.fn(),
    ...overrides,
  };
}

function createConnectedCore(config?: ReturnType<typeof makeConfig>) {
  const cfg = config ?? makeConfig();
  const core = new RemoteAgentCore(cfg);
  // Simulate connected state
  mockConnection.isConnected = true;
  mockConnection.sessionKey = 'session-1';
  return { core, config: cfg };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RemoteAgentCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnection.isConnected = false;
    mockConnection.sessionKey = null;
    capturedCallbacks.onEvent = null;
    capturedCallbacks.onHelloOk = null;
    capturedCallbacks.onConnectError = null;
    capturedCallbacks.onClose = null;
  });

  // ---- extractTextFromMessage (tested indirectly via handleChatEvent) ----

  describe('handleChatEvent – delta state', () => {
    it('emits content stream for string content message', () => {
      const { core, config } = createConnectedCore();
      // Trigger start to set up connection
      core['connection'] = mockConnection as never;

      capturedCallbacks.onEvent = core['handleEvent'].bind(core);

      capturedCallbacks.onEvent({
        type: 'event',
        event: 'chat',
        payload: {
          runId: 'run-1',
          sessionKey: 'session-1',
          seq: 1,
          state: 'delta',
          message: { content: 'Hello' },
        },
      });

      expect(config.onStreamEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'content',
          conversation_id: 'conv-1',
          data: 'Hello',
        })
      );
    });

    it('emits incremental delta when cumulative text grows', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;
      const handler = core['handleEvent'].bind(core);

      handler({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 1, state: 'delta', message: { content: 'He' } },
      });

      handler({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 2, state: 'delta', message: { content: 'Hello' } },
      });

      const calls = (config.onStreamEvent as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0].data).toBe('He');
      expect(calls[1][0].data).toBe('llo');
    });

    it('extracts text from array content blocks', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: {
          runId: 'r',
          sessionKey: 'session-1',
          seq: 1,
          state: 'delta',
          message: {
            content: [
              { type: 'text', text: 'part1' },
              { type: 'text', text: 'part2' },
            ],
          },
        },
      });

      expect(config.onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({ data: 'part1part2' }));
    });

    it('ignores delta from different session', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'other-session', seq: 1, state: 'delta', message: { content: 'Hi' } },
      });

      expect(config.onStreamEvent).not.toHaveBeenCalled();
    });

    it('skips delta with null/empty message', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 1, state: 'delta', message: null },
      });

      expect(config.onStreamEvent).not.toHaveBeenCalled();
    });
  });

  describe('handleChatEvent – final state', () => {
    it('emits finish signal on final with no message', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      // First send a delta so currentStreamMsgId is set
      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 1, state: 'delta', message: { content: 'Hi' } },
      });

      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 2, state: 'final' },
      });

      expect(config.onSignalEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'finish' }));
    });

    it('emits remaining text on final when finalText > accumulated', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 1, state: 'delta', message: { content: 'He' } },
      });

      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 2, state: 'final', message: { content: 'Hello World' } },
      });

      const streamCalls = (config.onStreamEvent as ReturnType<typeof vi.fn>).mock.calls;
      const lastContent = streamCalls.find((c) => c[0].data === 'llo World');
      expect(lastContent).toBeDefined();
    });

    it('uses agent assistant fallback text when no delta was received', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      // Simulate agent assistant fallback
      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: { stream: 'assistant', data: { text: 'Fallback text' }, sessionKey: 'session-1' },
      });

      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 1, state: 'final' },
      });

      expect(config.onStreamEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'content', data: 'Fallback text' })
      );
    });
  });

  describe('handleChatEvent – error / aborted', () => {
    it('emits error message on error state', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 1, state: 'error', errorMessage: 'boom' },
      });

      expect(config.onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', data: 'boom' }));
    });

    it('emits finish signal on aborted', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 1, state: 'aborted' },
      });

      expect(config.onSignalEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'finish' }));
    });
  });

  describe('handleAgentEvent', () => {
    it('emits thought signal for thinking stream', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: { stream: 'thinking', data: { delta: 'I am thinking...' }, sessionKey: 'session-1' },
      });

      expect(config.onSignalEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'thought',
          data: { subject: 'Thinking', description: 'I am thinking...' },
        })
      );
    });

    it('stores assistant fallback text', () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: { stream: 'assistant', data: { text: 'some fallback' }, sessionKey: 'session-1' },
      });

      expect(core['agentAssistantFallbackText']).toBe('some fallback');
    });

    it('ignores agent events from different session', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: { stream: 'thinking', data: { delta: 'thoughts' }, sessionKey: 'other' },
      });

      expect(config.onSignalEvent).not.toHaveBeenCalled();
    });
  });

  describe('handleEvent – routing', () => {
    it('routes shutdown to handleDisconnect', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({ type: 'event', event: 'shutdown', payload: { reason: 'bye' } });

      expect(config.onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent_status' }));
    });

    it('ignores health and tick events', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({ type: 'event', event: 'health', payload: {} });
      core['handleEvent']({ type: 'event', event: 'tick', payload: {} });

      expect(config.onStreamEvent).not.toHaveBeenCalled();
    });

    it('routes exec.approval.request to handleApprovalRequest', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'exec.approval.request',
        payload: { requestId: 'req-1' },
      });

      expect(config.onSignalEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'acp_permission' }));
    });
  });

  describe('inferToolKind', () => {
    it('returns read for read-like tool names', () => {
      const core = new RemoteAgentCore(makeConfig());
      expect(core['inferToolKind']('ReadFile')).toBe('read');
      expect(core['inferToolKind']('search_code')).toBe('read');
      expect(core['inferToolKind']('Glob')).toBe('read');
      expect(core['inferToolKind']('ListView')).toBe('read');
      expect(core['inferToolKind']('grep')).toBe('read');
    });

    it('returns edit for write-like tool names', () => {
      const core = new RemoteAgentCore(makeConfig());
      expect(core['inferToolKind']('WriteFile')).toBe('edit');
      expect(core['inferToolKind']('Edit')).toBe('edit');
      expect(core['inferToolKind']('CreateFile')).toBe('edit');
      expect(core['inferToolKind']('DeleteDir')).toBe('edit');
      expect(core['inferToolKind']('PatchFile')).toBe('edit');
    });

    it('returns execute for execution tool names', () => {
      const core = new RemoteAgentCore(makeConfig());
      expect(core['inferToolKind']('Bash')).toBe('execute');
      expect(core['inferToolKind']('RunCommand')).toBe('execute');
      expect(core['inferToolKind']('shell_exec')).toBe('execute');
      expect(core['inferToolKind']('Terminal')).toBe('execute');
    });

    it('returns null for unknown tool names', () => {
      const core = new RemoteAgentCore(makeConfig());
      expect(core['inferToolKind']('Agent')).toBeNull();
      expect(core['inferToolKind']('custom_tool')).toBeNull();
    });
  });

  describe('confirmMessage', () => {
    it('resolves pending permission and returns success', () => {
      const core = new RemoteAgentCore(makeConfig());
      const resolveFn = vi.fn();
      core['pendingPermissions'].set('call-1', { resolve: resolveFn, reject: vi.fn() });

      const result = core.confirmMessage({ confirmKey: 'allow_once', callId: 'call-1' });

      expect(result).resolves.toEqual({ success: true, data: null });
      expect(resolveFn).toHaveBeenCalledWith({ optionId: 'allow_once' });
      expect(core['pendingPermissions'].has('call-1')).toBe(false);
    });

    it('returns error when permission not found', async () => {
      const core = new RemoteAgentCore(makeConfig());
      const result = await core.confirmMessage({ confirmKey: 'allow', callId: 'missing' });
      expect(result.success).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('prepends file references to content', async () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;

      await core.sendMessage({ content: 'fix this', files: ['/path/to/file.ts', '/path with spaces/f.ts'] });

      expect(mockConnection.chatSend).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '@/path/to/file.ts @"/path with spaces/f.ts" fix this',
        })
      );
    });

    it('returns error result on connection failure', async () => {
      const core = new RemoteAgentCore(makeConfig());
      // connection is null, start will fail
      mockConnection.isConnected = false;
      core['connection'] = { ...mockConnection, isConnected: false } as never;

      // Force start to throw
      mockConnection.start.mockImplementationOnce(() => {
        throw new Error('refused');
      });

      const result = await core.sendMessage({ content: 'hi' });
      expect(result.success).toBe(false);
    });
  });

  describe('stop', () => {
    it('stops connection, clears state, emits disconnected and finish', async () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;
      core['pendingPermissions'].set('p1', { resolve: vi.fn(), reject: vi.fn() });

      await core.stop();

      expect(mockConnection.stop).toHaveBeenCalled();
      expect(core['connection']).toBeNull();
      expect(core['pendingPermissions'].size).toBe(0);

      expect(config.onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent_status' }));
      expect(config.onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'finish' }));
    });
  });

  describe('resolveSession', () => {
    it('resumes session when resumeKey is provided', async () => {
      const cfg = makeConfig({ sessionKey: 'old-key' });
      const core = new RemoteAgentCore(cfg);
      core['connection'] = mockConnection as never;
      mockConnection.isConnected = true;

      await core['resolveSession']();

      expect(mockConnection.sessionsResolve).toHaveBeenCalledWith({ key: 'old-key' });
      expect(mockConnection.sessionKey).toBe('resolved-key');
    });

    it('falls back to reset when resume fails', async () => {
      const cfg = makeConfig({ sessionKey: 'old-key' });
      const core = new RemoteAgentCore(cfg);
      core['connection'] = mockConnection as never;
      mockConnection.isConnected = true;
      mockConnection.sessionsResolve.mockRejectedValueOnce(new Error('expired'));

      await core['resolveSession']();

      expect(mockConnection.sessionsReset).toHaveBeenCalledWith({ key: 'conv-1', reason: 'new' });
      expect(mockConnection.sessionKey).toBe('reset-key');
    });

    it('calls onSessionKeyUpdate when session key changes', async () => {
      const cfg = makeConfig();
      const core = new RemoteAgentCore(cfg);
      core['connection'] = mockConnection as never;
      mockConnection.isConnected = true;

      await core['resolveSession']();

      expect(cfg.onSessionKeyUpdate).toHaveBeenCalledWith('reset-key');
    });

    it('throws when connection is null', async () => {
      const core = new RemoteAgentCore(makeConfig());
      await expect(core['resolveSession']()).rejects.toThrow('Connection not available');
    });
  });

  describe('getters', () => {
    it('isConnected returns false when no connection', () => {
      const core = new RemoteAgentCore(makeConfig());
      expect(core.isConnected).toBe(false);
    });

    it('isConnected returns connection state', () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;
      expect(core.isConnected).toBe(true);
    });

    it('hasActiveSession returns false without session key', () => {
      const core = new RemoteAgentCore(makeConfig());
      expect(core.hasActiveSession).toBe(false);
    });

    it('currentSessionKey returns null without connection', () => {
      const core = new RemoteAgentCore(makeConfig());
      expect(core.currentSessionKey).toBeNull();
    });
  });

  describe('emitMessage routing', () => {
    it('routes text message type as content', () => {
      const { core, config } = createConnectedCore();

      core['emitMessage']({
        id: 'm1',
        msg_id: 'm1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        createdAt: Date.now(),
        content: { content: 'hello' },
      } as never);

      expect(config.onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'content', data: 'hello' }));
    });

    it('routes agent_status message type', () => {
      const { core, config } = createConnectedCore();

      core['emitMessage']({
        id: 'm1',
        msg_id: 'm1',
        conversation_id: 'conv-1',
        type: 'agent_status',
        position: 'center',
        createdAt: Date.now(),
        content: { backend: 'remote', status: 'connected' },
      } as never);

      expect(config.onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent_status' }));
    });

    it('routes tips message type as error', () => {
      const { core, config } = createConnectedCore();

      core['emitMessage']({
        id: 'm1',
        msg_id: 'm1',
        conversation_id: 'conv-1',
        type: 'tips',
        position: 'center',
        createdAt: Date.now(),
        content: { content: 'something went wrong', type: 'error' },
      } as never);

      expect(config.onStreamEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', data: 'something went wrong' })
      );
    });

    it('does not emit for unknown message types', () => {
      const { core, config } = createConnectedCore();

      core['emitMessage']({
        id: 'm1',
        msg_id: 'm1',
        conversation_id: 'conv-1',
        type: 'unknown_type',
        position: 'center',
        createdAt: Date.now(),
        content: {},
      } as never);

      expect(config.onStreamEvent).not.toHaveBeenCalled();
    });
  });

  describe('handleApprovalRequest', () => {
    it('stores pending permission and emits acp_permission signal with default options', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleApprovalRequest']({ requestId: 'req-42' });

      expect(core['pendingPermissions'].has('req-42')).toBe(true);
      expect(config.onSignalEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'acp_permission',
          data: expect.objectContaining({
            options: expect.arrayContaining([
              expect.objectContaining({ optionId: 'allow_once' }),
              expect.objectContaining({ optionId: 'reject_once' }),
            ]),
          }),
        })
      );
    });

    it('uses provided options when available', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      const customOptions = [{ optionId: 'custom', name: 'Custom', kind: 'custom' }];
      core['handleApprovalRequest']({
        requestId: 'req-99',
        options: customOptions,
        toolCall: { toolCallId: 'tc-1', title: 'Bash' },
      });

      expect(config.onSignalEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ options: customOptions }),
        })
      );
    });
  });

  describe('handleDisconnect', () => {
    it('emits disconnected status, error, finish, and clears state', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;
      core['pendingPermissions'].set('p1', { resolve: vi.fn(), reject: vi.fn() });

      core['handleDisconnect']('server shutdown');

      // Should emit agent_status (disconnected) and error
      const streamCalls = (config.onStreamEvent as ReturnType<typeof vi.fn>).mock.calls;
      expect(streamCalls.some((c) => c[0].type === 'agent_status')).toBe(true);
      expect(streamCalls.some((c) => c[0].type === 'error')).toBe(true);

      // Should emit finish signal
      expect(config.onSignalEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'finish' }));

      // Should clear pending state
      expect(core['pendingPermissions'].size).toBe(0);
    });
  });
});
