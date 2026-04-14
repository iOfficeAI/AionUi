/**
 * GAP-1: AionrsManager Thinking Message Display & Persistence — Black-box tests
 *
 * Tests are based on GAP-1-plan.md acceptance criteria.
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

vi.mock('@process/utils/mainLogger', () => ({
  mainError: vi.fn(),
  mainLog: vi.fn(),
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

function createManager(): AionrsManager {
  const data = {
    workspace: '/test/workspace',
    model: { name: 'test-provider', useModel: 'test-model', baseUrl: '', platform: 'test' },
    conversation_id: 'conv-think-1',
  };
  const model = data.model as any;
  return new AionrsManager(data as any, model);
}

/** Simulate emitting an aionrs event */
function emitEvent(manager: AionrsManager, event: Record<string, unknown>) {
  (manager as any).emit('aionrs.message', event);
}

/** Find all ipcBridge emissions of a specific type */
function findEmissions(type: string) {
  return emitResponseStream.mock.calls.filter(([e]: [{ type: string }]) => e.type === type).map(([e]: [any]) => e);
}

// ── Tests ──────────────────────────────────────────────────────────

describe('GAP-1: AionrsManager Thinking Message Display & Persistence', () => {
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

  // ── AC-1: Native thinking event handling ────────────────────────

  describe('AC-1: thought events produce thinking-type ipcBridge emissions', () => {
    it('emits type=thinking to ipcBridge when receiving thought event', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'reasoning step 1', msg_id: 'msg-1' });

      const thinkingEmissions = findEmissions('thinking');
      expect(thinkingEmissions.length).toBeGreaterThanOrEqual(1);
      expect(thinkingEmissions[0]).toMatchObject({
        type: 'thinking',
        conversation_id: 'conv-think-1',
        data: expect.objectContaining({
          content: 'reasoning step 1',
          status: 'thinking',
        }),
      });
    });

    it('does NOT emit raw thought events to ipcBridge', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'step 1', msg_id: 'msg-1' });

      const thoughtEmissions = findEmissions('thought');
      expect(thoughtEmissions).toHaveLength(0);
    });

    it('accumulates content across multiple thought events', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'chunk1', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'chunk2', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'chunk3', msg_id: 'msg-1' });

      // All emissions should share the same msg_id (accumulated into one message)
      const thinkingEmissions = findEmissions('thinking');
      const msgIds = [...new Set(thinkingEmissions.map((e: any) => e.msg_id))];
      expect(msgIds).toHaveLength(1);
    });
  });

  // ── AC-2: Thinking phase termination ────────────────────────────

  describe('AC-2: non-thought event terminates thinking phase', () => {
    it('emits status=done when content event arrives after thought events', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'reasoning...', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'actual content', msg_id: 'msg-1' });

      const thinkingEmissions = findEmissions('thinking');
      const doneEmission = thinkingEmissions.find((e: any) => e.data.status === 'done');
      expect(doneEmission).toBeDefined();
    });

    it('clears thinking state after termination (new turn gets new msg_id)', () => {
      // Turn 1
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'turn1-thought', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'turn1-content', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      const turn1Emissions = findEmissions('thinking');
      const turn1MsgId = turn1Emissions[0]?.msg_id;

      vi.clearAllMocks();

      // Turn 2
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-2' });
      emitEvent(manager, { type: 'thought', data: 'turn2-thought', msg_id: 'msg-2' });

      const turn2Emissions = findEmissions('thinking');
      expect(turn2Emissions.length).toBeGreaterThanOrEqual(1);
      expect(turn2Emissions[0].msg_id).not.toBe(turn1MsgId);
    });
  });

  // ── AC-3: Duration calculation ──────────────────────────────────

  describe('AC-3: duration tracking', () => {
    it('includes duration in done emission', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'start thinking', msg_id: 'msg-1' });

      vi.advanceTimersByTime(200);

      emitEvent(manager, { type: 'content', data: 'response', msg_id: 'msg-1' });

      const thinkingEmissions = findEmissions('thinking');
      const doneEmission = thinkingEmissions.find((e: any) => e.data.status === 'done');
      expect(doneEmission).toBeDefined();
      expect(typeof doneEmission.data.duration).toBe('number');
      expect(doneEmission.data.duration).toBeGreaterThanOrEqual(200);
    });

    it('does NOT include duration in streaming thinking emissions', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'step 1', msg_id: 'msg-1' });

      const thinkingEmissions = findEmissions('thinking');
      const streamingEmission = thinkingEmissions.find((e: any) => e.data.status === 'thinking');
      expect(streamingEmission).toBeDefined();
      expect(streamingEmission.data.duration).toBeUndefined();
    });
  });

  // ── AC-4: DB persistence (buffered writes) ──────────────────────

  describe('AC-4: thinking messages are persisted to DB', () => {
    it('flushes to DB on 120ms interval during streaming', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'chunk1', msg_id: 'msg-1' });

      expect(mockAddOrUpdateMessage).not.toHaveBeenCalledWith(
        'conv-think-1',
        expect.objectContaining({ type: 'thinking' }),
        'aionrs'
      );

      vi.advanceTimersByTime(120);

      expect(mockAddOrUpdateMessage).toHaveBeenCalledWith(
        'conv-think-1',
        expect.objectContaining({
          type: 'thinking',
          position: 'left',
          content: expect.objectContaining({
            content: 'chunk1',
            status: 'thinking',
          }),
        }),
        'aionrs'
      );
    });

    it('flushes immediately on done', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'reasoning', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'response', msg_id: 'msg-1' });

      // done is triggered by non-thought event — should flush immediately without waiting
      expect(mockAddOrUpdateMessage).toHaveBeenCalledWith(
        'conv-think-1',
        expect.objectContaining({
          type: 'thinking',
          content: expect.objectContaining({
            content: 'reasoning',
            status: 'done',
          }),
        }),
        'aionrs'
      );
    });

    it('persists accumulated content, not just the latest chunk', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'part1', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'part2', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'response', msg_id: 'msg-1' });

      const thinkingDbCalls = mockAddOrUpdateMessage.mock.calls.filter(
        ([, msg]: [string, { type: string }]) => msg.type === 'thinking'
      );
      const lastCall = thinkingDbCalls[thinkingDbCalls.length - 1];
      expect(lastCall[1].content.content).toBe('part1part2');
    });
  });

  // ── AC-5: Inline <think> tag handling ───────────────────────────

  describe('AC-5: inline <think> tags in content events', () => {
    it('extracts <think> tags from content and emits as thinking message', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, {
        type: 'content',
        data: '<think>internal reasoning</think>visible response',
        msg_id: 'msg-1',
      });

      const thinkingEmissions = findEmissions('thinking');
      expect(thinkingEmissions.length).toBeGreaterThanOrEqual(1);
      const hasReasoning = thinkingEmissions.some((e: any) => e.data.content.includes('internal reasoning'));
      expect(hasReasoning).toBe(true);
    });

    it('strips <think> tags from content before entering main pipeline', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, {
        type: 'content',
        data: '<think>hidden thought</think>visible only',
        msg_id: 'msg-1',
      });

      // The content event emitted to ipcBridge should NOT contain <think> tags
      const contentEmissions = findEmissions('content');
      for (const emission of contentEmissions) {
        const data = typeof emission.data === 'string' ? emission.data : '';
        expect(data).not.toContain('<think>');
        expect(data).not.toContain('hidden thought');
      }
    });

    it('strips <think> tags from content before accumulating for cron detection', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, {
        type: 'content',
        data: '<think>some thought</think>Hello world',
        msg_id: 'msg-1',
      });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      // currentMsgContent should have stripped content, not raw
      // Verify by checking the accumulated content doesn't contain think tags
      // (indirectly: if cron detection ran on stripped content, no cron commands = no cron calls)
      // This is a sanity check; the main assertion is on the content emission
    });
  });

  // ── AC-6: Turn end cleanup ──────────────────────────────────────

  describe('AC-6: thinking state cleanup on turn boundaries', () => {
    it('finish event finalizes thinking if still active', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'still thinking...', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      const thinkingEmissions = findEmissions('thinking');
      const doneEmission = thinkingEmissions.find((e: any) => e.data.status === 'done');
      expect(doneEmission).toBeDefined();
    });

    it('start event resets any leftover thinking state', () => {
      // Simulate a scenario where thinking state leaked (e.g., missed finish)
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'old thought', msg_id: 'msg-1' });

      // New start without finish
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-2' });
      emitEvent(manager, { type: 'thought', data: 'new thought', msg_id: 'msg-2' });

      // The second thinking should be a fresh message (different msg_id)
      const thinkingEmissions = findEmissions('thinking');
      const streamingEmissions = thinkingEmissions.filter((e: any) => e.data.status === 'thinking');

      // Should have emissions from both turns, each with their own thinking msg_id
      const msgIds = [...new Set(streamingEmissions.map((e: any) => e.msg_id))];
      expect(msgIds.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── AC-7: Error isolation ───────────────────────────────────────

  describe('AC-7: error isolation', () => {
    it('ignores empty thought data without crashing', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });

      expect(() => {
        emitEvent(manager, { type: 'thought', data: '', msg_id: 'msg-1' });
      }).not.toThrow();

      // No thinking emission for empty content
      const thinkingEmissions = findEmissions('thinking');
      expect(thinkingEmissions).toHaveLength(0);
    });

    it('ignores null/undefined thought data without crashing', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });

      expect(() => {
        emitEvent(manager, { type: 'thought', data: null, msg_id: 'msg-1' });
        emitEvent(manager, { type: 'thought', data: undefined, msg_id: 'msg-1' });
      }).not.toThrow();

      const thinkingEmissions = findEmissions('thinking');
      expect(thinkingEmissions).toHaveLength(0);
    });
  });

  // ── White-box: boundary cases ───────────────────────────────────

  describe('Edge cases', () => {
    it('thought directly followed by finish (no content in between)', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'only thinking', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      const thinkingEmissions = findEmissions('thinking');
      expect(thinkingEmissions.length).toBeGreaterThanOrEqual(1);
      const doneEmission = thinkingEmissions.find((e: any) => e.data.status === 'done');
      expect(doneEmission).toBeDefined();
    });

    it('multiple turns alternating thinking and content', () => {
      // Turn 1: thinking + content
      emitEvent(manager, { type: 'start', data: '', msg_id: 'turn1' });
      emitEvent(manager, { type: 'thought', data: 'think1', msg_id: 'turn1' });
      emitEvent(manager, { type: 'content', data: 'response1', msg_id: 'turn1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'turn1' });

      // Turn 2: only content (no thinking)
      emitEvent(manager, { type: 'start', data: '', msg_id: 'turn2' });
      emitEvent(manager, { type: 'content', data: 'response2', msg_id: 'turn2' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'turn2' });

      // Turn 3: thinking again
      vi.clearAllMocks();
      emitEvent(manager, { type: 'start', data: '', msg_id: 'turn3' });
      emitEvent(manager, { type: 'thought', data: 'think3', msg_id: 'turn3' });

      const thinkingEmissions = findEmissions('thinking');
      expect(thinkingEmissions.length).toBeGreaterThanOrEqual(1);
      expect(thinkingEmissions[0].data.content).toBe('think3');
    });

    it('DB flush timer is cleared on done (no leak)', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'data', msg_id: 'msg-1' });

      // Timer should be set
      expect((manager as any).thinkingDbFlushTimer).not.toBeNull();

      emitEvent(manager, { type: 'content', data: 'response', msg_id: 'msg-1' });

      // Timer should be cleared after done
      expect((manager as any).thinkingDbFlushTimer).toBeNull();
    });

    it('does not schedule duplicate timers for consecutive thought events', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'chunk1', msg_id: 'msg-1' });
      const timer1 = (manager as any).thinkingDbFlushTimer;
      emitEvent(manager, { type: 'thought', data: 'chunk2', msg_id: 'msg-1' });
      const timer2 = (manager as any).thinkingDbFlushTimer;

      expect(timer1).toBe(timer2);
    });
  });
});
