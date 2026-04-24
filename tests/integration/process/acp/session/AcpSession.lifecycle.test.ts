import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcpSession } from '@process/acp/session/AcpSession';
import type { AcpClient, ClientFactory, DisconnectInfo } from '@process/acp/infra/IAcpClient';
import type { AgentConfig, SessionCallbacks, SessionStatus } from '@process/acp/types';
import type { SessionOptions } from '@process/acp/session/AcpSession';

function createMockCallbacks(): SessionCallbacks {
  return {
    onMessage: vi.fn(),
    onSessionId: vi.fn(),
    onStatusChange: vi.fn(),
    onConfigUpdate: vi.fn(),
    onModelUpdate: vi.fn(),
    onModeUpdate: vi.fn(),
    onContextUsage: vi.fn(),
    onPermissionRequest: vi.fn(),
    onSignal: vi.fn(),
  };
}

function createMockClient() {
  const client: AcpClient = {
    start: vi.fn().mockResolvedValue({
      protocolVersion: '0.1',
      capabilities: {},
    }),
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
    authenticate: vi.fn().mockResolvedValue({}),
    lifecycleSnapshot: { pid: null, running: false, lastExit: null },
    onDisconnect: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return client;
}

function createMockClientFactory(client: AcpClient): ClientFactory {
  return {
    create: vi.fn(() => client),
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
  let client: AcpClient;
  let clientFactory: ClientFactory;

  beforeEach(() => {
    callbacks = createMockCallbacks();
    client = createMockClient();
    clientFactory = createMockClientFactory(client);
  });

  it('starts in idle state', () => {
    const session = new AcpSession(baseConfig, clientFactory, callbacks);
    expect(session.status).toBe('idle');
  });

  it('start() transitions idle → starting → active (T1, T2)', async () => {
    const statusChanges: SessionStatus[] = [];
    callbacks.onStatusChange = vi.fn((s) => statusChanges.push(s));
    const session = new AcpSession(baseConfig, clientFactory, callbacks);

    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));

    expect(statusChanges).toContain('starting');
    expect(statusChanges).toContain('active');
  });

  it('start() calls start and createSession on client', async () => {
    const session = new AcpSession(baseConfig, clientFactory, callbacks);
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));

    expect(client.start).toHaveBeenCalledOnce();
    expect(client.createSession).toHaveBeenCalledOnce();
  });

  it('start() notifies sessionId via callback', async () => {
    const session = new AcpSession(baseConfig, clientFactory, callbacks);
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));

    expect(callbacks.onSessionId).toHaveBeenCalledWith('sess-123');
    expect(session.sessionId).toBe('sess-123');
  });

  it('stop() transitions any state → idle (T7, T15, T17, T22)', async () => {
    const session = new AcpSession(baseConfig, clientFactory, callbacks);
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));

    await session.stop();
    expect(session.status).toBe('idle');
  });

  it('suspend() transitions active → suspended when queue empty (T6, INV-S-05)', async () => {
    const session = new AcpSession(baseConfig, clientFactory, callbacks);
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));

    await session.suspend();
    expect(session.status).toBe('suspended');
  });

  it('start() from error state resets retry count (T21)', async () => {
    const session = new AcpSession(baseConfig, clientFactory, callbacks);

    (client.start as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('permanent'));
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('error'), { timeout: 10000 });

    (client.start as ReturnType<typeof vi.fn>).mockResolvedValue({ protocolVersion: '0.1', capabilities: {} });
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));
  });

  it('only emits valid state transitions (INV-S-09)', async () => {
    const VALID_TRANSITIONS = new Set([
      'idle→starting',
      'starting→active',
      'starting→starting',
      'starting→error',
      'active→prompting',
      'active→suspended',
      'active→idle',
      'prompting→active',
      'prompting→prompting',
      'prompting→resuming',
      'prompting→error',
      'prompting→idle',
      'suspended→resuming',
      'suspended→idle',
      'resuming→active',
      'resuming→resuming',
      'resuming→error',
      'error→starting',
      'error→idle',
    ]);

    const transitions: string[] = [];
    let prevStatus: SessionStatus = 'idle';
    callbacks.onStatusChange = vi.fn((status: SessionStatus) => {
      transitions.push(`${prevStatus}→${status}`);
      prevStatus = status;
    });

    const session = new AcpSession(baseConfig, clientFactory, callbacks);
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));
    await session.stop();

    for (const t of transitions) {
      expect(VALID_TRANSITIONS.has(t), `Invalid transition: ${t}`).toBe(true);
    }
  });

  it('disconnect in active state does NOT emit crash signal (idle exit)', async () => {
    // Capture the disconnect handler registered by SessionLifecycle
    let disconnectHandler: ((info: DisconnectInfo) => void) | null = null;
    (client.onDisconnect as ReturnType<typeof vi.fn>).mockImplementation((handler: (info: DisconnectInfo) => void) => {
      disconnectHandler = handler;
    });

    const session = new AcpSession(baseConfig, clientFactory, callbacks);
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));

    // Simulate process exit while session is idle (active, no prompt in flight)
    disconnectHandler!({ reason: 'process_exit', exitCode: 1, signal: null, stderr: '' });

    expect(session.status).toBe('suspended');
    // onSignal should NOT have been called with an error crash message
    const signalCalls = (callbacks.onSignal as ReturnType<typeof vi.fn>).mock.calls;
    const crashSignals = signalCalls.filter(
      ([sig]: [{ type: string; message?: string }]) =>
        sig.type === 'error' && sig.message?.includes('process exited unexpectedly')
    );
    expect(crashSignals).toHaveLength(0);
  });

  it('disconnect in prompting state DOES emit crash signal', async () => {
    let disconnectHandler: ((info: DisconnectInfo) => void) | null = null;
    (client.onDisconnect as ReturnType<typeof vi.fn>).mockImplementation((handler: (info: DisconnectInfo) => void) => {
      disconnectHandler = handler;
    });

    // Make prompt() hang forever so we stay in 'prompting' state
    (client.prompt as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    // Make loadSession resolve so resume works
    (client.loadSession as ReturnType<typeof vi.fn>).mockResolvedValue({ sessionId: 'sess-123' });

    const session = new AcpSession(baseConfig, clientFactory, callbacks);
    session.start();
    await vi.waitFor(() => expect(session.status).toBe('active'));

    // Start a prompt (will hang, keeping status in 'prompting')
    void session.sendMessage('hello');
    await vi.waitFor(() => expect(session.status).toBe('prompting'));

    // Simulate process crash during prompting
    disconnectHandler!({ reason: 'process_exit', exitCode: 1, signal: null, stderr: '' });

    // onSignal SHOULD have been called with a crash error
    const signalCalls = (callbacks.onSignal as ReturnType<typeof vi.fn>).mock.calls;
    const crashSignals = signalCalls.filter(
      ([sig]: [{ type: string; message?: string }]) =>
        sig.type === 'error' && sig.message?.includes('process exited unexpectedly')
    );
    expect(crashSignals.length).toBeGreaterThan(0);
  });
});
