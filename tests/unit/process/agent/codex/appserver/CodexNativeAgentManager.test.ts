import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { CodexNativeAgentManager } from '@/process/agent/codex/appserver/CodexNativeAgentManager';

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};

const testDoubles = vi.hoisted(() => {
  const createDeferred = () => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  };

  const state = {
    clientStartGate: undefined as ReturnType<typeof createDeferred> | undefined,
    clients: [] as unknown[],
    failureListeners: new Set<(error: Error) => void>(),
    sessionStartGate: undefined as ReturnType<typeof createDeferred> | undefined,
    sessions: [] as unknown[],
    turnGates: [] as ReturnType<typeof createDeferred>[],
  };

  class FakeCodexAppServerClient {
    constructor() {
      state.clients.push(this);
    }

    start = vi.fn(async () => {
      await state.clientStartGate?.promise;
    });

    onFailure = vi.fn((handler: (error: Error) => void) => {
      state.failureListeners.add(handler);
      return () => state.failureListeners.delete(handler);
    });

    emitFailure(error: Error): void {
      for (const listener of state.failureListeners) {
        listener(error);
      }
    }

    dispose = vi.fn(async () => {});
  }

  class FakeCodexThreadSession {
    private turnInFlight = false;

    constructor() {
      state.sessions.push(this);
    }

    start = vi.fn(async () => {
      await state.sessionStartGate?.promise;
    });

    startTurn = vi.fn(async () => {
      if (this.turnInFlight) {
        throw new Error('Cannot start a new Codex turn while another turn is running');
      }
      this.turnInFlight = true;
      const turnGate = createDeferred();
      state.turnGates.push(turnGate);
      try {
        await turnGate.promise;
      } finally {
        this.turnInFlight = false;
      }
    });

    interrupt = vi.fn(async () => {
      state.turnGates.at(-1)?.resolve();
    });

    dispose = vi.fn(() => {
      state.turnGates.at(-1)?.resolve();
    });
  }

  return {
    createDeferred,
    FakeCodexAppServerClient,
    FakeCodexThreadSession,
    state,
  };
});

vi.mock('@/process/agent/codex/appserver/CodexAppServerClient', () => ({
  CodexAppServerClient: testDoubles.FakeCodexAppServerClient,
}));

vi.mock('@/process/agent/codex/appserver/CodexThreadSession', () => ({
  CodexThreadSession: testDoubles.FakeCodexThreadSession,
}));

vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: vi.fn(async (content: string) => ({ content, loadedSkills: [] })),
}));

vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
}));

type FakeClient = {
  start: ReturnType<typeof vi.fn>;
  emitFailure: (error: Error) => void;
};

type FakeSession = {
  start: ReturnType<typeof vi.fn>;
  startTurn: ReturnType<typeof vi.fn>;
};

type StartableManager = {
  ensureStarted: () => Promise<void>;
};

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForTurnStart(turnCount = 1): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (testDoubles.state.turnGates.length >= turnCount) return;
    await flushPromises();
  }
  throw new Error('Timed out waiting for Codex turn to start');
}

function createManager(conversationId: string): CodexNativeAgentManager {
  return new CodexNativeAgentManager({
    conversation_id: conversationId,
    workspace: process.cwd(),
    appServerCommand: process.execPath,
    appServerArgs: ['tests/fixtures/fake-codex-app-server/index.js'],
    sessionMode: 'default',
  });
}

describe('CodexNativeAgentManager', () => {
  beforeEach(() => {
    cronBusyGuard.clear();
    testDoubles.state.clientStartGate = undefined;
    testDoubles.state.clients.length = 0;
    testDoubles.state.failureListeners.clear();
    testDoubles.state.sessionStartGate = undefined;
    testDoubles.state.sessions.length = 0;
    testDoubles.state.turnGates.length = 0;
    vi.clearAllMocks();
  });

  it('implements the task manager contract for native Codex', async () => {
    const manager = createManager('conversation-1');

    const sendPromise = manager.sendMessage({ content: 'hello', msg_id: 'message-1' });
    await waitForTurnStart();
    testDoubles.state.turnGates[0].resolve();
    await sendPromise;

    const client = testDoubles.state.clients[0] as FakeClient;
    const session = testDoubles.state.sessions[0] as FakeSession;

    expect(manager.type).toBe('codex');
    expect(manager.workspace).toBe(process.cwd());
    expect(manager.status).toBe('finished');
    expect(client.start).toHaveBeenCalledTimes(1);
    expect(session.start).toHaveBeenCalledTimes(1);
    expect(session.startTurn).toHaveBeenCalledTimes(1);

    await manager.stop();
    manager.kill();
  });

  it('restarts the app-server and thread session after a client failure', async () => {
    const manager = createManager('conversation-restart-after-failure');

    const firstSend = manager.sendMessage({ content: 'first', msg_id: 'message-1' });
    await waitForTurnStart();
    testDoubles.state.turnGates[0].resolve();
    await firstSend;

    const client = testDoubles.state.clients[0] as FakeClient;
    const session = testDoubles.state.sessions[0] as FakeSession;
    client.emitFailure(new Error('app-server crashed'));

    const secondSend = manager.sendMessage({ content: 'second', msg_id: 'message-2' });
    await waitForTurnStart(2);
    testDoubles.state.turnGates[1].resolve();
    await secondSend;

    expect(client.start).toHaveBeenCalledTimes(2);
    expect(session.start).toHaveBeenCalledTimes(2);
    expect(session.startTurn).toHaveBeenCalledTimes(2);

    manager.kill();
  });

  it('keeps the active send running when an overlapping send is rejected locally', async () => {
    const conversationId = 'conversation-send-serialization';
    const manager = createManager(conversationId);

    const firstSend = manager.sendMessage({ content: 'first', msg_id: 'message-1' });
    await waitForTurnStart();

    await expect(manager.sendMessage({ content: 'second', msg_id: 'message-2' })).rejects.toThrow(
      'Codex native agent is already processing a message'
    );

    const session = testDoubles.state.sessions[0] as FakeSession;
    expect(session.startTurn).toHaveBeenCalledTimes(1);
    expect(manager.status).toBe('running');
    expect(cronBusyGuard.isProcessing(conversationId)).toBe(true);

    testDoubles.state.turnGates[0].resolve();
    await firstSend;
    expect(manager.status).toBe('finished');
    expect(cronBusyGuard.isProcessing(conversationId)).toBe(false);

    manager.kill();
  });

  it('shares startup work when ensureStarted is called concurrently', async () => {
    const manager = createManager('conversation-start-serialization');
    testDoubles.state.clientStartGate = testDoubles.createDeferred() as Deferred;

    const firstStart = (manager as unknown as StartableManager).ensureStarted();
    await flushPromises();
    const secondStart = (manager as unknown as StartableManager).ensureStarted();
    await flushPromises();

    testDoubles.state.clientStartGate.resolve();
    await Promise.all([firstStart, secondStart]);

    const client = testDoubles.state.clients[0] as FakeClient;
    const session = testDoubles.state.sessions[0] as FakeSession;
    expect(client.start).toHaveBeenCalledTimes(1);
    expect(session.start).toHaveBeenCalledTimes(1);

    manager.kill();
  });
});
