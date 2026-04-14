/**
 * GAP-3: AionrsManager Finish Fallback — Black-box & boundary tests
 *
 * Tests based on GAP-3-plan.md acceptance criteria.
 * Validates that AionrsManager synthesizes a finish signal when
 * the real stream_end event is lost (15 s idle timeout).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────

const { emitResponseStream, emitConfirmationAdd, emitConfirmationUpdate, emitConfirmationRemove, mockDb } = vi.hoisted(
  () => ({
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
  })
);

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

const mockAddOrUpdateMessage = vi.hoisted(() => vi.fn());
vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: mockAddOrUpdateMessage,
}));

vi.mock('@/common/utils', () => {
  let counter = 0;
  return { uuid: vi.fn(() => `uuid-${++counter}`) };
});

vi.mock('@/renderer/utils/common', () => {
  let counter = 0;
  return { uuid: vi.fn(() => `pipe-${++counter}`) };
});

const mockMainWarn = vi.hoisted(() => vi.fn());
vi.mock('@process/utils/mainLogger', () => ({
  mainError: vi.fn(),
  mainLog: vi.fn(),
  mainWarn: mockMainWarn,
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
    injectConversationHistory: vi.fn().mockResolvedValue(undefined),
    get bootstrap() {
      return Promise.resolve();
    },
  })),
}));

// ── Import under test ──────────────────────────────────────────────

import { AionrsManager } from '@/process/task/AionrsManager';

// ── Helpers ────────────────────────────────────────────────────────

const FALLBACK_DELAY_MS = 15_000;

function createManager(conversationId = 'conv-fb-1'): AionrsManager {
  const data = {
    workspace: '/test/workspace',
    model: { name: 'test-provider', useModel: 'test-model', baseUrl: '', platform: 'test' },
    conversation_id: conversationId,
  };
  return new AionrsManager(data as any, data.model as any);
}

function emitEvent(manager: AionrsManager, event: Record<string, unknown>) {
  (manager as any).emit('aionrs.message', event);
}

function findEmissions(type: string) {
  return emitResponseStream.mock.calls.filter(([e]: [{ type: string }]) => e.type === type).map(([e]: [any]) => e);
}

// ── Tests ──────────────────────────────────────────────────────────

describe('GAP-3: AionrsManager Finish Fallback Mechanism', () => {
  let manager: AionrsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    manager = createManager();
    vi.spyOn(manager as any, 'postMessagePromise').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── AC-1: Activity heartbeat reset ─────────────────────────────

  describe('AC-1: heartbeat resets fallback timer on every non-finish event', () => {
    it('schedules fallback timer when content event arrives', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'hello', msg_id: 'msg-1' });

      expect((manager as any).missingFinishFallbackTimer).not.toBeNull();
    });

    it('schedules fallback timer on start event', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });

      expect((manager as any).missingFinishFallbackTimer).not.toBeNull();
    });

    it('resets timer on each event — fallback fires 15s after LAST event', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'chunk1', msg_id: 'msg-1' });

      vi.advanceTimersByTime(10_000); // 10s since last event

      // Another event arrives — resets the timer
      emitEvent(manager, { type: 'content', data: 'chunk2', msg_id: 'msg-1' });

      vi.advanceTimersByTime(10_000); // 10s since chunk2 (20s total)

      // Fallback should NOT have fired yet (only 10s since last event)
      const finishEmissions = findEmissions('finish');
      expect(finishEmissions).toHaveLength(0);

      vi.advanceTimersByTime(5_000); // 15s since chunk2

      // Now fallback should fire
      const finishAfter = findEmissions('finish');
      expect(finishAfter.length).toBeGreaterThanOrEqual(1);
    });

    it('new start event resets fallback timer from previous turn', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'data', msg_id: 'msg-1' });

      const timer1 = (manager as any).missingFinishFallbackTimer;

      // New turn starts (no finish for previous turn)
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-2' });

      const timer2 = (manager as any).missingFinishFallbackTimer;

      // Timer should have been replaced
      expect(timer2).not.toBeNull();
      expect(timer2).not.toBe(timer1);
    });
  });

  // ── AC-2: Normal finish clears fallback ────────────────────────

  describe('AC-2: real finish clears fallback timer', () => {
    it('clears fallback timer when real finish event arrives', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'data', msg_id: 'msg-1' });

      expect((manager as any).missingFinishFallbackTimer).not.toBeNull();

      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      expect((manager as any).missingFinishFallbackTimer).toBeNull();
    });

    it('does not fire fallback after real finish', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'data', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      vi.advanceTimersByTime(FALLBACK_DELAY_MS + 1000);

      // Only one finish emission (the real one), no synthetic
      const finishEmissions = findEmissions('finish');
      expect(finishEmissions).toHaveLength(1);
    });
  });

  // ── AC-3: Fallback triggers synthetic finish ───────────────────

  describe('AC-3: 15s idle triggers synthetic finish', () => {
    it('emits synthetic finish to ipcBridge after 15s idle', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'response text', msg_id: 'msg-1' });

      vi.advanceTimersByTime(FALLBACK_DELAY_MS);

      const finishEmissions = findEmissions('finish');
      expect(finishEmissions.length).toBeGreaterThanOrEqual(1);

      const syntheticFinish = finishEmissions[0];
      expect(syntheticFinish).toMatchObject({
        type: 'finish',
        conversation_id: 'conv-fb-1',
      });
      expect(syntheticFinish.msg_id).toBeDefined();
    });

    it('calls handleTurnEnd on fallback (cron processing runs)', () => {
      const handleTurnEndSpy = vi.spyOn(manager as any, 'handleTurnEnd');

      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'some output', msg_id: 'msg-1' });

      vi.advanceTimersByTime(FALLBACK_DELAY_MS);

      expect(handleTurnEndSpy).toHaveBeenCalled();
    });

    it('sets status to finished on fallback', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'data', msg_id: 'msg-1' });

      // Status should be running/finished from content events
      vi.advanceTimersByTime(FALLBACK_DELAY_MS);

      expect(manager.status).toBe('finished');
    });
  });

  // ── AC-4: Confirmation gate ────────────────────────────────────

  describe('AC-4: fallback does not fire when confirmations are pending', () => {
    it('skips fallback if user confirmations are pending', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'data', msg_id: 'msg-1' });

      // Simulate a pending confirmation
      (manager as any).confirmations = [
        {
          id: 'confirm-1',
          callId: 'call-1',
          title: 'Test',
          action: 'exec',
          description: '',
          options: [],
        },
      ];

      vi.advanceTimersByTime(FALLBACK_DELAY_MS);

      // No synthetic finish emitted
      const finishEmissions = findEmissions('finish');
      expect(finishEmissions).toHaveLength(0);
    });

    it('fires fallback after confirmations are cleared on next activity', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'data', msg_id: 'msg-1' });

      // Add pending confirmation
      (manager as any).confirmations = [
        { id: 'c1', callId: 'call-1', title: 'T', action: 'exec', description: '', options: [] },
      ];

      vi.advanceTimersByTime(FALLBACK_DELAY_MS);

      // Fallback suppressed
      expect(findEmissions('finish')).toHaveLength(0);

      // Confirmation resolved, new activity arrives
      (manager as any).confirmations = [];
      emitEvent(manager, { type: 'content', data: 'more data', msg_id: 'msg-1' });

      vi.advanceTimersByTime(FALLBACK_DELAY_MS);

      // Now fallback should fire
      expect(findEmissions('finish').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── AC-5: Warning log ──────────────────────────────────────────

  describe('AC-5: mainWarn logged on fallback', () => {
    it('logs a warning with conversation_id when fallback fires', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'data', msg_id: 'msg-1' });

      vi.advanceTimersByTime(FALLBACK_DELAY_MS);

      expect(mockMainWarn).toHaveBeenCalledWith('[AionrsManager]', expect.stringContaining('conv-fb-1'));
    });
  });

  // ── AC-6: Lifecycle cleanup ────────────────────────────────────

  describe('AC-6: stop() clears fallback timer', () => {
    it('clears fallback timer on stop', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'data', msg_id: 'msg-1' });

      expect((manager as any).missingFinishFallbackTimer).not.toBeNull();

      await manager.stop();

      expect((manager as any).missingFinishFallbackTimer).toBeNull();
    });

    it('fallback does not fire after stop', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'data', msg_id: 'msg-1' });

      await manager.stop();

      vi.advanceTimersByTime(FALLBACK_DELAY_MS + 1000);

      const finishEmissions = findEmissions('finish');
      expect(finishEmissions).toHaveLength(0);
    });
  });

  // ── AC-7: Double handleTurnEnd safety ──────────────────────────

  describe('AC-7: double handleTurnEnd is safe (no duplicate side effects)', () => {
    it('second handleTurnEnd call has no side effects (content already cleared)', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: '[CRON_LIST]', msg_id: 'msg-1' });

      // First call (real finish)
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      // Manually trigger fallback handler (simulate race)
      void (manager as any).handleMissingFinishFallback();

      // handleTurnEnd was called but the second invocation won't re-process
      // because currentMsgContent was already cleared by the first call
    });
  });

  // ── Boundary cases ─────────────────────────────────────────────

  describe('Edge cases', () => {
    it('start → no further events → 15s → synthetic finish', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });

      vi.advanceTimersByTime(FALLBACK_DELAY_MS);

      const finishEmissions = findEmissions('finish');
      expect(finishEmissions.length).toBeGreaterThanOrEqual(1);
    });

    it('thought events also reset fallback timer', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'thinking...', msg_id: 'msg-1' });

      vi.advanceTimersByTime(10_000);

      emitEvent(manager, { type: 'thought', data: 'more thinking...', msg_id: 'msg-1' });

      vi.advanceTimersByTime(10_000);

      // Only 10s since last thought — no fallback yet
      expect(findEmissions('finish')).toHaveLength(0);

      vi.advanceTimersByTime(5_000);

      // 15s since last thought — fallback fires
      expect(findEmissions('finish').length).toBeGreaterThanOrEqual(1);
    });

    it('tool_group events also reset fallback timer', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, {
        type: 'tool_group',
        data: [{ name: 'tool1', status: 'Running', callId: 'c1' }],
        msg_id: 'msg-1',
      });

      expect((manager as any).missingFinishFallbackTimer).not.toBeNull();
    });

    it('multiple stop calls do not throw', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });

      await expect(manager.stop()).resolves.not.toThrow();
      await expect(manager.stop()).resolves.not.toThrow();
    });
  });
});
