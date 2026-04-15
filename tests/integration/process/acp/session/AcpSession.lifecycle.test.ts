import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcpSession } from '@process/acp/session/AcpSession';
import type { AgentConfig, SessionCallbacks, SessionStatus } from '@process/acp/types';
import type { ConnectorFactory, SessionOptions } from '@process/acp/session/types';

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
    initialize: vi.fn().mockResolvedValue({
      protocolVersion: '0.1',
      capabilities: {},
    }),
    authenticate: vi.fn().mockResolvedValue({}),
    createSession: vi.fn().mockResolvedValue({
      sessionId: 'sess-123',
      currentModelId: 'claude-3',
      availableModels: [],
      currentModeId: 'code',
      availableModes: [],
      configOptions: [],
    }),
    loadSession: vi.fn().mockResolvedValue({
      sessionId: 'sess-123',
    }),
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

function createMockConnectorFactory(protocol: ReturnType<typeof createMockProtocol>): ConnectorFactory {
  return {
    create: vi.fn(() => ({
      connect: vi.fn().mockResolvedValue({
        stream: { readable: new ReadableStream(), writable: new WritableStream() },
        shutdown: vi.fn().mockResolvedValue(undefined),
      }),
      isAlive: vi.fn().mockReturnValue(true),
    })),
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

describe('AcpSession lifecycle', () => {
  let callbacks: SessionCallbacks;
  let protocol: ReturnType<typeof createMockProtocol>;
  let connectorFactory: ConnectorFactory;
  let options: SessionOptions;

  beforeEach(() => {
    callbacks = createMockCallbacks();
    protocol = createMockProtocol();
    connectorFactory = createMockConnectorFactory(protocol);
    options = {
      protocolFactory: () => protocol as any,
    };
  });

  it('starts in idle state', () => {
    const session = new AcpSession(baseConfig, connectorFactory, callbacks, options);
    expect(session.status).toBe('idle');
  });

  it('start() transitions idle → starting → active (T1, T2)', async () => {
    const session = new AcpSession(baseConfig, connectorFactory, callbacks, options);
    const statusChanges: SessionStatus[] = [];
    callbacks.onStatusChange = vi.fn((s) => statusChanges.push(s));

    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));

    expect(statusChanges).toContain('starting');
    expect(statusChanges).toContain('active');
  });

  it('start() calls initialize and createSession', async () => {
    const session = new AcpSession(baseConfig, connectorFactory, callbacks, options);
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));

    expect(protocol.initialize).toHaveBeenCalledOnce();
    expect(protocol.createSession).toHaveBeenCalledOnce();
  });

  it('start() notifies sessionId via callback', async () => {
    const session = new AcpSession(baseConfig, connectorFactory, callbacks, options);
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));

    expect(callbacks.onSessionId).toHaveBeenCalledWith('sess-123');
    expect(session.sessionId).toBe('sess-123');
  });

  it('stop() transitions any state → idle (T7, T15, T17, T22)', async () => {
    const session = new AcpSession(baseConfig, connectorFactory, callbacks, options);
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));

    await session.stop();
    expect(session.status).toBe('idle');
  });

  it('suspend() transitions active → suspended when queue empty (T6, INV-S-05)', async () => {
    const session = new AcpSession(baseConfig, connectorFactory, callbacks, options);
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));

    await session.suspend();
    expect(session.status).toBe('suspended');
  });

  it('start() from error state resets retry count (T21)', async () => {
    const session = new AcpSession(baseConfig, connectorFactory, callbacks, options);

    protocol.initialize.mockRejectedValue(new Error('permanent'));
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('error'), { timeout: 10000 });

    protocol.initialize.mockResolvedValue({ protocolVersion: '0.1', capabilities: {} });
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));
  });

  it('only emits valid state transitions (INV-S-09)', async () => {
    const VALID_TRANSITIONS = new Set([
      'idle→starting', 'starting→active', 'starting→starting', 'starting→error',
      'active→prompting', 'active→suspended', 'active→idle',
      'prompting→active', 'prompting→prompting', 'prompting→resuming', 'prompting→error', 'prompting→idle',
      'suspended→resuming', 'suspended→idle',
      'resuming→active', 'resuming→resuming', 'resuming→error',
      'error→starting', 'error→idle',
    ]);

    const transitions: string[] = [];
    let prevStatus: SessionStatus = 'idle';
    callbacks.onStatusChange = vi.fn((status: SessionStatus) => {
      transitions.push(`${prevStatus}→${status}`);
      prevStatus = status;
    });

    const session = new AcpSession(baseConfig, connectorFactory, callbacks, options);
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));
    await session.stop();

    for (const t of transitions) {
      expect(VALID_TRANSITIONS.has(t), `Invalid transition: ${t}`).toBe(true);
    }
  });
});
