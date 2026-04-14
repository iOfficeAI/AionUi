/**
 * GAP-9: AionrsManager Turn Completion Service — Black-box tests
 *
 * Tests based on GAP-9-plan.md acceptance criteria.
 * Validates that AionrsManager calls ConversationTurnCompletionService
 * on turn completion (normal finish and fallback finish).
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
  mockNotifyPotentialCompletion,
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
  mockNotifyPotentialCompletion: vi.fn().mockResolvedValue(undefined),
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

vi.mock('./ConversationTurnCompletionService', async () => {
  const actual = await vi.importActual<typeof import('@/process/task/ConversationTurnCompletionService')>(
    '@/process/task/ConversationTurnCompletionService'
  );
  return actual;
});

vi.mock('@/process/task/ConversationTurnCompletionService', () => ({
  ConversationTurnCompletionService: {
    getInstance: vi.fn(() => ({
      notifyPotentialCompletion: mockNotifyPotentialCompletion,
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

const CONV_ID = 'conv-tc-1';
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

describe('GAP-9: AionrsManager Turn Completion Service', () => {
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

  // ── AC-1: Normal finish calls notifyPotentialCompletion ──────────

  describe('AC-1: Normal finish triggers notifyPotentialCompletion', () => {
    it('calls notifyPotentialCompletion on finish event', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'hello', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      // Allow async handleTurnEnd to complete
      await vi.advanceTimersByTimeAsync(200);

      expect(mockNotifyPotentialCompletion).toHaveBeenCalledTimes(1);
    });

    it('passes correct conversationId', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      await vi.advanceTimersByTimeAsync(200);

      expect(mockNotifyPotentialCompletion).toHaveBeenCalledWith(CONV_ID, expect.any(Object));
    });

    it('passes correct context fields (status, workspace, backend, pendingConfirmations, modelId)', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'response text', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      await vi.advanceTimersByTimeAsync(200);

      expect(mockNotifyPotentialCompletion).toHaveBeenCalledWith(
        CONV_ID,
        expect.objectContaining({
          status: 'finished',
          workspace: '/test/workspace',
          backend: 'aionrs',
          pendingConfirmations: 0,
          modelId: 'test-model',
        })
      );
    });
  });

  // ── AC-2: Fallback finish calls notifyPotentialCompletion ────────

  describe('AC-2: Fallback finish triggers notifyPotentialCompletion', () => {
    it('calls notifyPotentialCompletion on fallback timeout', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'data', msg_id: 'msg-1' });

      // No finish event — trigger fallback
      await vi.advanceTimersByTimeAsync(FALLBACK_DELAY_MS);

      expect(mockNotifyPotentialCompletion).toHaveBeenCalledTimes(1);
    });

    it('fallback passes correct context fields', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'data', msg_id: 'msg-1' });

      await vi.advanceTimersByTimeAsync(FALLBACK_DELAY_MS);

      expect(mockNotifyPotentialCompletion).toHaveBeenCalledWith(
        CONV_ID,
        expect.objectContaining({
          status: 'finished',
          workspace: '/test/workspace',
          backend: 'aionrs',
        })
      );
    });
  });

  // ── AC-3: Notification fires even without cron commands ──────────

  describe('AC-3: Notification fires even without cron commands', () => {
    it('notifies when turn content has no cron commands', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'plain text response', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      await vi.advanceTimersByTimeAsync(200);

      expect(mockNotifyPotentialCompletion).toHaveBeenCalledTimes(1);
    });

    it('notifies when turn has empty content', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      await vi.advanceTimersByTimeAsync(200);

      expect(mockNotifyPotentialCompletion).toHaveBeenCalledTimes(1);
    });
  });

  // ── AC-4: Notification fires even with cron commands ─────────────

  describe('AC-4: Notification fires even with cron commands', () => {
    it('notifies when turn content includes cron commands', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: '[CRON_LIST]', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      await vi.advanceTimersByTimeAsync(200);

      expect(mockNotifyPotentialCompletion).toHaveBeenCalledTimes(1);
    });
  });

  // ── AC-5: Different conversation IDs propagated correctly ────────

  describe('AC-5: Different conversation IDs work correctly', () => {
    it('uses the correct conversationId for each manager instance', async () => {
      const manager2 = createManager('conv-tc-2');
      vi.spyOn(manager2 as any, 'postMessagePromise').mockResolvedValue(undefined);

      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });
      emitEvent(manager2, { type: 'start', data: '', msg_id: 'msg-2' });
      emitEvent(manager2, { type: 'finish', data: '', msg_id: 'msg-2' });

      await vi.advanceTimersByTimeAsync(200);

      const calls = mockNotifyPotentialCompletion.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0][0]).toBe(CONV_ID);
      expect(calls[1][0]).toBe('conv-tc-2');
    });
  });
});
