/**
 * GAP-10: AionrsManager Performance Monitoring — Black-box tests
 *
 * Tests based on GAP-10-plan.md acceptance criteria.
 * Validates that AionrsManager emits [AIONRS-PERF] logs when
 * transform/DB/pipeline stages exceed their thresholds.
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
  mockSetProcessing,
  mockIsProcessing,
  mockOnFinish,
  mockTransformMessage,
  mockAddOrUpdateMessage,
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
  mockTeamEventBusEmit: vi.fn(),
  mockChannelEmitAgentMessage: vi.fn(),
  mockSetProcessing: vi.fn(),
  mockIsProcessing: vi.fn(() => false),
  mockOnFinish: vi.fn(),
  mockTransformMessage: vi.fn(),
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

const { mockMainLog: _mockMainLog } = vi.hoisted(() => ({
  mockMainLog: vi.fn(),
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainError: vi.fn(),
  mainLog: _mockMainLog,
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
    setProcessing: mockSetProcessing,
    isProcessing: mockIsProcessing,
  },
}));

vi.mock('@/process/task/ConversationTurnCompletionService', () => ({
  ConversationTurnCompletionService: {
    getInstance: vi.fn(() => ({
      notifyPotentialCompletion: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

vi.mock('@process/services/cron/SkillSuggestWatcher', () => ({
  skillSuggestWatcher: { onFinish: mockOnFinish },
}));

vi.mock('@/common/chat/chatLib', () => ({
  transformMessage: mockTransformMessage,
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

const CONV_ID = 'conv-perf-1';

// Mutable clock controlled by tests and mock implementations
let now: number;

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

function perfLogs(): string[] {
  return _mockMainLog.mock.calls
    .flat()
    .filter((arg: unknown) => typeof arg === 'string' && (arg.includes('stream:') || arg.includes('pipeline')));
}

// ── Tests ──────────────────────────────────────────────────────────

describe('GAP-10: AionrsManager Performance Monitoring', () => {
  let manager: AionrsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    // Default: transformMessage returns null (no persist)
    mockTransformMessage.mockReturnValue(null);
    mockAddOrUpdateMessage.mockImplementation(() => {});

    manager = createManager();
    vi.spyOn(manager as any, 'postMessagePromise').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── AC-1: Slow transform logs ─────────────────────────────────────

  describe('AC-1: transform > 5ms triggers [AIONRS-PERF] log', () => {
    it('logs transform duration when transformMessage is slow', () => {
      mockTransformMessage.mockImplementation(() => {
        now += 6; // simulate 6ms transform
        return { type: 'info', id: 'x', position: 'left', conversation_id: CONV_ID, content: {} };
      });

      emitEvent(manager, { type: 'info', data: 'test', msg_id: 'msg-1' });

      const logs = perfLogs();
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs.some((l) => l.includes('transform 6ms'))).toBe(true);
    });
  });

  // ── AC-2: Slow DB logs ────────────────────────────────────────────

  describe('AC-2: DB write > 5ms triggers [AIONRS-PERF] log', () => {
    it('logs db duration when addOrUpdateMessage is slow', () => {
      mockTransformMessage.mockReturnValue({
        type: 'info',
        id: 'x',
        position: 'left',
        conversation_id: CONV_ID,
        content: {},
      });
      mockAddOrUpdateMessage.mockImplementation(() => {
        now += 7; // simulate 7ms DB write
      });

      emitEvent(manager, { type: 'info', data: 'test', msg_id: 'msg-1' });

      const logs = perfLogs();
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs.some((l) => l.includes('db 7ms'))).toBe(true);
    });
  });

  // ── AC-3: Fast operations = no transform/db log ────────────────────

  describe('AC-3: fast transform + DB does not trigger transform/db log', () => {
    it('does not log when both are under 5ms', () => {
      mockTransformMessage.mockReturnValue({
        type: 'info',
        id: 'x',
        position: 'left',
        conversation_id: CONV_ID,
        content: {},
      });
      // No time advance in mocks → 0ms durations

      emitEvent(manager, { type: 'info', data: 'test', msg_id: 'msg-1' });

      const logs = perfLogs();
      expect(logs.filter((l) => l.includes('transform') && l.includes('db'))).toHaveLength(0);
    });
  });

  // ── AC-4: Slow pipeline logs ───────────────────────────────────────

  describe('AC-4: pipeline > 10ms triggers [AIONRS-PERF] pipeline log', () => {
    it('logs pipeline duration when total exceeds 10ms', () => {
      mockTransformMessage.mockImplementation(() => {
        now += 6;
        return { type: 'info', id: 'x', position: 'left', conversation_id: CONV_ID, content: {} };
      });
      mockAddOrUpdateMessage.mockImplementation(() => {
        now += 6; // total = 12ms > 10ms
      });

      emitEvent(manager, { type: 'info', data: 'test', msg_id: 'msg-1' });

      const logs = perfLogs();
      expect(logs.some((l) => l.includes('pipeline'))).toBe(true);
    });
  });

  // ── AC-5: Fast pipeline = no pipeline log ──────────────────────────

  describe('AC-5: pipeline < 10ms does not trigger pipeline log', () => {
    it('does not log pipeline when total is under 10ms', () => {
      mockTransformMessage.mockImplementation(() => {
        now += 3;
        return { type: 'info', id: 'x', position: 'left', conversation_id: CONV_ID, content: {} };
      });
      mockAddOrUpdateMessage.mockImplementation(() => {
        now += 3; // total = 6ms < 10ms
      });

      emitEvent(manager, { type: 'info', data: 'test', msg_id: 'msg-1' });

      const logs = perfLogs();
      expect(logs.filter((l) => l.includes('pipeline'))).toHaveLength(0);
    });
  });

  // ── AC-6: start/thought events have no perf logs ───────────────────

  describe('AC-6: start and thought events do not trigger perf logs', () => {
    it('does not log for start events', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });

      expect(perfLogs()).toHaveLength(0);
    });

    it('does not log for thought events', () => {
      emitEvent(manager, { type: 'thought', data: 'thinking...', msg_id: 'msg-1' });

      expect(perfLogs()).toHaveLength(0);
    });
  });
});
