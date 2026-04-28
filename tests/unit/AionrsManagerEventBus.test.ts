/**
 * GAP-8: AionrsManager Multi EventBus Emission — Black-box tests
 *
 * Tests based on GAP-8-plan.md acceptance criteria.
 * Validates that AionrsManager emits events to teamEventBus
 * in addition to ipcBridge, matching AcpAgentManager pattern.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────

const {
  emitResponseStream,
  onResponseStream,
  responseStreamCallbacks,
  emitConfirmationAdd,
  emitConfirmationUpdate,
  emitConfirmationRemove,
  mockDb,
  mockTeamEventBusEmit,
} = vi.hoisted(() => {
  const callbacks: Array<(msg: unknown) => void> = [];
  return {
    emitResponseStream: vi.fn(),
    onResponseStream: vi.fn((cb: (msg: unknown) => void) => {
      callbacks.push(cb);
      return () => {
        const i = callbacks.indexOf(cb);
        if (i >= 0) callbacks.splice(i, 1);
      };
    }),
    responseStreamCallbacks: callbacks,
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
  };
});

// ── Module mocks ───────────────────────────────────────────────────

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: { emit: emitResponseStream, on: onResponseStream },
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

const CONV_ID = 'conv-eb-1';

function createManager(conversationId = CONV_ID): AionrsManager {
  const data = {
    workspace: '/test/workspace',
    model: { name: 'test-provider', use_model: 'test-model', base_url: '', platform: 'test' },
    conversation_id: conversationId,
  };
  return new AionrsManager(data as any, data.model as any);
}

function emitEvent(manager: AionrsManager, event: Record<string, unknown>) {
  const payload = { ...event, conversation_id: (manager as any).conversation_id };
  for (const cb of responseStreamCallbacks) cb(payload);
}

function findTeamEmissions() {
  return mockTeamEventBusEmit.mock.calls;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('GAP-8: AionrsManager Multi EventBus Emission', () => {
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

  // ── AC-2: teamEventBus receives only terminal events ────────────

  describe('AC-2: teamEventBus receives only terminal events (finish/error)', () => {
    it('emits finish event to teamEventBus', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      const teamCalls = findTeamEmissions();
      expect(teamCalls.length).toBeGreaterThanOrEqual(1);

      const [eventName, payload] = teamCalls.find(([, d]: [string, any]) => d.type === 'finish')!;
      expect(eventName).toBe('responseStream');
      expect(payload.conversation_id).toBe(CONV_ID);
    });

    it('emits error event to teamEventBus', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'error', data: 'something failed', msg_id: 'msg-1' });

      const teamCalls = findTeamEmissions();
      const errorCalls = teamCalls.filter(([, data]: [string, any]) => data.type === 'error');
      expect(errorCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('does NOT emit content event to teamEventBus', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: 'hello', msg_id: 'msg-1' });

      const teamCalls = findTeamEmissions();
      const contentCalls = teamCalls.filter(([, data]: [string, any]) => data.type === 'content');
      expect(contentCalls).toHaveLength(0);
    });

    it('does NOT emit tool_group event to teamEventBus', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, {
        type: 'tool_group',
        data: [{ name: 'tool1', status: 'Running', call_id: 'c1' }],
        msg_id: 'msg-1',
      });

      const teamCalls = findTeamEmissions();
      const toolCalls = teamCalls.filter(([, data]: [string, any]) => data.type === 'tool_group');
      expect(toolCalls).toHaveLength(0);
    });
  });

  // ── AC-4: thinking does NOT emit to teamEventBus ────────────────

  describe('AC-4: thinking messages do not emit to teamEventBus', () => {
    it('thinking event does NOT emit to teamEventBus', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'thought', data: 'pondering...', msg_id: 'msg-1' });

      const teamCalls = findTeamEmissions();
      const thinkingCalls = teamCalls.filter(([, data]: [string, any]) => data.type === 'thinking');
      expect(thinkingCalls).toHaveLength(0);
    });
  });

  // ── AC-5: request_trace does NOT emit to teamEventBus ───────────

  describe('AC-5: request_trace does not emit to teamEventBus', () => {
    it('start event (request_trace) does NOT emit to teamEventBus', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });

      const teamCalls = findTeamEmissions();
      const traceCalls = teamCalls.filter(([, data]: [string, any]) => data.type === 'request_trace');
      expect(traceCalls).toHaveLength(0);
    });
  });

  // ── AC-6: cron system messages stay ipcBridge-only ──────────────

  describe('AC-6: cron system messages stay ipcBridge-only', () => {
    it('system messages from cron do NOT emit to teamEventBus', async () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'content', data: '[CRON_LIST]', msg_id: 'msg-1' });

      // Clear mocks to isolate cron emissions from prior events
      mockTeamEventBusEmit.mockClear();

      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      // Wait for async handleTurnEnd to process cron commands
      await vi.advanceTimersByTimeAsync(200);

      const teamCalls = findTeamEmissions();
      const systemCalls = teamCalls.filter(([, data]: [string, any]) => data.type === 'system');
      expect(systemCalls).toHaveLength(0);
    });
  });

  // ── AC-7: conversation_id is correctly attached ─────────────────

  describe('AC-7: conversation_id is correctly attached to payloads', () => {
    it('teamEventBus payload includes conversation_id', () => {
      emitEvent(manager, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager, { type: 'finish', data: '', msg_id: 'msg-1' });

      const teamCalls = findTeamEmissions();
      const finishCall = teamCalls.find(([, d]: [string, any]) => d.type === 'finish');
      expect(finishCall).toBeDefined();
      expect(finishCall![1].conversation_id).toBe(CONV_ID);
    });

    it('different conversation IDs are correctly propagated', () => {
      const manager2 = createManager('conv-eb-2');
      vi.spyOn(manager2 as any, 'postMessagePromise').mockResolvedValue(undefined);

      emitEvent(manager2, { type: 'start', data: '', msg_id: 'msg-1' });
      emitEvent(manager2, { type: 'finish', data: '', msg_id: 'msg-1' });

      const teamCalls = findTeamEmissions();
      const finishCall = teamCalls.find(([, d]: [string, any]) => d.conversation_id === 'conv-eb-2');
      expect(finishCall).toBeDefined();
      expect(finishCall![1].conversation_id).toBe('conv-eb-2');
    });
  });
});
