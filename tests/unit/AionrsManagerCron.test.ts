/**
 * GAP-4: AionrsManager Cron Command Feedback Loop — Black-box tests
 *
 * Tests are based on GAP-4-plan.md acceptance criteria ONLY.
 * Do NOT add implementation-specific assertions here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks (vi.mock factories can only reference hoisted values) ─

const {
  emitResponseStream,
  emitCronJobCreated,
  emitCronJobRemoved,
  emitConfirmationAdd,
  emitConfirmationUpdate,
  emitConfirmationRemove,
  mockDb,
  mockCronService,
} = vi.hoisted(() => ({
  emitResponseStream: vi.fn(),
  emitCronJobCreated: vi.fn(),
  emitCronJobRemoved: vi.fn(),
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
  mockCronService: {
    addJob: vi.fn(async (params: any) => ({
      id: 'cron-job-1',
      name: params.name,
      schedule: params.schedule,
      enabled: true,
    })),
    removeJob: vi.fn(async () => {}),
    listJobsByConversation: vi.fn(async () => []),
  },
}));

// ── Mocks ───────────────────────────────────────────────────────────

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
      onJobCreated: { emit: emitCronJobCreated },
      onJobRemoved: { emit: emitCronJobRemoved },
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
  mainError: vi.fn(),
  mainLog: vi.fn(),
}));

vi.mock('@process/services/cron/cronServiceSingleton', () => ({
  cronService: mockCronService,
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

// ── Import under test ───────────────────────────────────────────────

import { AionrsManager } from '@/process/task/AionrsManager';

// ── Helpers ─────────────────────────────────────────────────────────

function createManager(): AionrsManager {
  const data = {
    workspace: '/test/workspace',
    model: { name: 'test-provider', useModel: 'test-model', baseUrl: '', platform: 'test' },
    conversation_id: 'conv-test-1',
  };
  const model = data.model as any;
  return new AionrsManager(data as any, model);
}

/** Simulate a complete turn: start → content deltas → finish */
function simulateTurn(manager: AionrsManager, textChunks: string[], msgId = 'msg-1') {
  (manager as any).emit('aionrs.message', { type: 'start', data: '', msg_id: msgId });
  for (const chunk of textChunks) {
    (manager as any).emit('aionrs.message', { type: 'content', data: chunk, msg_id: msgId });
  }
  (manager as any).emit('aionrs.message', { type: 'finish', data: '', msg_id: msgId });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('GAP-4: AionrsManager Cron Command Feedback Loop', () => {
  let manager: AionrsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createManager();
    // Mock postMessagePromise to prevent actual IPC
    vi.spyOn(manager as any, 'postMessagePromise').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── AC-2: Cron command detection ──────────────────────────────────

  describe('AC-2: detects cron commands on turn end', () => {
    it('detects [CRON_LIST] in accumulated text and triggers cron processing', async () => {
      simulateTurn(manager, ['Here are the tasks: ', '[CRON_LIST]']);
      await vi.waitFor(() => {
        expect(mockCronService.listJobsByConversation).toHaveBeenCalledWith('conv-test-1');
      });
    });

    it('does NOT trigger cron processing when no cron commands present', async () => {
      simulateTurn(manager, ['Just a normal response with no commands.']);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockCronService.listJobsByConversation).not.toHaveBeenCalled();
      expect(mockCronService.addJob).not.toHaveBeenCalled();
      expect(mockCronService.removeJob).not.toHaveBeenCalled();
    });
  });

  // ── AC-3: Cron command execution ──────────────────────────────────

  describe('AC-3: executes cron commands', () => {
    it('executes CRON_CREATE command via cronService', async () => {
      const cronCreateText = `[CRON_CREATE]
name: Daily Report
schedule: 0 9 * * *
schedule_description: Every day at 9 AM
message: Generate daily report
[/CRON_CREATE]`;
      simulateTurn(manager, [cronCreateText]);
      await vi.waitFor(() => {
        expect(mockCronService.addJob).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Daily Report',
            conversationId: 'conv-test-1',
            agentType: 'aionrs',
          })
        );
      });
    });

    it('ignores CRON_DELETE (no longer supported)', async () => {
      simulateTurn(manager, ['[CRON_DELETE: cron-job-42]']);
      await new Promise((r) => setTimeout(r, 100));
      expect(mockCronService.removeJob).not.toHaveBeenCalled();
    });

    it('emits system response to UI via ipcBridge', async () => {
      simulateTurn(manager, ['[CRON_LIST]']);
      await vi.waitFor(() => {
        expect(emitResponseStream).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'system',
            conversation_id: 'conv-test-1',
          })
        );
      });
    });
  });

  // ── AC-4: Feedback loop ───────────────────────────────────────────

  describe('AC-4: sends feedback to aionrs agent', () => {
    it('sends [System Response] feedback via sendMessage after cron execution', async () => {
      const sendSpy = vi.spyOn(manager, 'sendMessage').mockResolvedValue(undefined);
      simulateTurn(manager, ['[CRON_LIST]']);
      await vi.waitFor(() => {
        expect(sendSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('[System Response]'),
          })
        );
      });
    });

    it('feedback message contains cron execution results', async () => {
      mockCronService.listJobsByConversation.mockResolvedValueOnce([
        { id: 'cron-1', name: 'My Task', schedule: { kind: 'cron', expr: '0 9 * * *' }, enabled: true },
      ]);
      const sendSpy = vi.spyOn(manager, 'sendMessage').mockResolvedValue(undefined);
      simulateTurn(manager, ['[CRON_LIST]']);
      await vi.waitFor(() => {
        expect(sendSpy).toHaveBeenCalled();
        const call = sendSpy.mock.calls[0][0] as { content: string };
        expect(call.content).toContain('[System Response]');
        expect(call.content).toContain('My Task');
      });
    });

    it('does NOT send feedback when there are no cron commands', async () => {
      const sendSpy = vi.spyOn(manager, 'sendMessage').mockResolvedValue(undefined);
      simulateTurn(manager, ['No cron commands here.']);
      await new Promise((r) => setTimeout(r, 50));
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  // ── AC-5: State reset ─────────────────────────────────────────────

  describe('AC-5: resets state after turn end', () => {
    it('does not carry over content from previous turn', async () => {
      // Turn 1: has cron command
      simulateTurn(manager, ['[CRON_LIST]'], 'msg-turn-1');
      await vi.waitFor(() => {
        expect(mockCronService.listJobsByConversation).toHaveBeenCalledTimes(1);
      });

      vi.clearAllMocks();

      // Turn 2: no cron command — should not trigger cron processing
      simulateTurn(manager, ['Just a normal reply.'], 'msg-turn-2');
      await new Promise((r) => setTimeout(r, 50));
      expect(mockCronService.listJobsByConversation).not.toHaveBeenCalled();
    });
  });

  // ── AC-6: Error isolation ─────────────────────────────────────────

  describe('AC-6: error isolation', () => {
    it('continues emitting finish event even when cron processing throws', async () => {
      mockCronService.listJobsByConversation.mockRejectedValueOnce(new Error('DB error'));
      expect(() => {
        simulateTurn(manager, ['[CRON_LIST]']);
      }).not.toThrow();
      await new Promise((r) => setTimeout(r, 100));
      // The finish event should still have been emitted to ipcBridge
      expect(emitResponseStream).toHaveBeenCalledWith(expect.objectContaining({ type: 'finish' }));
    });
  });

  // ── AC-1: Text accumulation across deltas ─────────────────────────

  describe('AC-1: accumulates text from incremental deltas', () => {
    it('accumulates text across multiple content events for cron detection', async () => {
      // The cron command is split across multiple deltas
      simulateTurn(manager, ['[CRON_', 'LIST', ']']);
      await vi.waitFor(() => {
        expect(mockCronService.listJobsByConversation).toHaveBeenCalledWith('conv-test-1');
      });
    });

    it('handles mixed content with cron commands split across deltas', async () => {
      const sendSpy = vi.spyOn(manager, 'sendMessage').mockResolvedValue(undefined);
      simulateTurn(manager, ['Let me check your scheduled tasks.\n\n', '[CRON_', 'LIST]\n\nHere are the results.']);
      await vi.waitFor(() => {
        expect(mockCronService.listJobsByConversation).toHaveBeenCalled();
        expect(sendSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('[System Response]'),
          })
        );
      });
    });
  });

  // ── White-box: boundary & edge cases ──────────────────────────────

  describe('Edge cases', () => {
    it('handles multiple cron commands in one turn', async () => {
      const sendSpy = vi.spyOn(manager, 'sendMessage').mockResolvedValue(undefined);
      const text = `[CRON_CREATE]
name: Morning Report
schedule: 0 9 * * *
schedule_description: Every day at 9 AM
message: Generate morning report
[/CRON_CREATE]

[CRON_LIST]`;
      simulateTurn(manager, [text]);
      await vi.waitFor(() => {
        expect(mockCronService.addJob).toHaveBeenCalled();
        expect(mockCronService.listJobsByConversation).toHaveBeenCalled();
        expect(sendSpy).toHaveBeenCalled();
      });
    });

    it('handles consecutive turns each with cron commands', async () => {
      const sendSpy = vi.spyOn(manager, 'sendMessage').mockResolvedValue(undefined);

      // Turn 1
      simulateTurn(manager, ['[CRON_LIST]'], 'msg-t1');
      await vi.waitFor(() => {
        expect(mockCronService.listJobsByConversation).toHaveBeenCalledTimes(1);
      });

      vi.clearAllMocks();
      sendSpy.mockResolvedValue(undefined);

      // Turn 2 — another cron command (CRON_DELETE is ignored, use CRON_LIST instead)
      simulateTurn(manager, ['[CRON_LIST]'], 'msg-t2');
      await vi.waitFor(() => {
        expect(mockCronService.listJobsByConversation).toHaveBeenCalledTimes(1);
      });
    });

    it('handles empty content on finish (no start event)', async () => {
      // Directly emit finish without any content — should not crash
      (manager as any).emit('aionrs.message', { type: 'finish', data: '', msg_id: 'msg-empty' });
      await new Promise((r) => setTimeout(r, 50));
      expect(mockCronService.listJobsByConversation).not.toHaveBeenCalled();
    });

    it('handles non-string content data gracefully', async () => {
      (manager as any).emit('aionrs.message', { type: 'start', data: '', msg_id: 'msg-x' });
      // Non-string data should be ignored (not accumulated)
      (manager as any).emit('aionrs.message', { type: 'content', data: 12345, msg_id: 'msg-x' });
      (manager as any).emit('aionrs.message', { type: 'finish', data: '', msg_id: 'msg-x' });
      await new Promise((r) => setTimeout(r, 50));
      expect(mockCronService.listJobsByConversation).not.toHaveBeenCalled();
    });

    it('cron commands inside code blocks are NOT executed', async () => {
      const text = "Here's an example:\n```\n[CRON_LIST]\n```";
      simulateTurn(manager, [text]);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockCronService.listJobsByConversation).not.toHaveBeenCalled();
    });

    it('captures cron execution error as system response feedback', async () => {
      // When cronService fails, the error is captured by MessageMiddleware
      // and returned as an error response string (not thrown)
      mockCronService.listJobsByConversation.mockRejectedValueOnce(new Error('Service down'));
      const sendSpy = vi.spyOn(manager, 'sendMessage').mockResolvedValue(undefined);
      simulateTurn(manager, ['[CRON_LIST]']);
      await vi.waitFor(() => {
        expect(sendSpy).toHaveBeenCalled();
        const call = sendSpy.mock.calls[0][0] as { content: string };
        expect(call.content).toContain('[System Response]');
        expect(call.content).toContain('Service down');
      });
    });
  });
});
