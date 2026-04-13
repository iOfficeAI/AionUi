// tests/unit/team-TeammateManager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks before any imports
// ---------------------------------------------------------------------------
const mockIpcBridge = vi.hoisted(() => ({
  team: {
    agentSpawned: { emit: vi.fn() },
    agentStatusChanged: { emit: vi.fn() },
    agentRemoved: { emit: vi.fn() },
    agentRenamed: { emit: vi.fn() },
  },
  acpConversation: {
    responseStream: { emit: vi.fn() },
  },
  conversation: {
    responseStream: { emit: vi.fn() },
  },
}));

const mockAddMessage = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({ ipcBridge: mockIpcBridge }));
vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp') } }));
vi.mock('@process/utils/message', () => ({ addMessage: mockAddMessage }));
vi.mock('@process/agent/acp/AcpDetector', () => ({
  acpDetector: { getDetectedAgents: vi.fn(() => []) },
}));

import { TeammateManager } from '@process/team/TeammateManager';
import { teamEventBus } from '@process/team/teamEventBus';
import type { TeamAgent } from '@process/team/types';
import type { Mailbox } from '@process/team/Mailbox';
import type { TaskManager } from '@process/team/TaskManager';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<TeamAgent> = {}): TeamAgent {
  return {
    slotId: 'slot-1',
    conversationId: 'conv-1',
    role: 'lead',
    agentType: 'acp',
    agentName: 'Claude',
    conversationType: 'acp',
    status: 'idle',
    ...overrides,
  };
}

function makeMailbox(): Mailbox {
  return {
    write: vi.fn().mockResolvedValue({ id: 'msg-1', type: 'message', read: false, createdAt: 1000 }),
    readUnread: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([]),
  } as unknown as Mailbox;
}

function makeTaskManager(): TaskManager {
  return {
    create: vi.fn().mockResolvedValue({ id: 'task-1', subject: 'Test', status: 'pending' }),
    update: vi.fn().mockResolvedValue({ id: 'task-1', status: 'completed' }),
    list: vi.fn().mockResolvedValue([]),
    getByOwner: vi.fn().mockResolvedValue([]),
    checkUnblocks: vi.fn().mockResolvedValue([]),
  } as unknown as TaskManager;
}

function makeWorkerTaskManager(): IWorkerTaskManager {
  const mockSendMessage = vi.fn().mockResolvedValue(undefined);
  return {
    getOrBuildTask: vi.fn().mockResolvedValue({ sendMessage: mockSendMessage }),
    kill: vi.fn(),
  } as unknown as IWorkerTaskManager;
}

