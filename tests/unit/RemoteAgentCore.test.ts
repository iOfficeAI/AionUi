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

  describe('handleConnectError', () => {
    it('emits error message with connection error details', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleConnectError'](new Error('ECONNREFUSED'));

      expect(config.onStreamEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', data: 'Connection error: ECONNREFUSED' })
      );
    });
  });

  describe('handleClose', () => {
    it('delegates to handleDisconnect with reason', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleClose'](1006, 'abnormal closure');

      expect(config.onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent_status' }));
      expect(config.onStreamEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', data: expect.stringContaining('abnormal closure') })
      );
    });
  });

  describe('handleHelloOk', () => {
    it('is a no-op that does not throw', () => {
      const core = new RemoteAgentCore(makeConfig());
      expect(() => core['handleHelloOk']({} as never)).not.toThrow();
    });
  });

  describe('persistDeviceToken', () => {
    it('persists device token to database', async () => {
      const { core } = createConnectedCore();
      const { getDatabase } = await import('../../src/process/services/database');
      const db = await (getDatabase as ReturnType<typeof vi.fn>)();

      core['persistDeviceToken']('new-token');

      // Wait for async promise chain
      await new Promise((r) => setTimeout(r, 10));
      expect(db.updateRemoteAgent).toHaveBeenCalledWith('agent-1', { device_token: 'new-token' });
    });
  });

  describe('fetchAndEmitHistoryFallback', () => {
    it('fetches chat history and emits last assistant message', async () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      mockConnection.chatHistory.mockResolvedValueOnce({
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'Hello there!' },
        ],
      });

      core['fetchAndEmitHistoryFallback']('run-1');

      await new Promise((r) => setTimeout(r, 10));

      expect(config.onStreamEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'content', data: 'Hello there!' })
      );
      // Should also emit finish
      expect(config.onSignalEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'finish' }));
    });

    it('handles empty history gracefully', async () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;
      mockConnection.chatHistory.mockResolvedValueOnce({ messages: [] });

      core['fetchAndEmitHistoryFallback']('run-1');

      await new Promise((r) => setTimeout(r, 10));

      // Should still emit finish
      expect(config.onSignalEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'finish' }));
    });

    it('handles chatHistory failure gracefully', async () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;
      mockConnection.chatHistory.mockRejectedValueOnce(new Error('network'));

      core['fetchAndEmitHistoryFallback']('run-1');

      await new Promise((r) => setTimeout(r, 10));

      // Should still emit finish
      expect(config.onSignalEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'finish' }));
    });

    it('emits finish immediately when no session key', () => {
      const cfg = makeConfig();
      const core = new RemoteAgentCore(cfg);
      // connection is null, no sessionKey
      core['connection'] = { sessionKey: null } as never;

      core['fetchAndEmitHistoryFallback']('run-1');

      expect(cfg.onSignalEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'finish' }));
    });
  });

  describe('handleAgentEvent – tool_call stream', () => {
    it('converts tool start event and emits via adapter', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;
      const mockMessages = [
        {
          id: 't1',
          msg_id: 't1',
          conversation_id: 'conv-1',
          type: 'acp_tool_call',
          position: 'left',
          createdAt: Date.now(),
          content: { title: 'ReadFile', status: 'in_progress' },
        },
      ];
      core['adapter'].convertSessionUpdate = vi.fn(() => mockMessages) as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: {
          stream: 'tool_call',
          data: { phase: 'start', name: 'ReadFile', toolCallId: 'tc-1' },
          sessionKey: 'session-1',
        },
      });

      expect(core['adapter'].convertSessionUpdate).toHaveBeenCalled();
    });

    it('sets status to failed for result phase with isError', () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;
      core['adapter'].convertSessionUpdate = vi.fn(() => []) as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: {
          stream: 'tool',
          data: { phase: 'result', name: 'Bash', isError: true, toolCallId: 'tc-2' },
          sessionKey: 'session-1',
        },
      });

      const call = (core['adapter'].convertSessionUpdate as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.update.status).toBe('failed');
    });

    it('sets status to completed for result phase without error', () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;
      core['adapter'].convertSessionUpdate = vi.fn(() => []) as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: {
          stream: 'tool',
          data: { phase: 'result', name: 'ReadFile', isError: false, toolCallId: 'tc-3' },
          sessionKey: 'session-1',
        },
      });

      const call = (core['adapter'].convertSessionUpdate as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.update.status).toBe('completed');
    });

    it('uses meta as content when provided', () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;
      core['adapter'].convertSessionUpdate = vi.fn(() => []) as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: {
          stream: 'tool',
          data: { phase: 'start', name: 'Bash', meta: 'ls -la', toolCallId: 'tc-4' },
          sessionKey: 'session-1',
        },
      });

      const call = (core['adapter'].convertSessionUpdate as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.update.content).toEqual([{ type: 'content', content: { type: 'text', text: 'ls -la' } }]);
    });

    it('uses args as content when no meta', () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;
      core['adapter'].convertSessionUpdate = vi.fn(() => []) as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: {
          stream: 'tool',
          data: { phase: 'start', name: 'Edit', args: { file: 'a.ts' }, toolCallId: 'tc-5' },
          sessionKey: 'session-1',
        },
      });

      const call = (core['adapter'].convertSessionUpdate as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.update.content[0].content.text).toContain('a.ts');
    });

    it('skips tool event with no data', () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;
      core['adapter'].convertSessionUpdate = vi.fn(() => []) as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: { stream: 'tool', data: null, sessionKey: 'session-1' },
      });

      expect(core['adapter'].convertSessionUpdate).not.toHaveBeenCalled();
    });
  });

  describe('handleAgentEvent – thinking with text fallback', () => {
    it('uses text field when delta is missing', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: { stream: 'thought', data: { text: 'thinking hard' }, sessionKey: 'session-1' },
      });

      expect(config.onSignalEvent).toHaveBeenCalledWith(
        expect.objectContaining({ data: { subject: 'Thinking', description: 'thinking hard' } })
      );
    });

    it('skips thinking event with no delta or text', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: { stream: 'thinking', data: {}, sessionKey: 'session-1' },
      });

      expect(config.onSignalEvent).not.toHaveBeenCalled();
    });

    it('skips thinking event with null data', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: { stream: 'thinking', data: null, sessionKey: 'session-1' },
      });

      expect(config.onSignalEvent).not.toHaveBeenCalled();
    });
  });

  describe('handleAgentEvent – lifecycle and unknown streams', () => {
    it('ignores lifecycle events', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: { stream: 'lifecycle', data: { phase: 'start' }, sessionKey: 'session-1' },
      });

      expect(config.onStreamEvent).not.toHaveBeenCalled();
      expect(config.onSignalEvent).not.toHaveBeenCalled();
    });

    it('warns on unknown agent stream', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: { stream: 'unknown_stream', data: {}, sessionKey: 'session-1' },
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unhandled agent stream'),
        'unknown_stream',
        expect.anything()
      );
      warnSpy.mockRestore();
    });
  });

  describe('emitMessage – additional types', () => {
    it('routes acp_tool_call message type', () => {
      const { core, config } = createConnectedCore();

      core['emitMessage']({
        id: 'm1',
        msg_id: 'm1',
        conversation_id: 'conv-1',
        type: 'acp_tool_call',
        position: 'left',
        createdAt: Date.now(),
        content: { title: 'Bash', status: 'in_progress' },
      } as never);

      expect(config.onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'acp_tool_call' }));
    });

    it('routes plan message type', () => {
      const { core, config } = createConnectedCore();

      core['emitMessage']({
        id: 'm1',
        msg_id: 'm1',
        conversation_id: 'conv-1',
        type: 'plan',
        position: 'left',
        createdAt: Date.now(),
        content: { steps: [] },
      } as never);

      expect(config.onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'plan' }));
    });

    it('routes tool_group message type', () => {
      const { core, config } = createConnectedCore();

      core['emitMessage']({
        id: 'm1',
        msg_id: 'm1',
        conversation_id: 'conv-1',
        type: 'tool_group',
        position: 'left',
        createdAt: Date.now(),
        content: { tools: [] },
      } as never);

      expect(config.onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'tool_group' }));
    });

    it('uses msg_id from message, falls back to id', () => {
      const { core, config } = createConnectedCore();

      core['emitMessage']({
        id: 'fallback-id',
        msg_id: '',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        createdAt: Date.now(),
        content: { content: 'test' },
      } as never);

      expect(config.onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({ msg_id: 'fallback-id' }));
    });
  });

  describe('sendMessage – edge cases', () => {
    it('sends message without files (no file refs prepended)', async () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;

      await core.sendMessage({ content: 'hello' });

      expect(mockConnection.chatSend).toHaveBeenCalledWith(expect.objectContaining({ message: 'hello' }));
    });

    it('sends with empty files array', async () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;

      await core.sendMessage({ content: 'hello', files: [] });

      expect(mockConnection.chatSend).toHaveBeenCalledWith(expect.objectContaining({ message: 'hello' }));
    });
  });

  describe('extractTextFromMessage – edge cases', () => {
    it('returns text from message.text fallback', () => {
      const core = new RemoteAgentCore(makeConfig());
      expect(core['extractTextFromMessage']({ text: 'fallback text' })).toBe('fallback text');
    });

    it('returns null for empty string content', () => {
      const core = new RemoteAgentCore(makeConfig());
      expect(core['extractTextFromMessage']({ content: '' })).toBeNull();
    });

    it('returns null for non-object message', () => {
      const core = new RemoteAgentCore(makeConfig());
      expect(core['extractTextFromMessage']('just a string')).toBeNull();
    });

    it('returns null for null message', () => {
      const core = new RemoteAgentCore(makeConfig());
      expect(core['extractTextFromMessage'](null)).toBeNull();
    });

    it('returns null for array content with no text items', () => {
      const core = new RemoteAgentCore(makeConfig());
      expect(core['extractTextFromMessage']({ content: [{ type: 'image', url: 'x' }] })).toBeNull();
    });
  });

  describe('handleChatEvent – additional edge cases', () => {
    it('uses Unknown error fallback when errorMessage is missing', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 1, state: 'error' },
      });

      expect(config.onStreamEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', data: 'Unknown error' })
      );
    });

    it('handles delta with non-cumulative text (else branch)', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      // First delta sets accumulated text
      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 1, state: 'delta', message: { content: 'Hello' } },
      });

      // Second delta with text that does NOT start with accumulated (non-cumulative)
      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 2, state: 'delta', message: { content: 'World' } },
      });

      const calls = (config.onStreamEvent as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0].data).toBe('Hello');
      expect(calls[1][0].data).toBe('World');
    });

    it('warns on unknown chat state', () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 1, state: 'unknown_state' },
      });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown state'), 'unknown_state');
      warnSpy.mockRestore();
    });

    it('skips empty delta after extraction', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      // Send same content twice → delta should be empty string and skip
      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 1, state: 'delta', message: { content: 'Hello' } },
      });
      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 2, state: 'delta', message: { content: 'Hello' } },
      });

      // Only one content event emitted
      const contentCalls = (config.onStreamEvent as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[0].type === 'content'
      );
      expect(contentCalls).toHaveLength(1);
    });

    it('clears fallback text on delta', () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;

      // Set fallback text via agent event
      core['handleEvent']({
        type: 'event',
        event: 'agent',
        payload: { stream: 'assistant', data: { text: 'fallback' }, sessionKey: 'session-1' },
      });
      expect(core['agentAssistantFallbackText']).toBe('fallback');

      // Delta should clear it
      core['handleEvent']({
        type: 'event',
        event: 'chat',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 1, state: 'delta', message: { content: 'Hi' } },
      });
      expect(core['agentAssistantFallbackText']).toBe('');
    });
  });

  describe('kill', () => {
    it('calls stop without throwing', () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;
      expect(() => core.kill()).not.toThrow();
    });
  });

  describe('resolveSession – double fallback', () => {
    it('falls back to sessionsResolve when reset also fails', async () => {
      const cfg = makeConfig();
      const core = new RemoteAgentCore(cfg);
      core['connection'] = mockConnection as never;
      mockConnection.isConnected = true;
      // No resumeKey → goes to reset path
      mockConnection.sessionsReset.mockRejectedValueOnce(new Error('reset failed'));
      mockConnection.sessionsResolve.mockResolvedValueOnce({ key: 'fallback-resolve-key' });

      await core['resolveSession']();

      expect(mockConnection.sessionKey).toBe('fallback-resolve-key');
    });

    it('falls back to raw key when both reset and resolve fail', async () => {
      const cfg = makeConfig();
      const core = new RemoteAgentCore(cfg);
      core['connection'] = mockConnection as never;
      mockConnection.isConnected = true;
      mockConnection.sessionsReset.mockRejectedValueOnce(new Error('reset failed'));
      mockConnection.sessionsResolve.mockRejectedValueOnce(new Error('resolve failed'));

      await core['resolveSession']();

      expect(mockConnection.sessionKey).toBe('conv-1');
    });
  });

  describe('isFromOtherSession', () => {
    it('returns false when no sessionKey provided', () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;
      expect(core['isFromOtherSession'](undefined)).toBe(false);
    });

    it('returns false when connection has no sessionKey', () => {
      const core = new RemoteAgentCore(makeConfig());
      core['connection'] = { sessionKey: null } as never;
      expect(core['isFromOtherSession']('some-key')).toBe(false);
    });

    it('returns true when keys differ', () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;
      expect(core['isFromOtherSession']('different-session')).toBe(true);
    });

    it('returns false when keys match', () => {
      const { core } = createConnectedCore();
      core['connection'] = mockConnection as never;
      expect(core['isFromOtherSession']('session-1')).toBe(false);
    });
  });

  describe('emitStatusMessage', () => {
    it('reuses the same statusMessageId across calls', () => {
      const { core, config } = createConnectedCore();

      core['emitStatusMessage']('connecting');
      core['emitStatusMessage']('connected');

      const calls = (config.onStreamEvent as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0].msg_id).toBe(calls[1][0].msg_id);
    });
  });

  describe('emitErrorMessage', () => {
    it('uses unique ids for generic errors', () => {
      const { core, config } = createConnectedCore();

      core['emitErrorMessage']('error1');
      core['emitErrorMessage']('error2');

      const calls = (config.onStreamEvent as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0].msg_id).not.toBe(calls[1][0].msg_id);
    });

    it('reuses disconnectTipMessageId for disconnect errors', () => {
      const { core, config } = createConnectedCore();

      core['emitErrorMessage']('disconnected1', 'disconnect');
      core['emitErrorMessage']('disconnected2', 'disconnect');

      const calls = (config.onStreamEvent as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0].msg_id).toBe(calls[1][0].msg_id);
    });
  });

  describe('handleEvent – chat.event alias', () => {
    it('routes chat.event the same as chat', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'chat.event',
        payload: { runId: 'r', sessionKey: 'session-1', seq: 1, state: 'delta', message: { content: 'via alias' } },
      });

      expect(config.onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({ data: 'via alias' }));
    });
  });

  describe('handleEvent – agent.event alias', () => {
    it('routes agent.event the same as agent', () => {
      const { core, config } = createConnectedCore();
      core['connection'] = mockConnection as never;

      core['handleEvent']({
        type: 'event',
        event: 'agent.event',
        payload: { stream: 'thinking', data: { delta: 'via alias' }, sessionKey: 'session-1' },
      });

      expect(config.onSignalEvent).toHaveBeenCalledWith(
        expect.objectContaining({ data: { subject: 'Thinking', description: 'via alias' } })
      );
    });
  });
});
