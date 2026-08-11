import { describe, expect, it, vi } from 'vitest';
import { CodexThreadSession } from '@/process/agent/codex/appserver/CodexThreadSession';
import type { CodexJsonRpcNotification } from '@/process/agent/codex/appserver/types';

const workspaceWriteSandboxPolicy = {
  type: 'workspaceWrite',
  writableRoots: [],
  readOnlyAccess: { type: 'fullAccess' },
  networkAccess: false,
  excludeTmpdirEnvVar: false,
  excludeSlashTmp: false,
};

const dangerFullAccessSandboxPolicy = { type: 'dangerFullAccess' };

function createNotificationHarness(): {
  onNotification: (handler: (notification: CodexJsonRpcNotification) => void) => () => void;
  emitNotification: (notification: CodexJsonRpcNotification) => void;
  listenerCount: () => number;
} {
  const listeners: ((notification: CodexJsonRpcNotification) => void)[] = [];
  return {
    onNotification: (handler) => {
      listeners.push(handler);
      return () => {
        const index = listeners.indexOf(handler);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    emitNotification: (notification) => {
      for (const listener of listeners) {
        listener(notification);
      }
    },
    listenerCount: () => listeners.length,
  };
}

function createFailureHarness(): {
  onFailure: (handler: (error: Error) => void) => () => void;
  emitFailure: (error: Error) => void;
  listenerCount: () => number;
} {
  const listeners: ((error: Error) => void)[] = [];
  return {
    onFailure: (handler) => {
      listeners.push(handler);
      return () => {
        const index = listeners.indexOf(handler);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    emitFailure: (error) => {
      for (const listener of listeners) {
        listener(error);
      }
    },
    listenerCount: () => listeners.length,
  };
}

describe('CodexThreadSession', () => {
  it('starts a thread, starts a turn, and emits translated messages', async () => {
    const notifications = createNotificationHarness();
    const failures = createFailureHarness();
    const request = vi
      .fn()
      .mockResolvedValueOnce({ thread: { id: 'thread-1' } })
      .mockResolvedValueOnce({ turn: { id: 'turn-1' } });
    const messages: unknown[] = [];
    const session = new CodexThreadSession({
      client: {
        request,
        onNotification: notifications.onNotification,
        onFailure: failures.onFailure,
        onServerRequest: vi.fn(),
      },
      options: {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        approvalPolicy: 'on-request',
        sandboxPolicy: 'workspace-write',
      },
      emitMessage: (message) => messages.push(message),
      emitConfirmation: vi.fn(),
      persistConversationExtra: vi.fn(),
    });

    await session.start();
    const turnPromise = session.startTurn({ content: 'hello', msgId: 'user-1' });
    await new Promise((resolve) => setImmediate(resolve));
    notifications.emitNotification({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
    });
    await turnPromise;

    expect(request).toHaveBeenNthCalledWith(1, 'thread/start', expect.objectContaining({ cwd: '/workspace' }));
    expect(request).toHaveBeenNthCalledWith(
      2,
      'turn/start',
      expect.objectContaining({
        threadId: 'thread-1',
        sandboxPolicy: workspaceWriteSandboxPolicy,
      })
    );
    expect(messages).toContainEqual(expect.objectContaining({ type: 'start', conversation_id: 'conversation-1' }));
    expect(messages).toContainEqual(expect.objectContaining({ type: 'finish', conversation_id: 'conversation-1' }));
  });

  it('sends current model, effort, and permission settings with each turn', async () => {
    const notifications = createNotificationHarness();
    const failures = createFailureHarness();
    const request = vi
      .fn()
      .mockResolvedValueOnce({ thread: { id: 'thread-1' } })
      .mockResolvedValueOnce({ turn: { id: 'turn-1' } })
      .mockResolvedValueOnce({ turn: { id: 'turn-2' } });
    const session = new CodexThreadSession({
      client: {
        request,
        onNotification: notifications.onNotification,
        onFailure: failures.onFailure,
        onServerRequest: vi.fn(),
      },
      options: {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        approvalPolicy: 'on-request',
        sandboxPolicy: 'workspace-write',
        model: 'gpt-5.5',
        reasoningEffort: 'high',
      },
      emitMessage: vi.fn(),
      emitConfirmation: vi.fn(),
      persistConversationExtra: vi.fn(),
    });

    await session.start();
    const firstTurn = session.startTurn({ content: 'hello', msgId: 'user-1' });
    await new Promise((resolve) => setImmediate(resolve));
    notifications.emitNotification({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
    });
    await firstTurn;

    session.updateRuntimeConfig({
      model: 'gpt-5.4',
      reasoningEffort: 'xhigh',
      approvalPolicy: 'never',
      sandboxPolicy: 'danger-full-access',
    });
    const secondTurn = session.startTurn({ content: 'again', msgId: 'user-2' });
    await new Promise((resolve) => setImmediate(resolve));
    notifications.emitNotification({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-2' } },
    });
    await secondTurn;

    expect(request).toHaveBeenNthCalledWith(
      2,
      'turn/start',
      expect.objectContaining({
        threadId: 'thread-1',
        model: 'gpt-5.5',
        effort: 'high',
        approvalPolicy: 'on-request',
        sandboxPolicy: workspaceWriteSandboxPolicy,
      })
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      'turn/start',
      expect.objectContaining({
        threadId: 'thread-1',
        model: 'gpt-5.4',
        effort: 'xhigh',
        approvalPolicy: 'never',
        sandboxPolicy: dangerFullAccessSandboxPolicy,
      })
    );
  });

  it('persists official nested native context usage metadata from notifications', async () => {
    const notifications = createNotificationHarness();
    const failures = createFailureHarness();
    const request = vi.fn().mockResolvedValueOnce({ thread: { id: 'thread-1' } });
    const persistConversationExtra = vi.fn().mockResolvedValue(undefined);
    const session = new CodexThreadSession({
      client: {
        request,
        onNotification: notifications.onNotification,
        onFailure: failures.onFailure,
        onServerRequest: vi.fn(),
      },
      options: {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        approvalPolicy: 'on-request',
        sandboxPolicy: 'workspace-write',
      },
      emitMessage: vi.fn(),
      emitConfirmation: vi.fn(),
      persistConversationExtra,
    });

    await session.start();
    notifications.emitNotification({
      jsonrpc: '2.0',
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        tokenUsage: {
          total: { totalTokens: 1_100_000 },
          last: { totalTokens: 80_000 },
          modelContextWindow: 128000,
        },
      },
    });

    expect(persistConversationExtra).toHaveBeenLastCalledWith({
      lastTokenUsage: { totalTokens: 80_000 },
      lastContextLimit: 128000,
    });
  });

  it('persists zero token usage metadata when notification fields are missing', async () => {
    const notifications = createNotificationHarness();
    const failures = createFailureHarness();
    const request = vi.fn().mockResolvedValueOnce({ thread: { id: 'thread-1' } });
    const persistConversationExtra = vi.fn().mockResolvedValue(undefined);
    const session = new CodexThreadSession({
      client: {
        request,
        onNotification: notifications.onNotification,
        onFailure: failures.onFailure,
        onServerRequest: vi.fn(),
      },
      options: {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        approvalPolicy: 'on-request',
        sandboxPolicy: 'workspace-write',
      },
      emitMessage: vi.fn(),
      emitConfirmation: vi.fn(),
      persistConversationExtra,
    });

    await session.start();
    notifications.emitNotification({
      jsonrpc: '2.0',
      method: 'thread/tokenUsage/updated',
      params: {},
    });

    expect(persistConversationExtra).toHaveBeenLastCalledWith({
      lastTokenUsage: { totalTokens: 0 },
      lastContextLimit: 0,
    });
  });

  it('does not retain duplicate notification listeners after thread start fails and is retried', async () => {
    const notifications = createNotificationHarness();
    const failures = createFailureHarness();
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('thread start failed'))
      .mockResolvedValueOnce({ thread: { id: 'thread-1' } });
    const messages: unknown[] = [];
    const session = new CodexThreadSession({
      client: {
        request,
        onNotification: notifications.onNotification,
        onFailure: failures.onFailure,
        onServerRequest: vi.fn(),
      },
      options: {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        approvalPolicy: 'on-request',
        sandboxPolicy: 'workspace-write',
      },
      emitMessage: (message) => messages.push(message),
      emitConfirmation: vi.fn(),
      persistConversationExtra: vi.fn(),
    });

    await expect(session.start()).rejects.toThrow('thread start failed');
    expect(notifications.listenerCount()).toBe(0);

    await session.start();
    expect(notifications.listenerCount()).toBe(1);

    notifications.emitNotification({
      jsonrpc: '2.0',
      method: 'item/agentMessage/delta',
      params: { itemId: 'agent-1', delta: 'hello' },
    });

    expect(messages).toEqual([
      expect.objectContaining({
        type: 'content',
        msg_id: 'agent-1',
        data: { content: 'hello' },
      }),
    ]);
  });

  it('does not retain duplicate listeners after client failure and restart', async () => {
    const notifications = createNotificationHarness();
    const failures = createFailureHarness();
    const request = vi
      .fn()
      .mockResolvedValueOnce({ thread: { id: 'thread-1' } })
      .mockResolvedValueOnce({});
    const session = new CodexThreadSession({
      client: {
        request,
        onNotification: notifications.onNotification,
        onFailure: failures.onFailure,
        onServerRequest: vi.fn(),
      },
      options: {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        approvalPolicy: 'on-request',
        sandboxPolicy: 'workspace-write',
      },
      emitMessage: vi.fn(),
      emitConfirmation: vi.fn(),
      persistConversationExtra: vi.fn(),
    });

    await session.start();
    expect(notifications.listenerCount()).toBe(1);
    expect(failures.listenerCount()).toBe(1);

    failures.emitFailure(new Error('app-server crashed'));
    await session.start();

    expect(notifications.listenerCount()).toBe(1);
    expect(failures.listenerCount()).toBe(1);
    expect(request).toHaveBeenNthCalledWith(2, 'thread/resume', {
      threadId: 'thread-1',
      cwd: '/workspace',
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
    });
  });

  it('keeps a turn running until the active turn emits official nested turn/completed params', async () => {
    const notifications = createNotificationHarness();
    const failures = createFailureHarness();
    const request = vi
      .fn()
      .mockResolvedValueOnce({ thread: { id: 'thread-1' } })
      .mockResolvedValueOnce({ turn: { id: 'turn-1' } });
    const messages: unknown[] = [];
    const session = new CodexThreadSession({
      client: {
        request,
        onNotification: notifications.onNotification,
        onFailure: failures.onFailure,
        onServerRequest: vi.fn(),
      },
      options: {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        approvalPolicy: 'on-request',
        sandboxPolicy: 'workspace-write',
      },
      emitMessage: (message) => messages.push(message),
      emitConfirmation: vi.fn(),
      persistConversationExtra: vi.fn(),
    });

    await session.start();
    let resolved = false;
    const turnPromise = session.startTurn({ content: 'hello', msgId: 'user-1' }).then(() => {
      resolved = true;
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(resolved).toBe(false);
    notifications.emitNotification({
      jsonrpc: '2.0',
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'agent-1', delta: 'hello' },
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(resolved).toBe(false);

    notifications.emitNotification({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
    });
    await turnPromise;

    expect(resolved).toBe(true);
    expect(messages).toContainEqual(expect.objectContaining({ type: 'finish' }));
  });

  it('also accepts legacy top-level turnId completion params', async () => {
    const notifications = createNotificationHarness();
    const failures = createFailureHarness();
    const request = vi
      .fn()
      .mockResolvedValueOnce({ thread: { id: 'thread-1' } })
      .mockResolvedValueOnce({ turn: { id: 'turn-1' } });
    const session = new CodexThreadSession({
      client: {
        request,
        onNotification: notifications.onNotification,
        onFailure: failures.onFailure,
        onServerRequest: vi.fn(),
      },
      options: {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        approvalPolicy: 'on-request',
        sandboxPolicy: 'workspace-write',
      },
      emitMessage: vi.fn(),
      emitConfirmation: vi.fn(),
      persistConversationExtra: vi.fn(),
    });

    await session.start();
    const turnPromise = session.startTurn({ content: 'hello', msgId: 'user-1' });
    await new Promise((resolve) => setImmediate(resolve));

    notifications.emitNotification({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { threadId: 'thread-1', turnId: 'turn-1' },
    });

    await turnPromise;
  });

  it('rejects a failed turn with the final structured provider error', async () => {
    const notifications = createNotificationHarness();
    const failures = createFailureHarness();
    const request = vi
      .fn()
      .mockResolvedValueOnce({ thread: { id: 'thread-1' } })
      .mockResolvedValueOnce({ turn: { id: 'turn-1' } });
    const session = new CodexThreadSession({
      client: {
        request,
        onNotification: notifications.onNotification,
        onFailure: failures.onFailure,
        onServerRequest: vi.fn(),
      },
      options: {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        approvalPolicy: 'on-request',
        sandboxPolicy: 'workspace-write',
        model: 'provider-model',
      },
      emitMessage: vi.fn(),
      emitConfirmation: vi.fn(),
      persistConversationExtra: vi.fn(),
    });

    await session.start();
    const turnPromise = session.startTurn({ content: 'hello', msgId: 'user-1' });
    await new Promise((resolve) => setImmediate(resolve));
    notifications.emitNotification({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: {
          id: 'turn-1',
          status: 'failed',
          error: {
            message: 'Model "provider-model" is not supported by the configured account',
            codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 404 } },
            additionalDetails: 'request id: request-1',
          },
        },
      },
    });

    await expect(turnPromise).rejects.toMatchObject({
      message: expect.stringContaining('request id: request-1'),
      kind: 'model_unavailable',
      httpStatusCode: 404,
    });
  });

  it('resumes an existing thread and interrupts the active turn', async () => {
    const notifications = createNotificationHarness();
    const failures = createFailureHarness();
    const request = vi
      .fn()
      .mockResolvedValueOnce({ threadId: 'thread-existing' })
      .mockResolvedValueOnce({ turnId: 'turn-existing' })
      .mockResolvedValueOnce({ interrupted: true });
    const session = new CodexThreadSession({
      client: {
        request,
        onNotification: notifications.onNotification,
        onFailure: failures.onFailure,
        onServerRequest: vi.fn(),
      },
      options: {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        threadId: 'thread-existing',
        approvalPolicy: 'on-request',
        sandboxPolicy: 'workspace-write',
        model: 'gpt-5.6-sol',
      },
      emitMessage: vi.fn(),
      emitConfirmation: vi.fn(),
      persistConversationExtra: vi.fn(),
    });

    await session.start();
    const turnPromise = session.startTurn({ content: 'hello', msgId: 'user-1' });
    await new Promise((resolve) => setImmediate(resolve));
    await session.interrupt();
    await turnPromise;

    expect(request).toHaveBeenNthCalledWith(1, 'thread/resume', {
      threadId: 'thread-existing',
      cwd: '/workspace',
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      model: 'gpt-5.6-sol',
    });
    expect(request).toHaveBeenNthCalledWith(2, 'turn/start', expect.objectContaining({ threadId: 'thread-existing' }));
    expect(request).toHaveBeenNthCalledWith(3, 'turn/interrupt', {
      threadId: 'thread-existing',
      turnId: 'turn-existing',
    });
  });

  it('rejects a concurrent turn before the first turn/start response resolves', async () => {
    const notifications = createNotificationHarness();
    const failures = createFailureHarness();
    let resolveTurnStart: (value: { turn: { id: string } }) => void = () => {};
    const firstTurnStart = new Promise<{ turn: { id: string } }>((resolve) => {
      resolveTurnStart = resolve;
    });
    let turnStartCount = 0;
    const request = vi.fn((method: string) => {
      if (method === 'thread/start') return Promise.resolve({ thread: { id: 'thread-1' } });
      if (method === 'turn/start') {
        turnStartCount += 1;
        if (turnStartCount === 1) return firstTurnStart;
        return Promise.reject(new Error('duplicate turn/start reached client'));
      }
      return Promise.reject(new Error(`Unexpected method: ${method}`));
    });
    const session = new CodexThreadSession({
      client: {
        request,
        onNotification: notifications.onNotification,
        onFailure: failures.onFailure,
        onServerRequest: vi.fn(),
      },
      options: {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        approvalPolicy: 'on-request',
        sandboxPolicy: 'workspace-write',
      },
      emitMessage: vi.fn(),
      emitConfirmation: vi.fn(),
      persistConversationExtra: vi.fn(),
    });

    await session.start();
    const firstTurn = session.startTurn({ content: 'hello', msgId: 'user-1' });
    await new Promise((resolve) => setImmediate(resolve));

    await expect(session.startTurn({ content: 'second', msgId: 'user-2' })).rejects.toThrow(
      'Cannot start a new Codex turn while another turn is running'
    );
    expect(request.mock.calls.filter(([method]) => method === 'turn/start')).toHaveLength(1);

    resolveTurnStart({ turn: { id: 'turn-1' } });
    await new Promise((resolve) => setImmediate(resolve));
    notifications.emitNotification({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
    });
    await firstTurn;
  });

  it('rejects the active turn when the client fails before turn completion', async () => {
    const notifications = createNotificationHarness();
    const failures = createFailureHarness();
    const request = vi
      .fn()
      .mockResolvedValueOnce({ thread: { id: 'thread-1' } })
      .mockResolvedValueOnce({ turn: { id: 'turn-1' } });
    const session = new CodexThreadSession({
      client: {
        request,
        onNotification: notifications.onNotification,
        onFailure: failures.onFailure,
        onServerRequest: vi.fn(),
      },
      options: {
        conversationId: 'conversation-1',
        workspace: '/workspace',
        approvalPolicy: 'on-request',
        sandboxPolicy: 'workspace-write',
      },
      emitMessage: vi.fn(),
      emitConfirmation: vi.fn(),
      persistConversationExtra: vi.fn(),
    });

    await session.start();
    const turnPromise = session.startTurn({ content: 'hello', msgId: 'user-1' });
    await new Promise((resolve) => setImmediate(resolve));

    failures.emitFailure(new Error('app-server crashed'));

    await expect(turnPromise).rejects.toThrow('app-server crashed');
  });
});