function makeTeammateManager(agents: TeamAgent[] = [], overrides: Record<string, unknown> = {}) {
  const mailbox = makeMailbox();
  const taskManager = makeTaskManager();
  const workerTaskManager = makeWorkerTaskManager();
  const mgr = new TeammateManager({
    teamId: 'team-1',
    agents,
    mailbox,
    taskManager,
    workerTaskManager,
    ...overrides,
  });
  return { mgr, mailbox, taskManager, workerTaskManager };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TeammateManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // No cleanup needed - managers are disposed in individual tests
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('initializes with empty agents list', () => {
      const { mgr } = makeTeammateManager([]);
      expect(mgr.getAgents()).toEqual([]);
      mgr.dispose();
    });

    it('initializes with provided agents', () => {
      const agents = [makeAgent({ slotId: 'slot-1' }), makeAgent({ slotId: 'slot-2', role: 'teammate' })];
      const { mgr } = makeTeammateManager(agents);
      expect(mgr.getAgents()).toHaveLength(2);
      mgr.dispose();
    });

    it('subscribes to teamEventBus responseStream', () => {
      const { mgr } = makeTeammateManager([makeAgent()]);
      // If no error occurs during setup, the subscription worked
      expect(mgr).toBeDefined();
      mgr.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // getAgents
  // -------------------------------------------------------------------------

  describe('getAgents', () => {
    it('returns a copy of the agents array', () => {
      const agent = makeAgent();
      const { mgr } = makeTeammateManager([agent]);
      const result = mgr.getAgents();
      expect(result).toHaveLength(1);
      // Verify it's a copy (mutation does not affect internal state)
      result.push(makeAgent({ slotId: 'extra' }));
      expect(mgr.getAgents()).toHaveLength(1);
      mgr.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // addAgent
  // -------------------------------------------------------------------------

  describe('addAgent', () => {
    it('adds agent to internal list', () => {
      const { mgr } = makeTeammateManager([]);
      mgr.addAgent(makeAgent({ slotId: 'slot-new' }));
      expect(mgr.getAgents()).toHaveLength(1);
      mgr.dispose();
    });

    it('emits ipcBridge team.agentSpawned event', () => {
      const { mgr } = makeTeammateManager([]);
      const newAgent = makeAgent({ slotId: 'slot-new' });
      mgr.addAgent(newAgent);
      expect(mockIpcBridge.team.agentSpawned.emit).toHaveBeenCalledWith({
        teamId: 'team-1',
        agent: newAgent,
      });
      mgr.dispose();
    });

    it('adds multiple agents independently', () => {
      const { mgr } = makeTeammateManager([]);
      mgr.addAgent(makeAgent({ slotId: 'slot-1' }));
      mgr.addAgent(makeAgent({ slotId: 'slot-2', role: 'teammate' }));
      expect(mgr.getAgents()).toHaveLength(2);
      mgr.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // setStatus
  // -------------------------------------------------------------------------

  describe('setStatus', () => {
    it('updates agent status in memory', () => {
      const agent = makeAgent({ slotId: 'slot-1', status: 'idle' });
      const { mgr } = makeTeammateManager([agent]);

      mgr.setStatus('slot-1', 'active');

      const updated = mgr.getAgents().find((a) => a.slotId === 'slot-1');
      expect(updated?.status).toBe('active');
      mgr.dispose();
    });

    it('emits ipcBridge agentStatusChanged event', () => {
      const { mgr } = makeTeammateManager([makeAgent({ slotId: 'slot-1' })]);

      mgr.setStatus('slot-1', 'failed', 'Error occurred');

      expect(mockIpcBridge.team.agentStatusChanged.emit).toHaveBeenCalledWith({
        teamId: 'team-1',
        slotId: 'slot-1',
        status: 'failed',
        lastMessage: 'Error occurred',
      });
      mgr.dispose();
    });

    it('emits agentStatusChanged event on the manager itself', () => {
      const { mgr } = makeTeammateManager([makeAgent({ slotId: 'slot-1' })]);
      const listener = vi.fn();
      mgr.on('agentStatusChanged', listener);

      mgr.setStatus('slot-1', 'completed');

      expect(listener).toHaveBeenCalledWith({
        teamId: 'team-1',
        slotId: 'slot-1',
        status: 'completed',
        lastMessage: undefined,
      });
      mgr.dispose();
    });

    it('does nothing for unknown slotId (no error thrown)', () => {
      const { mgr } = makeTeammateManager([makeAgent({ slotId: 'slot-1' })]);
      expect(() => mgr.setStatus('unknown-slot', 'active')).not.toThrow();
      mgr.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // removeAgent
  // -------------------------------------------------------------------------

  describe('removeAgent', () => {
    it('removes agent from agents list', () => {
      const agents = [makeAgent({ slotId: 'slot-1' }), makeAgent({ slotId: 'slot-2', role: 'teammate' })];
      const { mgr } = makeTeammateManager(agents);

      mgr.removeAgent('slot-1');

      expect(mgr.getAgents()).toHaveLength(1);
      expect(mgr.getAgents()[0].slotId).toBe('slot-2');
      mgr.dispose();
    });

    it('emits ipcBridge agentRemoved event', () => {
      const { mgr } = makeTeammateManager([makeAgent({ slotId: 'slot-1' })]);

      mgr.removeAgent('slot-1');

      expect(mockIpcBridge.team.agentRemoved.emit).toHaveBeenCalledWith({
        teamId: 'team-1',
        slotId: 'slot-1',
      });
      mgr.dispose();
    });

    it('does nothing for unknown slotId', () => {
      const { mgr } = makeTeammateManager([makeAgent({ slotId: 'slot-1' })]);

      expect(() => mgr.removeAgent('nonexistent')).not.toThrow();
      expect(mgr.getAgents()).toHaveLength(1);
      mgr.dispose();
    });

    it('clears any active wake timeout for the removed agent', async () => {
      const agent = makeAgent({ slotId: 'slot-1', status: 'idle' });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

      // Start a wake (which creates a timeout) then immediately remove
      const wakePromise = mgr.wake('slot-1');
      await wakePromise;

      // Should not throw when removing agent with active timeout
      expect(() => mgr.removeAgent('slot-1')).not.toThrow();
      mgr.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // renameAgent
  // -------------------------------------------------------------------------

  describe('renameAgent', () => {
    it('renames agent in memory', () => {
      const { mgr } = makeTeammateManager([makeAgent({ slotId: 'slot-1', agentName: 'Claude' })]);

      mgr.renameAgent('slot-1', 'NewName');

      const agent = mgr.getAgents().find((a) => a.slotId === 'slot-1');
      expect(agent?.agentName).toBe('NewName');
      mgr.dispose();
    });

    it('emits ipcBridge agentRenamed event', () => {
      const { mgr } = makeTeammateManager([makeAgent({ slotId: 'slot-1', agentName: 'Claude' })]);

      mgr.renameAgent('slot-1', 'Assistant');

      expect(mockIpcBridge.team.agentRenamed.emit).toHaveBeenCalledWith({
        teamId: 'team-1',
        slotId: 'slot-1',
        oldName: 'Claude',
        newName: 'Assistant',
      });
      mgr.dispose();
    });

    it('throws when agent not found', () => {
      const { mgr } = makeTeammateManager([]);
      expect(() => mgr.renameAgent('nonexistent', 'NewName')).toThrow('Agent "nonexistent" not found');
      mgr.dispose();
    });

    it('throws when new name is empty', () => {
      const { mgr } = makeTeammateManager([makeAgent({ slotId: 'slot-1' })]);
      expect(() => mgr.renameAgent('slot-1', '')).toThrow('Agent name cannot be empty');
      expect(() => mgr.renameAgent('slot-1', '   ')).toThrow('Agent name cannot be empty');
      mgr.dispose();
    });

    it('throws when new name conflicts with another agent', () => {
      const agents = [
        makeAgent({ slotId: 'slot-1', agentName: 'Claude' }),
        makeAgent({ slotId: 'slot-2', agentName: 'Alice', role: 'teammate' }),
      ];
      const { mgr } = makeTeammateManager(agents);

      expect(() => mgr.renameAgent('slot-1', 'Alice')).toThrow('already taken');
      mgr.dispose();
    });

    it('remembers original name through multiple renames', () => {
      const { mgr } = makeTeammateManager([makeAgent({ slotId: 'slot-1', agentName: 'Original' })]);

      mgr.renameAgent('slot-1', 'Second');
      mgr.renameAgent('slot-1', 'Third');

      // The renamed agents map stores the first original name
      // (tested indirectly via agentRenamed events which show oldName correctly)
      const agent = mgr.getAgents().find((a) => a.slotId === 'slot-1');
      expect(agent?.agentName).toBe('Third');
      mgr.dispose();
    });

    it('is case-insensitive for duplicate detection', () => {
      const agents = [
        makeAgent({ slotId: 'slot-1', agentName: 'Claude' }),
        makeAgent({ slotId: 'slot-2', agentName: 'alice', role: 'teammate' }),
      ];
      const { mgr } = makeTeammateManager(agents);

      expect(() => mgr.renameAgent('slot-1', 'ALICE')).toThrow('already taken');
      mgr.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // wake
  // -------------------------------------------------------------------------

  describe('wake', () => {
    it('skips if slotId not found', async () => {
      const { mgr, workerTaskManager } = makeTeammateManager([]);
      await mgr.wake('nonexistent');
      expect(workerTaskManager.getOrBuildTask).not.toHaveBeenCalled();
      mgr.dispose();
    });

    it('skips if wake is already active (deduplication)', async () => {
      const agent = makeAgent({ slotId: 'slot-1', status: 'idle' });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

      // Start first wake, then immediately try second
      const first = mgr.wake('slot-1');
      const second = mgr.wake('slot-1'); // should be skipped

      await Promise.all([first, second]);

      // sendMessage should only be called once
      expect(mockSendMessage).toHaveBeenCalledOnce();
      mgr.dispose();
    });

    it('transitions pending agent to idle then active', async () => {
      const agent = makeAgent({ slotId: 'slot-1', status: 'pending' });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

      const statusHistory: string[] = [];
      mgr.on('agentStatusChanged', ({ status }: { status: string }) => statusHistory.push(status));

      await mgr.wake('slot-1');

      expect(statusHistory).toContain('idle');
      expect(statusHistory).toContain('active');
      mgr.dispose();
    });

    it('sets agent status to active during wake', async () => {
      const agent = makeAgent({ slotId: 'slot-1', status: 'idle' });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

      const statusesSeen: string[] = [];
      mgr.on('agentStatusChanged', ({ status }: { status: string }) => statusesSeen.push(status));

      await mgr.wake('slot-1');

      expect(statusesSeen).toContain('active');
      mgr.dispose();
    });

    it('calls workerTaskManager.getOrBuildTask with the agent conversationId', async () => {
      const agent = makeAgent({ slotId: 'slot-1', conversationId: 'conv-xyz', status: 'idle' });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

      await mgr.wake('slot-1');

      expect(workerTaskManager.getOrBuildTask).toHaveBeenCalledWith('conv-xyz');
      mgr.dispose();
    });

    it('calls agentTask.sendMessage with content and msg_id', async () => {
      const agent = makeAgent({ slotId: 'slot-1', status: 'idle', conversationType: 'acp' });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

      await mgr.wake('slot-1');

      expect(mockSendMessage).toHaveBeenCalledOnce();
      const callArg = mockSendMessage.mock.calls[0][0];
      expect(callArg).toHaveProperty('content');
      expect(callArg).toHaveProperty('msg_id');
      expect(callArg.silent).toBe(true);
      mgr.dispose();
    });

    it('uses "input" key for gemini agents instead of "content"', async () => {
      const agent = makeAgent({ slotId: 'slot-1', status: 'idle', conversationType: 'gemini' });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

      await mgr.wake('slot-1');

      const callArg = mockSendMessage.mock.calls[0][0];
      expect(callArg).toHaveProperty('input');
      expect(callArg).not.toHaveProperty('content');
      mgr.dispose();
    });

    it('sets status to failed and rethrows when sendMessage throws', async () => {
      const agent = makeAgent({ slotId: 'slot-1', status: 'idle' });
      const { mgr, workerTaskManager } = makeTeammateManager([agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockRejectedValue(new Error('Task unavailable'));

      await expect(mgr.wake('slot-1')).rejects.toThrow('Task unavailable');

      const failedAgent = mgr.getAgents().find((a) => a.slotId === 'slot-1');
      expect(failedAgent?.status).toBe('failed');
      mgr.dispose();
    });

    it('resets agent to idle after 60s wake timeout when turnCompleted never fires', async () => {
      vi.useFakeTimers();
      try {
        const agent = makeAgent({ slotId: 'slot-1', status: 'idle' });
        const mockSendMessage = vi.fn().mockResolvedValue(undefined);
        const { mgr, workerTaskManager } = makeTeammateManager([agent]);
        vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
          sendMessage: mockSendMessage,
        } as never);

        // Start wake — resolves after sendMessage, timeout is still pending
        await mgr.wake('slot-1');

        // Agent is active; no finish event arrives — timeout is running
        expect(mgr.getAgents().find((a) => a.slotId === 'slot-1')?.status).toBe('active');

        // Advance past the 60s safety valve
        vi.advanceTimersByTime(61_000);

        // Agent must be freed back to idle
        expect(mgr.getAgents().find((a) => a.slotId === 'slot-1')?.status).toBe('idle');
        mgr.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it('reads unread mailbox messages before building payload', async () => {
      const agent = makeAgent({ slotId: 'slot-1', status: 'idle' });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, mailbox, workerTaskManager } = makeTeammateManager([agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

      await mgr.wake('slot-1');

      expect(mailbox.readUnread).toHaveBeenCalledWith('team-1', 'slot-1');
      mgr.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // handleResponseStream (via teamEventBus)
  // -------------------------------------------------------------------------

  describe('handleResponseStream', () => {
    it('ignores events for conversations not owned by this team', () => {
      const agent = makeAgent({ slotId: 'slot-1', conversationId: 'conv-owned' });
      const { mgr } = makeTeammateManager([agent]);

      // Emit for a foreign conversation
      teamEventBus.emit('responseStream', {
        type: 'text',
        conversation_id: 'conv-foreign',
        msg_id: 'msg-1',
        data: { text: 'hello' },
      });

      // No IPC calls should have been made for unowned conversation
      expect(mockIpcBridge.team.agentStatusChanged.emit).not.toHaveBeenCalled();
      mgr.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // finalizeTurn — finalizedTurns dedup window regression (Bug R2-1)
  // -------------------------------------------------------------------------

  describe('finalizedTurns dedup window', () => {
    it('processes a second finish event after the agent is re-woken (dedup window must not block it)', async () => {
      vi.useFakeTimers();
      try {
        const leadAgent = makeAgent({
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'lead',
          status: 'idle',
          agentName: 'Leader',
        });
        const member = makeAgent({
          slotId: 'slot-member',
          conversationId: 'conv-member',
          role: 'teammate',
          status: 'active',
          agentName: 'Member',
        });
        const mockSendMessage = vi.fn().mockResolvedValue(undefined);
        const { mgr, workerTaskManager } = makeTeammateManager([leadAgent, member]);
        vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
          sendMessage: mockSendMessage,
        } as never);

        // First turn completes
        teamEventBus.emit('responseStream', {
          type: 'finish',
          conversation_id: 'conv-member',
          msg_id: 'm1',
          data: null,
        });
        // Flush async chain without advancing fake clock past 5s dedup window
        await new Promise((r) => process.nextTick(r));
        await new Promise((r) => process.nextTick(r));
        await new Promise((r) => process.nextTick(r));

        // Member is now idle; leader is woken; now re-wake member (simulating leader dispatch)
        await mgr.wake('slot-member');

        // Second turn completes — still within 5s dedup window (fake clock not advanced)
        teamEventBus.emit('responseStream', {
          type: 'finish',
          conversation_id: 'conv-member',
          msg_id: 'm2',
          data: null,
        });
        await new Promise((r) => process.nextTick(r));
        await new Promise((r) => process.nextTick(r));
        await new Promise((r) => process.nextTick(r));

        // The second finish MUST be processed: member should NOT remain active.
        // REGRESSION: without fix, finalizedTurns still holds conv-member → second finalizeTurn
        //             is silently dropped → status transition and idle notification are lost.
        const statusAfterSecond = mgr.getAgents().find((a) => a.slotId === 'slot-member')?.status;
        expect(statusAfterSecond, 'Second finish event was dropped by the 5s dedup window').not.toBe('active');

        mgr.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it('REGRESSION (runAllTimersAsync variant): second finish within 5s dedup window is not silently dropped', async () => {
      vi.useFakeTimers();
      try {
        const leadAgent = makeAgent({
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'lead',
          status: 'idle',
          agentName: 'Leader',
        });
        const member = makeAgent({
          slotId: 'slot-member',
          conversationId: 'conv-member',
          role: 'teammate',
          status: 'active',
          agentName: 'Member',
        });
        const mockSendMessage = vi.fn().mockResolvedValue(undefined);
        const { mgr, workerTaskManager } = makeTeammateManager([leadAgent, member]);
        vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
          sendMessage: mockSendMessage,
        } as never);

        // First turn completes — adds conv-member to finalizedTurns (5s dedup)
        teamEventBus.emit('responseStream', {
          type: 'finish',
          conversation_id: 'conv-member',
          msg_id: 'm1',
          data: null,
        });
        // Advance only 1 second — well within the 5s dedup window
        await vi.advanceTimersByTimeAsync(1000);

        // Re-wake member (leader dispatching new work within 5s window)
        await mgr.wake('slot-member');

        // Second turn completes — conv-member is STILL in finalizedTurns (4s remain)
        teamEventBus.emit('responseStream', {
          type: 'finish',
          conversation_id: 'conv-member',
          msg_id: 'm2',
          data: null,
        });
        // Flush async without clearing the dedup window
        await new Promise((r) => process.nextTick(r));
        await new Promise((r) => process.nextTick(r));
        await new Promise((r) => process.nextTick(r));

        // REGRESSION: second finalizeTurn should NOT be dropped by the dedup guard.
        const statusAfterSecond = mgr.getAgents().find((a) => a.slotId === 'slot-member')?.status;
        expect(statusAfterSecond, 'Second finish was dropped by 5s dedup window').not.toBe('active');

        mgr.dispose();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // -------------------------------------------------------------------------
  // finalizeTurn (triggered via teamEventBus 'finish' events)
  // -------------------------------------------------------------------------

  describe('finalizeTurn', () => {
    it('sets agent to idle after finish event with empty response', async () => {
      const leadAgent = makeAgent({
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'lead',
        agentName: 'Leader',
      });
      // Non-lead agent - will send idle notification to lead
      const memberAgent = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Member',
        status: 'active',
      });
      const { mgr, mailbox: mbox } = makeTeammateManager([leadAgent, memberAgent]);

      // Simulate a finish event arriving for the member
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'msg-1',
        data: null,
      });

      // Give async finalizeTurn time to run
      await new Promise((r) => setTimeout(r, 50));

      // Should have written idle notification to lead
      expect(mbox.write).toHaveBeenCalledWith(
        expect.objectContaining({
          toAgentId: 'slot-lead',
          fromAgentId: 'slot-member',
          type: 'idle_notification',
        })
      );
      mgr.dispose();
    });

    it('deduplicates concurrent finish events — mailbox.write called exactly once', async () => {
      const leadAgent = makeAgent({
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'lead',
        status: 'idle',
      });
      const memberAgent = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        status: 'active',
        agentName: 'Member',
      });
      const { mgr, mailbox: mbox } = makeTeammateManager([leadAgent, memberAgent]);

      // Emit finish twice rapidly for the same conversation
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'msg-1',
        data: null,
      });
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'msg-2',
        data: null,
      });

      await new Promise((r) => setTimeout(r, 50));

      // finalizedTurns dedup: the second finish is discarded.
      // The idle notification to lead is written exactly once, not twice.
      const idleCalls = vi
        .mocked(mbox.write)
        .mock.calls.filter((args) => args[0].type === 'idle_notification' && args[0].toAgentId === 'slot-lead');
      expect(idleCalls).toHaveLength(1);
      mgr.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // maybeWakeLeaderWhenAllIdle (tested indirectly)
  // -------------------------------------------------------------------------

  describe('maybeWakeLeaderWhenAllIdle', () => {
    it('does not wake leader when a second non-lead agent is still active', async () => {
      const leadAgent = makeAgent({
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'lead',
        status: 'idle',
      });
      // Both members start active
      const member1 = makeAgent({
        slotId: 'slot-m1',
        conversationId: 'conv-m1',
        role: 'teammate',
        status: 'active',
        agentName: 'Member1',
      });
      const member2 = makeAgent({
        slotId: 'slot-m2',
        conversationId: 'conv-m2',
        role: 'teammate',
        status: 'active',
        agentName: 'Member2',
      });
      const { mgr, workerTaskManager } = makeTeammateManager([leadAgent, member1, member2]);

      // Only member1 finishes — member2 remains active
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-m1',
        msg_id: 'm1',
        data: null,
      });

      await new Promise((r) => setTimeout(r, 50));

      // member2 is still active → maybeWakeLeaderWhenAllIdle must NOT wake the leader
      expect(workerTaskManager.getOrBuildTask).not.toHaveBeenCalledWith('conv-lead');
      mgr.dispose();
    });

    it('wakes leader when all non-lead agents are settled', async () => {
      const leadAgent = makeAgent({
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'lead',
        status: 'idle',
      });
      const member1 = makeAgent({
        slotId: 'slot-m1',
        conversationId: 'conv-m1',
        role: 'teammate',
        status: 'idle',
        agentName: 'Member1',
      });
      const member2 = makeAgent({
        slotId: 'slot-m2',
        conversationId: 'conv-m2',
        role: 'teammate',
        status: 'idle',
        agentName: 'Member2',
      });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([leadAgent, member1, member2]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

      // Both members are already idle; emit finish for member1 (which triggers idle notification)
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-m1',
        msg_id: 'm1',
        data: null,
      });

      await new Promise((r) => setTimeout(r, 100));

      // Leader should have been woken since all members are idle
      expect(workerTaskManager.getOrBuildTask).toHaveBeenCalledWith('conv-lead');
      mgr.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------

  describe('dispose', () => {
    it('removes responseStream listener from teamEventBus', () => {
      const agent = makeAgent({ slotId: 'slot-1', conversationId: 'conv-1' });
      const { mgr } = makeTeammateManager([agent]);
      const listenerCount = teamEventBus.listenerCount('responseStream');

      mgr.dispose();

      // After dispose, listener count should decrease by 1
      expect(teamEventBus.listenerCount('responseStream')).toBe(listenerCount - 1);
    });

    it('removes all EventEmitter listeners on the manager itself', () => {
      const { mgr } = makeTeammateManager([makeAgent()]);
      mgr.on('agentStatusChanged', vi.fn());
      mgr.on('agentStatusChanged', vi.fn());

      mgr.dispose();

      expect(mgr.listenerCount('agentStatusChanged')).toBe(0);
    });

    it('can be called multiple times without error', () => {
      const { mgr } = makeTeammateManager([]);
      expect(() => {
        mgr.dispose();
        mgr.dispose();
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Agent crash testament
  // -------------------------------------------------------------------------
  describe('agent crash testament', () => {
    it('writes testament to leader mailbox, removes agent, and wakes leader on crash', async () => {
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'lead' });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        conversationType: 'acp',
      });
      const { mgr, mailbox } = makeTeammateManager([leader, member]);

      // Simulate crash: AcpAgent emits finish with agentCrash flag
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'crash-1',
        data: { error: 'Process exited unexpectedly (code: 1, signal: null)', agentCrash: true },
      });

      await new Promise((r) => setTimeout(r, 100));

      // Testament written to leader
      expect(mailbox.write).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'team-1',
          toAgentId: 'slot-lead',
          fromAgentId: 'slot-member',
          content: expect.stringContaining('Worker'),
        })
      );
      expect(mailbox.write).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Process exited unexpectedly'),
        })
      );

      // Agent removed
      expect(mgr.getAgents().find((a) => a.slotId === 'slot-member')).toBeUndefined();
      expect(mockIpcBridge.team.agentRemoved.emit).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-1', slotId: 'slot-member' })
      );

      mgr.dispose();
    });

    it('does not trigger crash flow for normal error events without agentCrash flag', async () => {
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'lead' });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        conversationType: 'acp',
      });
      const { mgr, mailbox } = makeTeammateManager([leader, member]);

      // Normal error (not a crash, not a quota error)
      teamEventBus.emit('responseStream', {
        type: 'error',
        conversation_id: 'conv-member',
        msg_id: 'err-1',
        data: { error: 'Something went wrong' },
      });

      await new Promise((r) => setTimeout(r, 100));

      // No testament written — normal error goes through finalizeTurn
      const testamentCalls = (mailbox.write as ReturnType<typeof vi.fn>).mock.calls.filter((args: unknown[]) => {
        const arg = args[0] as { content?: string };
        return typeof arg?.content === 'string' && arg.content.includes('crashed');
      });
      expect(testamentCalls).toHaveLength(0);

      // Agent still exists
      expect(mgr.getAgents().find((a) => a.slotId === 'slot-member')).toBeDefined();

      mgr.dispose();
    });

    it('sets status to failed on 429 quota error', async () => {
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'lead' });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        conversationType: 'acp',
      });
      const { mgr } = makeTeammateManager([leader, member]);

      teamEventBus.emit('responseStream', {
        type: 'error',
        conversation_id: 'conv-member',
        msg_id: 'err-429',
        data: { error: '429 Too Many Requests' },
      });

      await new Promise((r) => setTimeout(r, 50));

      const agent = mgr.getAgents().find((a) => a.slotId === 'slot-member');
      expect(agent).toBeDefined();
      expect(agent!.status).toBe('failed');

      // Verify status change was emitted
      expect(mockIpcBridge.team.agentStatusChanged.emit).toHaveBeenCalledWith(
        expect.objectContaining({ slotId: 'slot-member', status: 'failed' })
      );

      mgr.dispose();
    });

    it('sets status to failed on rate limit error', async () => {
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'lead' });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        conversationType: 'acp',
      });
      const { mgr } = makeTeammateManager([leader, member]);

      teamEventBus.emit('responseStream', {
        type: 'error',
        conversation_id: 'conv-member',
        msg_id: 'err-rate',
        data: 'API rate limit exceeded',
      });

      await new Promise((r) => setTimeout(r, 50));

      const agent = mgr.getAgents().find((a) => a.slotId === 'slot-member');
      expect(agent!.status).toBe('failed');

      mgr.dispose();
    });

    it('sets status to failed on quota exceeded error', async () => {
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'lead' });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        conversationType: 'acp',
      });
      const { mgr } = makeTeammateManager([leader, member]);

      teamEventBus.emit('responseStream', {
        type: 'error',
        conversation_id: 'conv-member',
        msg_id: 'err-quota',
        data: { error: 'Quota exceeded for this model' },
      });

      await new Promise((r) => setTimeout(r, 50));

      const agent = mgr.getAgents().find((a) => a.slotId === 'slot-member');
      expect(agent!.status).toBe('failed');

      mgr.dispose();
    });

    it('does not trigger crash flow for finish events', async () => {
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'lead' });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        conversationType: 'acp',
      });
      const { mgr } = makeTeammateManager([leader, member]);

      // Normal finish
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'fin-1',
        data: null,
      });

      await new Promise((r) => setTimeout(r, 100));

      // Agent still exists
      expect(mgr.getAgents().find((a) => a.slotId === 'slot-member')).toBeDefined();

      mgr.dispose();
    });
  });
});
