// tests/integration/process/acp/session/AcpSession.prompt.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcpSession } from '@process/acp/session/AcpSession';
import type {
  AgentConfig,
  SessionCallbacks,
  SessionStatus,
  ConnectorFactory,
  SessionOptions,
} from '@process/acp/types';

function createMockCallbacks(): SessionCallbacks {
  return {
    onMessage: vi.fn(),
    onSessionId: vi.fn(),
    onStatusChange: vi.fn(),
    onConfigUpdate: vi.fn(),
    onModelUpdate: vi.fn(),
    onModeUpdate: vi.fn(),
    onContextUsage: vi.fn(),
    onQueueUpdate: vi.fn(),
    onPermissionRequest: vi.fn(),
    onSignal: vi.fn(),
  };
}

function createMockProtocol() {
  return {
    initialize: vi.fn().mockResolvedValue({ protocolVersion: '0.1', capabilities: {} }),
    authenticate: vi.fn().mockResolvedValue({}),
    createSession: vi.fn().mockResolvedValue({
      sessionId: 'sess-1',
      currentModelId: 'claude-3',
      availableModels: [],
      currentModeId: 'code',
      availableModes: [],
      configOptions: [],
    }),
    loadSession: vi.fn().mockResolvedValue({ sessionId: 'sess-1' }),
    prompt: vi.fn().mockResolvedValue({ stopReason: 'end_turn' }),
    cancel: vi.fn().mockResolvedValue(undefined),
    setModel: vi.fn().mockResolvedValue(undefined),
    setMode: vi.fn().mockResolvedValue(undefined),
    setConfigOption: vi.fn().mockResolvedValue(undefined),
    closeSession: vi.fn().mockResolvedValue(undefined),
    extMethod: vi.fn().mockResolvedValue({}),
    closed: new Promise<void>(() => {}),
    signal: new AbortController().signal,
  };
}

const baseConfig: AgentConfig = {
  agentBackend: 'test',
  agentSource: 'builtin',
  agentId: 'builtin:test',
  cwd: '/tmp',
  command: '/usr/bin/test-agent',
  args: ['--stdio'],
};

describe('AcpSession prompt flow', () => {
  let callbacks: SessionCallbacks;
  let protocol: ReturnType<typeof createMockProtocol>;
  let options: SessionOptions;
  let connectorFactory: ConnectorFactory;

  beforeEach(() => {
    callbacks = createMockCallbacks();
    protocol = createMockProtocol();
    connectorFactory = {
      create: vi.fn(() => ({
        connect: vi.fn().mockResolvedValue({
          stream: { readable: new ReadableStream(), writable: new WritableStream() },
          shutdown: vi.fn().mockResolvedValue(undefined),
        }),
        isAlive: vi.fn().mockReturnValue(true),
      })),
    };
    options = { protocolFactory: () => protocol as any };
  });

  async function startSession() {
    const session = new AcpSession(baseConfig, connectorFactory, callbacks, options);
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));
    return session;
  }

  it('sendMessage enqueues and triggers drain (INV-S-02)', async () => {
    const session = await startSession();
    session.sendMessage('hello');
    await vi.waitFor(() => expect(protocol.prompt).toHaveBeenCalledOnce());
    expect(session.status).toBe('active');
  });

  it('executes queued prompts in FIFO order (INV-S-02)', async () => {
    const order: string[] = [];
    protocol.prompt = vi.fn(async (_sid, content) => {
      order.push((content as any)[0]?.text ?? '');
      return { stopReason: 'end_turn' };
    });
    const session = await startSession();
    session.sendMessage('first');
    session.sendMessage('second');
    session.sendMessage('third');
    await vi.waitFor(() => expect(order.length).toBe(3));
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('sendMessage throws in idle state', () => {
    const session = new AcpSession(baseConfig, connectorFactory, callbacks, options);
    expect(() => session.sendMessage('hello')).toThrow(/Cannot send in idle state/);
  });

  it('sendMessage from suspended triggers resume (T16)', async () => {
    const session = await startSession();
    await session.suspend();
    expect(session.status).toBe('suspended');
    session.sendMessage('after suspend');
    await vi.waitFor(() => expect(['resuming', 'active', 'prompting'].includes(session.status)).toBe(true));
  });

  it('onQueueUpdate pushes complete snapshot (INV-X-02)', async () => {
    const session = await startSession();
    protocol.prompt = vi.fn(() => new Promise(() => {}));
    session.sendMessage('a');
    session.sendMessage('b');
    const calls = (callbacks.onQueueUpdate as any).mock.calls;
    const lastSnap = calls[calls.length - 1][0];
    expect(lastSnap.length).toBe(lastSnap.items.length);
  });
});
