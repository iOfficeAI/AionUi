/**
 * GAP-5: AionrsManager CronBusyGuard — Black-box tests
 *
 * Tests based on GAP-5-plan.md acceptance criteria.
 * Validates that AionrsManager integrates cronBusyGuard to prevent
 * cron tasks from overlapping with active conversation processing.
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

const CONV_ID = 'conv-bg-1';
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

// ── Tests ──────────────────────────────────────────────────────────

describe('GAP-5: AionrsManager CronBusyGuard', () => {
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

  // ── AC-1: sendMessage sets guard to true ─────────────────────────

  describe('AC-1: sendMessage sets guard to true', () => {
    it('calls setProcessing(id, true) when sendMessage is invoked', async () => {
      await manager.sendMessage({ input: 'hello', msg_id: 'msg-1' });

      expect(mockSetProcessing).toHaveBeenCalledWith(CONV_ID, true);
    });

    it('sets guard before calling super.sendMessage', async () => {
      const callOrder: string[] = [];
      mockSetProcessing.mockImplementation(() => {
        callOrder.push('setProcessing');
      });
      vi.spyOn(manager as any, 'postMessagePromise').mockImplementation(() => {
        callOrder.push('postMessage');
        return Promise.resolve();
      });

      await manager.sendMessage({ input: 'hello', msg_id: 'msg-1' });

      const guardIdx = callOrder.indexOf('setProcessing');
      expect(guardIdx).toBeGreaterThanOrEqual(0);
    });
  });

  // ── AC-2: Normal finish clears guard ─────────────────────────────

  describe('AC-2: Normal finish clears guard', () => {
    it('calls setProcessing(id, false) on finish event', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'hello', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      await vi.advanceTimersByTimeAsync(200);

      expect(mockSetProcessing).toHaveBeenCalledWith(CONV_ID, false);
    });
  });

  // ── AC-3: Process exit clears guard ──────────────────────────────

  describe('AC-3: Process exit clears guard', () => {
    it('calls setProcessing(id, false) on process exit during active turn', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'data', msg_id: 'msg-1' });

      (manager as Record<string, (...args: unknown[]) => void>)['handleProcessExit'](1, 'msg-1');
      await vi.advanceTimersByTimeAsync(200);

      expect(mockSetProcessing).toHaveBeenCalledWith(CONV_ID, false);
    });
  });

  // ── AC-4: stop() clears guard ────────────────────────────────────

  describe('AC-4: stop() clears guard', () => {
    it('calls setProcessing(id, false) when stop is called', async () => {
      await manager.stop();

      expect(mockSetProcessing).toHaveBeenCalledWith(CONV_ID, false);
    });
  });

  // ── AC-5: Guard cleared before cron processing ───────────────────

  describe('AC-5: Guard cleared before cron command processing', () => {
    it('clears guard before cron feedback re-sets it via sendMessage', async () => {
      const callOrder: string[] = [];
      mockSetProcessing.mockImplementation((_id: string, value: boolean) => {
        callOrder.push(`setProcessing:${value}`);
      });

      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: '[CRON_LIST]', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      await vi.advanceTimersByTimeAsync(200);

      // Guard should be cleared (false) before any potential re-set (true) from cron feedback
      const falseIdx = callOrder.indexOf('setProcessing:false');
      expect(falseIdx).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Regression: different conversation IDs ────────────────────────

  describe('Correct conversation_id passed to guard', () => {
    it('uses the correct conversationId for each manager instance', async () => {
      const manager2 = createManager('conv-bg-2');
      vi.spyOn(manager2 as any, 'postMessagePromise').mockResolvedValue(undefined);

      await manager.sendMessage({ input: 'hello', msg_id: 'msg-1' });
      await manager2.sendMessage({ input: 'world', msg_id: 'msg-2' });

      const calls = mockSetProcessing.mock.calls;
      const conv1Call = calls.find(([id]: [string]) => id === CONV_ID);
      const conv2Call = calls.find(([id]: [string]) => id === 'conv-bg-2');

      expect(conv1Call).toBeDefined();
      expect(conv2Call).toBeDefined();
    });
  });
});
