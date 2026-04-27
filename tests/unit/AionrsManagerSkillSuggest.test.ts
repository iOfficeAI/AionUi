/**
 * GAP-6: AionrsManager Skill Suggest Watcher — Black-box tests
 *
 * Tests based on GAP-6-plan.md acceptance criteria.
 * Validates that AionrsManager calls skillSuggestWatcher.onFinish()
 * on turn end so cron tasks can generate skill suggestions.
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
  responseStreamListeners,
  responseStreamOn,
} = vi.hoisted(() => {
  const listeners: Array<(message: { type: string; conversation_id: string; [key: string]: unknown }) => void> = [];
  return {
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
    responseStreamListeners: listeners,
    responseStreamOn: vi.fn(
      (cb: (message: { type: string; conversation_id: string; [key: string]: unknown }) => void) => {
        listeners.push(cb);
        return () => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        };
      }
    ),
  };
});

// ── Module mocks ───────────────────────────────────────────────────

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: { emit: emitResponseStream, on: responseStreamOn },
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

vi.mock('@process/services/cron/SkillSuggestWatcher', () => ({
  skillSuggestWatcher: {
    onFinish: mockOnFinish,
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

const CONV_ID = 'conv-skill-1';
const FALLBACK_DELAY_MS = 15_000;

function createManager(conversationId = CONV_ID): AionrsManager {
  const data = {
    workspace: '/test/workspace',
    model: { name: 'test-provider', use_model: 'test-model', base_url: '', platform: 'test' },
    conversation_id: conversationId,
  };
  return new AionrsManager(data as any, data.model as any);
}

function emitEvent(manager: AionrsManager, event: Record<string, unknown>) {
  const message = { ...event, conversation_id: (manager as any).conversation_id };
  // Invoke all registered responseStream listeners — source filters by conversation_id internally.
  for (const listener of responseStreamListeners) {
    listener(message as { type: string; conversation_id: string; [key: string]: unknown });
  }
}

// ── Tests ──────────────────────────────────────────────────────────

describe('GAP-6: AionrsManager Skill Suggest Watcher', () => {
  let manager: AionrsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    responseStreamListeners.length = 0;
    manager = createManager();
    vi.spyOn(manager as any, 'postMessagePromise').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── AC-1: Normal finish triggers onFinish ─────────────────────────

  describe('AC-1: Normal finish triggers skillSuggestWatcher.onFinish', () => {
    it('calls onFinish with conversation_id on finish event', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'hello world', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      await vi.advanceTimersByTimeAsync(200);

      expect(mockOnFinish).toHaveBeenCalledWith(CONV_ID);
      expect(mockOnFinish).toHaveBeenCalledTimes(1);
    });
  });

  // ── AC-2: Fallback finish triggers onFinish ───────────────────────
  // NOTE: Fallback timer was removed when AionrsManager became a thin coordination
  // layer that only forwards responseStream events; finalization timing now lives
  // in the backend. This case is retained as a skip for historical reference.

  describe.skip('AC-2: Fallback finish triggers skillSuggestWatcher.onFinish', () => {
    it('calls onFinish when fallback timeout fires', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'data', msg_id: 'msg-1' });

      // No finish event — wait for fallback
      await vi.advanceTimersByTimeAsync(FALLBACK_DELAY_MS);

      expect(mockOnFinish).toHaveBeenCalledWith(CONV_ID);
    });
  });

  // ── AC-3: stop() does not trigger onFinish ────────────────────────

  describe('AC-3: stop() does not trigger onFinish', () => {
    it('does not call onFinish when stop is called', async () => {
      await manager.stop();

      expect(mockOnFinish).not.toHaveBeenCalled();
    });
  });

  // ── AC-4: Correct conversation_id per manager ─────────────────────

  describe('AC-4: Different conversation_ids passed correctly', () => {
    it('passes respective conversation_id for each manager', async () => {
      const manager2 = createManager('conv-skill-2');
      vi.spyOn(manager2 as any, 'postMessagePromise').mockResolvedValue(undefined);

      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'a', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      emitEvent(manager2, { type: 'start', data: '', msg_id: 'msg-2' });
      emitEvent(manager2, { type: 'content', data: 'b', msg_id: 'msg-2' });
      emitEvent(manager2, { type: 'finish', data: '', msg_id: 'msg-2' });

      await vi.advanceTimersByTimeAsync(200);

      expect(mockOnFinish).toHaveBeenCalledWith('conv-skill-1');
      expect(mockOnFinish).toHaveBeenCalledWith('conv-skill-2');
      expect(mockOnFinish).toHaveBeenCalledTimes(2);
    });
  });
});
