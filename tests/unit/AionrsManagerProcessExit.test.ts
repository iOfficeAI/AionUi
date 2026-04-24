/**
 * AionrsManager process exit error + heartbeat — unit tests
 *
 * Validates that:
 * 1. Process exit during active turn emits error + finish (not fake finish)
 * 2. Heartbeat activates/deactivates on stream_start/stream_end
 * 3. Stream events reset heartbeat missed count (backward compat)
 * 4. stop() cleans up heartbeat interval
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────

const {
  emitResponseStream,
  emitConfirmationAdd,
  emitConfirmationUpdate,
  emitConfirmationRemove,
  mockDb,
  mockMainError,
} = vi.hoisted(() => ({
  emitResponseStream: vi.fn(),
  emitConfirmationAdd: vi.fn(),
  emitConfirmationUpdate: vi.fn(),
  emitConfirmationRemove: vi.fn(),
  mockDb: {
    getConversationMessages: vi.fn(() => ({ data: [] })),
    getConversation: vi.fn(() => ({ success: false })),
    updateConversation: vi.fn(),
    createConversation: vi.fn(() => ({ success: true })),
    insertMessage: vi.fn(),
    updateMessage: vi.fn(),
  },
  mockMainError: vi.fn(),
}));

// ── Module mocks ───────────────────────────────────────────────────

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: { emit: emitResponseStream },
      confirmation: {
        add: { emit: emitConfirmationAdd },
        update: { emit: emitConfirmationUpdate },
        remove: { emit: emitConfirmationRemove },
      },
    },
    cron: {
      onJobCreated: { emit: vi.fn() },
      onJobRemoved: { emit: vi.fn() },
    },
  },
}));

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: { isPackaged: () => false, getAppPath: () => null },
    worker: {
      fork: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        postMessage: vi.fn(),
        kill: vi.fn(),
      })),
    },
  }),
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({})),
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() => Promise.resolve(mockDb)),
}));

vi.mock('@process/services/database/export', () => ({
  getDatabase: vi.fn(() => Promise.resolve(mockDb)),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessChat: { get: vi.fn(() => Promise.resolve([])) },
}));

vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
}));

vi.mock('@/common/utils', () => {
  let counter = 0;
  return { uuid: vi.fn(() => `uuid-${++counter}`) };
});

vi.mock('@/renderer/utils/common', () => {
  let counter = 0;
  return { uuid: vi.fn(() => `pipe-${++counter}`) };
});

vi.mock('@process/utils/mainLogger', () => ({
  mainError: mockMainError,
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
}));

vi.mock('@process/services/cron/cronServiceSingleton', () => ({
  cronService: {
    addJob: vi.fn(async () => ({ id: 'cron-1', name: 'test', enabled: true })),
    removeJob: vi.fn(async () => {}),
    listJobsByConversation: vi.fn(async () => []),
  },
}));

vi.mock('@process/agent/aionrs', () => ({
  AionrsAgent: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    kill: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
    approveTool: vi.fn(),
    denyTool: vi.fn(),
    setConfig: vi.fn(),
    setMode: vi.fn(),
    sendCommand: vi.fn(),
    ping: vi.fn(),
    get isAlive() {
      return true;
    },
    injectConversationHistory: vi.fn().mockResolvedValue(undefined),
    get bootstrap() {
      return Promise.resolve();
    },
  })),
}));

// ── Import under test ──────────────────────────────────────────────

import { AionrsManager } from '@/process/task/AionrsManager';

// ── Helpers ────────────────────────────────────────────────────────

function createManager(conversationId = 'conv-pe-1'): AionrsManager {
  const data = {
    workspace: '/test/workspace',
    model: { name: 'test-provider', useModel: 'test-model', baseUrl: '', platform: 'test' },
    conversation_id: conversationId,
  };
  return new AionrsManager(data as Record<string, unknown>, data.model as Record<string, unknown>);
}

function emitEvent(manager: AionrsManager, event: Record<string, unknown>) {
  (manager as Record<string, unknown> & { emit: (name: string, data: unknown) => void }).emit('aionrs.message', event);
}

function findEmissions(type: string) {
  return emitResponseStream.mock.calls
    .filter(([e]: [{ type: string }]) => e.type === type)
    .map(([e]: [Record<string, unknown>]) => e);
}

// ── Tests ──────────────────────────────────────────────────────────

describe('AionrsManager Process Exit + Heartbeat', () => {
  let manager: AionrsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    manager = createManager();
    vi.spyOn(manager as Record<string, unknown>, 'postMessagePromise' as never).mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Process exit during active turn ──────────────────────────────

  describe('process exit during active turn emits error + finish', () => {
    it('emits error event with exit code and active msg_id', () => {
      (manager as Record<string, (...args: unknown[]) => void>)['handleProcessExit'](1, 'msg-active-1');

      const errors = findEmissions('error');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        type: 'error',
        conversation_id: 'conv-pe-1',
        msg_id: 'msg-active-1',
      });
      expect(errors[0].data).toContain('code 1');
    });

    it('emits finish event after error', () => {
      (manager as Record<string, (...args: unknown[]) => void>)['handleProcessExit'](1, 'msg-active-1');

      const finishes = findEmissions('finish');
      expect(finishes).toHaveLength(1);
      expect(finishes[0]).toMatchObject({
        type: 'finish',
        conversation_id: 'conv-pe-1',
      });
    });

    it('sets status to finished', () => {
      (manager as Record<string, (...args: unknown[]) => void>)['handleProcessExit'](1, 'msg-active-1');

      expect(manager.status).toBe('finished');
    });

    it('logs error with mainError', () => {
      (manager as Record<string, (...args: unknown[]) => void>)['handleProcessExit'](1, 'msg-active-1');

      expect(mockMainError).toHaveBeenCalledWith('[AionrsManager]', expect.stringContaining('code=1'));
    });

    it('calls handleTurnEnd', () => {
      const handleTurnEndSpy = vi.spyOn(manager as Record<string, never>, 'handleTurnEnd' as never);
      (manager as Record<string, (...args: unknown[]) => void>)['handleProcessExit'](null, 'msg-active-1');

      expect(handleTurnEndSpy).toHaveBeenCalled();
    });
  });

  // ── Heartbeat activation/deactivation ────────────────────────────

  describe('heartbeat activation on stream lifecycle', () => {
    it('activates heartbeat on stream_start', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });

      expect((manager as Record<string, unknown>)['heartbeatActive']).toBe(true);
      expect((manager as Record<string, unknown>)['heartbeatMissedCount']).toBe(0);
    });

    it('deactivates heartbeat on stream_end (finish)', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'hello', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      expect((manager as Record<string, unknown>)['heartbeatActive']).toBe(false);
      expect((manager as Record<string, unknown>)['heartbeatMissedCount']).toBe(0);
    });
  });

  // ── Stream event heartbeat reset (backward compat) ───────────────

  describe('stream events reset heartbeat missed count', () => {
    it('resets heartbeatMissedCount on any event with msg_id', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });

      // Simulate missed pongs
      (manager as Record<string, unknown>)['heartbeatMissedCount'] = 2;

      // Any event with msg_id should reset
      emitEvent(manager, { type: 'content', data: 'chunk', msg_id: 'msg-1' });

      expect((manager as Record<string, unknown>)['heartbeatMissedCount']).toBe(0);
    });

    it('does not reset on events without msg_id (config_changed, info with empty msg_id)', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      (manager as Record<string, unknown>)['heartbeatMissedCount'] = 2;

      // config_changed has no msg_id — handled before msg_id guard
      emitEvent(manager, { type: 'config_changed', data: { tool_approval: true } });

      // heartbeatMissedCount unchanged because config_changed returns early
      expect((manager as Record<string, unknown>)['heartbeatMissedCount']).toBe(2);
    });

    it('tool_group events reset heartbeat missed count', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      (manager as Record<string, unknown>)['heartbeatMissedCount'] = 2;

      emitEvent(manager, {
        type: 'tool_group',
        data: [{ name: 'Bash', status: 'Running', callId: 'c1' }],
        msg_id: 'msg-1',
      });

      expect((manager as Record<string, unknown>)['heartbeatMissedCount']).toBe(0);
    });
  });

  // ── Heartbeat pong handler ───────────────────────────────────────

  describe('handlePong resets missed count', () => {
    it('resets heartbeatMissedCount to 0', () => {
      (manager as Record<string, unknown>)['heartbeatMissedCount'] = 2;
      (manager as Record<string, (...args: unknown[]) => void>)['handlePong']();

      expect((manager as Record<string, unknown>)['heartbeatMissedCount']).toBe(0);
    });
  });

  // ── Heartbeat check logic ────────────────────────────────────────

  describe('checkHeartbeat behavior', () => {
    it('skips check when heartbeatActive is false', () => {
      (manager as Record<string, unknown>)['heartbeatActive'] = false;
      (manager as Record<string, unknown>)['heartbeatMissedCount'] = 0;

      (manager as Record<string, (...args: unknown[]) => void>)['checkHeartbeat']();

      expect((manager as Record<string, unknown>)['heartbeatMissedCount']).toBe(0);
    });

    it('increments missed count and sends ping when active', () => {
      (manager as Record<string, unknown>)['heartbeatActive'] = true;
      (manager as Record<string, unknown>)['heartbeatMissedCount'] = 0;

      const mockAgent = { isAlive: true, ping: vi.fn(), kill: vi.fn() };
      (manager as Record<string, unknown>)['agent'] = mockAgent;

      (manager as Record<string, (...args: unknown[]) => void>)['checkHeartbeat']();

      expect((manager as Record<string, unknown>)['heartbeatMissedCount']).toBe(1);
      expect(mockAgent.ping).toHaveBeenCalled();
    });

    it('kills agent after max missed pongs', () => {
      (manager as Record<string, unknown>)['heartbeatActive'] = true;
      (manager as Record<string, unknown>)['heartbeatMissedCount'] = 2;

      const mockAgent = { isAlive: true, ping: vi.fn(), kill: vi.fn() };
      (manager as Record<string, unknown>)['agent'] = mockAgent;

      (manager as Record<string, (...args: unknown[]) => void>)['checkHeartbeat']();

      expect(mockAgent.kill).toHaveBeenCalled();
      expect(mockAgent.ping).not.toHaveBeenCalled();
    });

    it('logs error before killing unresponsive agent', () => {
      (manager as Record<string, unknown>)['heartbeatActive'] = true;
      (manager as Record<string, unknown>)['heartbeatMissedCount'] = 2;

      const mockAgent = { isAlive: true, ping: vi.fn(), kill: vi.fn() };
      (manager as Record<string, unknown>)['agent'] = mockAgent;

      (manager as Record<string, (...args: unknown[]) => void>)['checkHeartbeat']();

      expect(mockMainError).toHaveBeenCalledWith('[AionrsManager]', expect.stringContaining('unresponsive'));
    });
  });

  // ── Lifecycle cleanup ────────────────────────────────────────────

  describe('stop() cleans up heartbeat', () => {
    it('clears heartbeat interval on stop', async () => {
      (manager as Record<string, (...args: unknown[]) => void>)['startHeartbeat']();
      expect((manager as Record<string, unknown>)['heartbeatInterval']).not.toBeNull();

      await manager.stop();

      expect((manager as Record<string, unknown>)['heartbeatInterval']).toBeNull();
    });

    it('resets heartbeat state on stop', async () => {
      (manager as Record<string, unknown>)['heartbeatActive'] = true;
      (manager as Record<string, unknown>)['heartbeatMissedCount'] = 2;

      await manager.stop();

      expect((manager as Record<string, unknown>)['heartbeatActive']).toBe(false);
      expect((manager as Record<string, unknown>)['heartbeatMissedCount']).toBe(0);
    });

    it('multiple stop calls do not throw', async () => {
      await expect(manager.stop()).resolves.not.toThrow();
      await expect(manager.stop()).resolves.not.toThrow();
    });
  });

  // ── No old idle fallback behavior ────────────────────────────────

  describe('no idle fallback timer behavior', () => {
    it('does not have missingFinishFallbackTimer field', () => {
      expect((manager as Record<string, unknown>)['missingFinishFallbackTimer']).toBeUndefined();
    });

    it('no synthetic finish after 15s idle', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'hello', msg_id: 'msg-1' });

      vi.advanceTimersByTime(15_000);

      const finishes = findEmissions('finish');
      expect(finishes).toHaveLength(0);
    });

    it('no synthetic finish after 60s idle', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'hello', msg_id: 'msg-1' });

      vi.advanceTimersByTime(60_000);

      const finishes = findEmissions('finish');
      expect(finishes).toHaveLength(0);
    });
  });
});
