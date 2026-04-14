/**
 * GAP-7: AionrsManager Buffered Stream DB Writes — Black-box tests
 *
 * Tests based on GAP-7-plan.md acceptance criteria.
 * Validates that AionrsManager batches streaming text writes to DB
 * with a 120ms flush interval instead of writing per-chunk.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────

const {
  emitResponseStream,
  emitConfirmationAdd,
  emitConfirmationUpdate,
  emitConfirmationRemove,
  mockDb,
  mockTeamEventBusEmit,
  mockChannelEmitAgentMessage,
  mockAddOrUpdateMessage,
} = vi.hoisted(() => ({
  emitResponseStream: vi.fn(),
  emitConfirmationAdd: vi.fn(),
  emitConfirmationUpdate: vi.fn(),
  emitConfirmationRemove: vi.fn(),
  mockDb: {
    getConversationMessages: vi.fn(() => ({ data: [] })),
    getConversation: vi.fn(() => ({ success: true, data: { type: 'aionrs', extra: {} } })),
    updateConversation: vi.fn(),
    createConversation: vi.fn(() => ({ success: true })),
    insertMessage: vi.fn(),
    updateMessage: vi.fn(),
  },
  mockTeamEventBusEmit: vi.fn(),
  mockChannelEmitAgentMessage: vi.fn(),
  mockAddOrUpdateMessage: vi.fn(),
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

vi.mock('@process/team/teamEventBus', () => ({
  teamEventBus: { emit: mockTeamEventBusEmit },
}));

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: { emitAgentMessage: mockChannelEmitAgentMessage },
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
  mainWarn: vi.fn(),
}));

vi.mock('@process/services/cron/cronServiceSingleton', () => ({
  cronService: {
    addJob: vi.fn(async () => ({ id: 'cron-1', name: 'test', enabled: true })),
    removeJob: vi.fn(async () => {}),
    listJobsByConversation: vi.fn(async () => []),
  },
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: {
    setProcessing: vi.fn(),
    isProcessing: vi.fn(() => false),
  },
}));

vi.mock('@/process/task/ConversationTurnCompletionService', () => ({
  ConversationTurnCompletionService: {
    getInstance: vi.fn(() => ({
      notifyPotentialCompletion: vi.fn().mockResolvedValue(undefined),
    })),
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

const CONV_ID = 'conv-sb-1';
const FLUSH_INTERVAL_MS = 120;
const FALLBACK_DELAY_MS = 15_000;

function createManager(conversationId = CONV_ID): AionrsManager {
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

function getTextDbWrites() {
  return mockAddOrUpdateMessage.mock.calls.filter(([, msg]: [string, any]) => msg.type === 'text');
}

// ── Tests ──────────────────────────────────────────────────────────

describe('GAP-7: AionrsManager Buffered Stream DB Writes', () => {
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

  // ── AC-1: Content events are buffered, not written per-chunk ─────

  describe('AC-1: Streaming content is buffered', () => {
    it('does not write to DB immediately on first content chunk', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'hello ', msg_id: 'msg-1' });

      // No DB write yet — chunk is buffered
      const textWrites = getTextDbWrites();
      expect(textWrites).toHaveLength(0);
    });

    it('does not write per-chunk for rapid sequential content', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'chunk1 ', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'chunk2 ', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'chunk3 ', msg_id: 'msg-1' });

      // Still no DB writes — all buffered
      const textWrites = getTextDbWrites();
      expect(textWrites).toHaveLength(0);
    });
  });

  // ── AC-2: Buffer flushes after 120ms idle ────────────────────────

  describe('AC-2: Buffer flushes after 120ms', () => {
    it('writes accumulated content to DB after 120ms', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'hello ', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'world', msg_id: 'msg-1' });

      vi.advanceTimersByTime(FLUSH_INTERVAL_MS);

      const textWrites = getTextDbWrites();
      expect(textWrites.length).toBeGreaterThanOrEqual(1);

      // The flushed message should contain accumulated content
      const [, msg] = textWrites[textWrites.length - 1];
      expect(msg.content.content).toContain('hello ');
      expect(msg.content.content).toContain('world');
    });
  });

  // ── AC-3: Non-text messages flush buffer + write immediately ─────

  describe('AC-3: Non-text messages flush buffer and write immediately', () => {
    it('flushes pending buffer when tool_group arrives', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'before-tool ', msg_id: 'msg-1' });

      // No writes yet
      expect(getTextDbWrites()).toHaveLength(0);

      // tool_group should flush the pending text buffer
      emitEvent(manager, {
        type: 'tool_group',
        data: [{ name: 'tool1', status: 'Running', callId: 'c1' }],
        msg_id: 'msg-1',
      });

      const textWrites = getTextDbWrites();
      expect(textWrites.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── AC-4: Finish flushes all pending buffers ─────────────────────

  describe('AC-4: Finish event flushes all pending buffers', () => {
    it('flushes buffer on finish event', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'buffered text', msg_id: 'msg-1' });

      // Not flushed yet
      expect(getTextDbWrites()).toHaveLength(0);

      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      const textWrites = getTextDbWrites();
      expect(textWrites.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── AC-5: Fallback finish flushes all pending buffers ────────────

  describe('AC-5: Fallback finish flushes pending buffers', () => {
    it('flushes buffer on fallback timeout', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'buffered data', msg_id: 'msg-1' });

      expect(getTextDbWrites()).toHaveLength(0);

      // Trigger fallback (no finish event)
      vi.advanceTimersByTime(FALLBACK_DELAY_MS);

      const textWrites = getTextDbWrites();
      expect(textWrites.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── AC-6: stop() flushes all pending buffers ─────────────────────

  describe('AC-6: stop() flushes pending buffers', () => {
    it('flushes buffer when stop is called', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'pending text', msg_id: 'msg-1' });

      expect(getTextDbWrites()).toHaveLength(0);

      await manager.stop();

      const textWrites = getTextDbWrites();
      expect(textWrites.length).toBeGreaterThanOrEqual(1);
    });
  });
});
