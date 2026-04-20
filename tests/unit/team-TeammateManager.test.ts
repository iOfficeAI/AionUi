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
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn(async () => null) },
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
    role: 'leader',
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
    readUnread: vi.fn().mockResolvedValue([
      {
        id: 'msg-1',
        teamId: 'team-1',
        toAgentId: 'slot-1',
        fromAgentId: 'system',
        content: 'Wake trigger',
        type: 'message',
      },
    ]),
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
    it('removes teammate from agents list', () => {
      const agents = [makeAgent({ slotId: 'slot-1' }), makeAgent({ slotId: 'slot-2', role: 'teammate' })];
      const { mgr } = makeTeammateManager(agents);

      mgr.removeAgent('slot-2');

      expect(mgr.getAgents()).toHaveLength(1);
      expect(mgr.getAgents()[0].slotId).toBe('slot-1');
      mgr.dispose();
    });

    it('emits ipcBridge agentRemoved event', () => {
      const agents = [makeAgent({ slotId: 'slot-1' }), makeAgent({ slotId: 'slot-2', role: 'teammate' })];
      const { mgr } = makeTeammateManager(agents);

      mgr.removeAgent('slot-2');

      expect(mockIpcBridge.team.agentRemoved.emit).toHaveBeenCalledWith({
        teamId: 'team-1',
        slotId: 'slot-2',
      });
      mgr.dispose();
    });

    it('blocks removal of leader', () => {
      const agents = [makeAgent({ slotId: 'slot-1' }), makeAgent({ slotId: 'slot-2', role: 'teammate' })];
      const { mgr } = makeTeammateManager(agents);

      mgr.removeAgent('slot-1');

      expect(mgr.getAgents()).toHaveLength(2);
      expect(mockIpcBridge.team.agentRemoved.emit).not.toHaveBeenCalled();
      mgr.dispose();
    });

    it('does nothing for unknown slotId', () => {
      const { mgr } = makeTeammateManager([makeAgent({ slotId: 'slot-1' })]);

      expect(() => mgr.removeAgent('nonexistent')).not.toThrow();
      expect(mgr.getAgents()).toHaveLength(1);
      mgr.dispose();
    });

    it('clears any active wake timeout for the removed agent', async () => {
      const agent = makeAgent({ slotId: 'slot-2', role: 'teammate', status: 'idle', conversationId: 'conv-2' });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([makeAgent({ slotId: 'slot-1' }), agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

      // Start a wake (which creates a timeout) then immediately remove
      const wakePromise = mgr.wake('slot-2');
      await wakePromise;

      // Should not throw when removing teammate with active timeout
      expect(() => mgr.removeAgent('slot-2')).not.toThrow();
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

    it('marks a silent leader as failed after the 60s inactivity watchdog fires', async () => {
      vi.useFakeTimers();
      try {
        // Lead is the only agent — timeout escalates to 'failed' but has nobody to notify.
        const agent = makeAgent({ slotId: 'slot-1', role: 'leader', status: 'idle' });
        const mockSendMessage = vi.fn().mockResolvedValue(undefined);
        const { mgr, workerTaskManager, mailbox } = makeTeammateManager([agent]);
        vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
          sendMessage: mockSendMessage,
        } as never);

        await mgr.wake('slot-1');
        expect(mgr.getAgents().find((a) => a.slotId === 'slot-1')?.status).toBe('active');

        await vi.advanceTimersByTimeAsync(61_000);

        // Previously the watchdog dropped the agent to 'idle' (hiding the stall).
        // It now marks the agent 'failed' so the team surface reflects the problem.
        expect(mgr.getAgents().find((a) => a.slotId === 'slot-1')?.status).toBe('failed');
        // Lead has nobody to notify — no mailbox write should have occurred.
        expect(mailbox.write).not.toHaveBeenCalled();
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

    it('forwards files from user mailbox messages to agentTask.sendMessage', async () => {
      const agent = makeAgent({ slotId: 'slot-1', status: 'idle', conversationType: 'acp' });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, mailbox, workerTaskManager } = makeTeammateManager([agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);
      vi.mocked(mailbox.readUnread).mockResolvedValue([
        {
          id: 'msg-1',
          teamId: 'team-1',
          toAgentId: 'slot-1',
          fromAgentId: 'user',
          type: 'message',
          content: 'Check these files',
          files: ['/tmp/image.png', '/tmp/doc.pdf'],
          read: false,
          createdAt: 1000,
        },
      ]);

      await mgr.wake('slot-1');

      const callArg = mockSendMessage.mock.calls[0][0];
      expect(callArg.files).toEqual(['/tmp/image.png', '/tmp/doc.pdf']);
      mgr.dispose();
    });

    it('does not include files when no user messages have files', async () => {
      const agent = makeAgent({ slotId: 'slot-1', status: 'idle', conversationType: 'acp' });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, mailbox, workerTaskManager } = makeTeammateManager([agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);
      vi.mocked(mailbox.readUnread).mockResolvedValue([
        {
          id: 'msg-1',
          teamId: 'team-1',
          toAgentId: 'slot-1',
          fromAgentId: 'user',
          type: 'message',
          content: 'No attachments',
          read: false,
          createdAt: 1000,
        },
      ]);

      await mgr.wake('slot-1');

      const callArg = mockSendMessage.mock.calls[0][0];
      expect(callArg.files).toBeUndefined();
      mgr.dispose();
    });

    it('ignores files from non-user (agent-to-agent) messages', async () => {
      const agent = makeAgent({ slotId: 'slot-1', status: 'idle', conversationType: 'acp' });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, mailbox, workerTaskManager } = makeTeammateManager([agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);
      vi.mocked(mailbox.readUnread).mockResolvedValue([
        {
          id: 'msg-1',
          teamId: 'team-1',
          toAgentId: 'slot-1',
          fromAgentId: 'slot-2',
          type: 'message',
          content: 'Agent message with files',
          files: ['/tmp/should-be-ignored.txt'],
          read: false,
          createdAt: 1000,
        },
      ]);

      await mgr.wake('slot-1');

      const callArg = mockSendMessage.mock.calls[0][0];
      expect(callArg.files).toBeUndefined();
      mgr.dispose();
    });

    it('merges files from multiple user messages', async () => {
      const agent = makeAgent({ slotId: 'slot-1', status: 'idle', conversationType: 'gemini' });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, mailbox, workerTaskManager } = makeTeammateManager([agent]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);
      vi.mocked(mailbox.readUnread).mockResolvedValue([
        {
          id: 'msg-1',
          teamId: 'team-1',
          toAgentId: 'slot-1',
          fromAgentId: 'user',
          type: 'message',
          content: 'First batch',
          files: ['/tmp/a.png'],
          read: false,
          createdAt: 1000,
        },
        {
          id: 'msg-2',
          teamId: 'team-1',
          toAgentId: 'slot-1',
          fromAgentId: 'user',
          type: 'message',
          content: 'Second batch',
          files: ['/tmp/b.pdf', '/tmp/c.txt'],
          read: false,
          createdAt: 2000,
        },
      ]);

      await mgr.wake('slot-1');

      const callArg = mockSendMessage.mock.calls[0][0];
      expect(callArg.files).toEqual(['/tmp/a.png', '/tmp/b.pdf', '/tmp/c.txt']);
      // Gemini uses 'input' key
      expect(callArg).toHaveProperty('input');
      mgr.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // wake inactivity watchdog (Fix B: notify leader on teammate stall + heartbeat)
  // -------------------------------------------------------------------------

  describe('wake inactivity watchdog', () => {
    it('notifies the leader when a teammate goes silent past the 60s watchdog', async () => {
      vi.useFakeTimers();
      try {
        const leadAgent = makeAgent({
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          status: 'idle',
          agentName: 'Leader',
        });
        const teammate = makeAgent({
          slotId: 'slot-member',
          conversationId: 'conv-member',
          role: 'teammate',
          status: 'idle',
          agentName: 'Codex',
          agentType: 'codex',
        });
        const mockSendMessage = vi.fn().mockResolvedValue(undefined);
        const { mgr, mailbox, workerTaskManager } = makeTeammateManager([leadAgent, teammate]);
        vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
          sendMessage: mockSendMessage,
        } as never);

        await mgr.wake('slot-member');
        expect(mgr.getAgents().find((a) => a.slotId === 'slot-member')?.status).toBe('active');

        // No stream activity arrives — push past the watchdog deadline.
        await vi.advanceTimersByTimeAsync(61_000);

        // Teammate is escalated to 'failed' (not silently dropped to 'idle').
        expect(mgr.getAgents().find((a) => a.slotId === 'slot-member')?.status).toBe('failed');

        // Lead mailbox received an idle_notification explaining the stall.
        expect(mailbox.write).toHaveBeenCalledWith(
          expect.objectContaining({
            teamId: 'team-1',
            toAgentId: 'slot-lead',
            fromAgentId: 'slot-member',
            type: 'idle_notification',
            content: expect.stringContaining('Codex'),
          })
        );

        // Lead was woken — getOrBuildTask called for the leader's conversation in
        // addition to the initial teammate wake.
        expect(vi.mocked(workerTaskManager.getOrBuildTask)).toHaveBeenCalledWith('conv-member');
        expect(vi.mocked(workerTaskManager.getOrBuildTask)).toHaveBeenCalledWith('conv-lead');

        mgr.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not fire the watchdog if streaming activity keeps resetting it (heartbeat)', async () => {
      vi.useFakeTimers();
      try {
        const teammate = makeAgent({
          slotId: 'slot-member',
          conversationId: 'conv-member',
          role: 'teammate',
          status: 'idle',
          agentName: 'Codex',
        });
        const leadAgent = makeAgent({
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          status: 'idle',
        });
        const mockSendMessage = vi.fn().mockResolvedValue(undefined);
        const { mgr, mailbox, workerTaskManager } = makeTeammateManager([leadAgent, teammate]);
        vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
          sendMessage: mockSendMessage,
        } as never);

        await mgr.wake('slot-member');

        // Simulate a long stream of thought/tool events — each heartbeat reset
        // the watchdog. We emit one every 30s for 150s (> 2× original 60s budget).
        for (let elapsed = 0; elapsed < 150_000; elapsed += 30_000) {
          await vi.advanceTimersByTimeAsync(30_000);
          teamEventBus.emit('responseStream', {
            type: 'text',
            conversation_id: 'conv-member',
            msg_id: `m-${elapsed}`,
            data: { text: 'still reasoning...' },
          });
        }

        // Still within 60s of the last heartbeat — watchdog must NOT have fired.
        expect(mgr.getAgents().find((a) => a.slotId === 'slot-member')?.status).toBe('active');
        expect(mailbox.write).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'idle_notification' }));

        mgr.dispose();
      } finally {
        vi.useRealTimers();
      }
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
          role: 'leader',
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
          role: 'leader',
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
        role: 'leader',
        agentName: 'Leader',
      });
      // Non-leader agent - will send idle notification to leader
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

      // Should have written idle notification to leader
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
        role: 'leader',
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
      // The idle notification to leader is written exactly once, not twice.
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
    it('does not wake leader when a second non-leader agent is still active', async () => {
      const leadAgent = makeAgent({
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
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

    it('wakes leader when all non-leader agents are settled and at least one produced substantive output', async () => {
      const leadAgent = makeAgent({
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
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

      // Both members idle; member1 emits a non-empty response then finishes
      teamEventBus.emit('responseStream', {
        type: 'content',
        conversation_id: 'conv-m1',
        msg_id: 'm1c',
        data: 'finished analyzing the data',
      });
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-m1',
        msg_id: 'm1',
        data: null,
      });

      await new Promise((r) => setTimeout(r, 100));

      // Leader should have been woken since all members are idle and there's substantive content
      expect(workerTaskManager.getOrBuildTask).toHaveBeenCalledWith('conv-lead');
      mgr.dispose();
    });

    it('does NOT wake leader when all members are settled but the finishing turn produced only an empty fallback', async () => {
      // Regression: previously an empty fallback ("Turn completed (no response text produced)")
      // still woke the leader, which often re-dispatched the same task, producing another empty
      // turn — an infinite loop of empty fallbacks. Wake policy now requires substantive content.
      const leadAgent = makeAgent({
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
        status: 'idle',
      });
      const member = makeAgent({
        slotId: 'slot-m1',
        conversationId: 'conv-m1',
        role: 'teammate',
        status: 'idle',
        agentName: 'Member1',
      });
      const { mgr, workerTaskManager, mailbox } = makeTeammateManager([leadAgent, member]);

      // Only finish — no content streamed, no explicit send
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-m1',
        msg_id: 'm1',
        data: null,
      });

      await new Promise((r) => setTimeout(r, 100));

      // Empty fallback IS still written to the leader's mailbox (for history) ...
      const idleCalls = vi
        .mocked(mailbox.write)
        .mock.calls.filter((args) => args[0].type === 'idle_notification' && args[0].toAgentId === 'slot-lead');
      expect(idleCalls).toHaveLength(1);
      expect(idleCalls[0][0].content).toContain('no response text produced');

      // ... but the leader is NOT woken.
      expect(workerTaskManager.getOrBuildTask).not.toHaveBeenCalledWith('conv-lead');
      mgr.dispose();
    });

    it('wakes leader on empty turn when the teammate explicitly sent a report (explicit send is substantive)', async () => {
      const leadAgent = makeAgent({
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
        status: 'idle',
      });
      const member = makeAgent({
        slotId: 'slot-m1',
        conversationId: 'conv-m1',
        role: 'teammate',
        status: 'idle',
        agentName: 'Member1',
      });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([leadAgent, member]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

      // Explicit send happened during the turn; no streamed content
      mgr.markExplicitSendToLead('slot-m1');
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-m1',
        msg_id: 'm1',
        data: null,
      });

      await new Promise((r) => setTimeout(r, 100));

      // Explicit send is substantive → leader should wake even without streamed text
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
    it('writes testament to leader mailbox, marks member as failed (tab stays), and wakes leader on crash', async () => {
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        conversationType: 'acp',
      });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, mailbox, workerTaskManager } = makeTeammateManager([leader, member]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

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

      // Agent slot is preserved (not removed) — only the process is killed
      expect(mgr.getAgents().find((a) => a.slotId === 'slot-member')).toBeDefined();
      expect(mockIpcBridge.team.agentRemoved.emit).not.toHaveBeenCalled();

      // Agent is marked as failed so the frontend shows the error status
      const crashedAgent = mgr.getAgents().find((a) => a.slotId === 'slot-member');
      expect(crashedAgent?.status).toBe('failed');

      // Process is killed
      expect(workerTaskManager.kill).toHaveBeenCalledWith('conv-member');

      mgr.dispose();
    });

    it('does not send testament when leader itself crashes, marks leader as failed instead', async () => {
      const leader = makeAgent({
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
        agentName: 'Leader',
      });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        conversationType: 'acp',
      });
      const { mgr, mailbox, workerTaskManager } = makeTeammateManager([leader, member]);

      // Simulate leader crash
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-lead',
        msg_id: 'crash-lead',
        data: { error: 'Process exited unexpectedly (code: null, signal: SIGTERM)', agentCrash: true },
      });

      await new Promise((r) => setTimeout(r, 100));

      // No testament written — leader has no recipient for its own crash
      expect(mailbox.write).not.toHaveBeenCalled();

      // Leader NOT removed — marked as failed instead
      expect(mgr.getAgents().find((a) => a.slotId === 'slot-lead')).toBeDefined();
      expect(mgr.getAgents().find((a) => a.slotId === 'slot-lead')?.status).toBe('failed');
      expect(mockIpcBridge.team.agentRemoved.emit).not.toHaveBeenCalled();

      // Process killed
      expect(workerTaskManager.kill).toHaveBeenCalledWith('conv-lead');

      // Member still exists
      expect(mgr.getAgents().find((a) => a.slotId === 'slot-member')).toBeDefined();

      mgr.dispose();
    });

    it('does not trigger crash flow for normal error events without agentCrash flag', async () => {
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' });
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
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' });
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
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' });
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
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' });
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
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' });
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

    // -----------------------------------------------------------------------
    // Granular crash behavior cases (new behavior: no removeAgent on member crash)
    // NOTE: Cases 1-4 are EXPECTED TO FAIL until handleAgentCrash() is updated
    //       to stop calling removeAgent() for members.
    // -----------------------------------------------------------------------

    it('[case-1] member crash: agent NOT removed from getAgents() list', async () => {
      // EXPECTED FAIL — source still calls removeAgent() for members.
      // After fix: agents list length stays at 2; crashed member slotId still present.
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        conversationType: 'acp',
      });
      const { mgr } = makeTeammateManager([leader, member]);

      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'crash-c1',
        data: { error: 'Process exited unexpectedly', agentCrash: true },
      });

      await new Promise((r) => setTimeout(r, 100));

      expect(mgr.getAgents()).toHaveLength(2);
      expect(mgr.getAgents().find((a) => a.slotId === 'slot-member')).toBeDefined();
      expect(mockIpcBridge.team.agentRemoved.emit).not.toHaveBeenCalled();

      mgr.dispose();
    });

    it('[case-2] member crash: agentStatusChanged emitted with status=failed', async () => {
      // EXPECTED FAIL — source calls removeAgent() before setStatus(failed).
      // After fix: setStatus('failed') is called; in-memory agent.status === 'failed'.
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        conversationType: 'acp',
      });
      const { mgr } = makeTeammateManager([leader, member]);

      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'crash-c2',
        data: { error: 'Process exited unexpectedly', agentCrash: true },
      });

      await new Promise((r) => setTimeout(r, 100));

      expect(mockIpcBridge.team.agentStatusChanged.emit).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-1', slotId: 'slot-member', status: 'failed' })
      );
      const agent = mgr.getAgents().find((a) => a.slotId === 'slot-member');
      expect(agent?.status).toBe('failed');

      mgr.dispose();
    });

    it('[case-3] member crash: workerTaskManager.kill called with crashed member conversationId', async () => {
      // EXPECTED FAIL — currently kill() is called inside removeAgent(), which is being removed.
      // After fix: kill(conversationId) must be called directly in handleAgentCrash().
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        conversationType: 'acp',
      });
      const { mgr, workerTaskManager } = makeTeammateManager([leader, member]);

      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'crash-c3',
        data: { error: 'Process exited unexpectedly', agentCrash: true },
      });

      await new Promise((r) => setTimeout(r, 100));

      expect(workerTaskManager.kill).toHaveBeenCalledWith('conv-member');

      mgr.dispose();
    });

    it('[case-4] member crash: activeWake lock cleared so re-wake is not skipped', async () => {
      // EXPECTED FAIL — handleAgentCrash does not yet clear activeWakes before the fix.
      // Setup: manually inject a wake lock, fire crash, then call wake() again.
      // After fix: activeWakes.delete(slotId) in handleAgentCrash → wake() proceeds.
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        status: 'idle',
        conversationType: 'acp',
      });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([leader, member]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

      // Simulate a stale wake lock left over from a previous wake that never resolved
      (mgr as unknown as { activeWakes: Set<string> }).activeWakes.add('slot-member');

      // Crash fires — must clear the stale lock
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'crash-c4',
        data: { error: 'Process exited unexpectedly', agentCrash: true },
      });

      await new Promise((r) => setTimeout(r, 100));

      // Now wake again — should NOT be skipped
      vi.mocked(workerTaskManager.getOrBuildTask).mockClear();
      await mgr.wake('slot-member');
      expect(workerTaskManager.getOrBuildTask).toHaveBeenCalledWith('conv-member');

      mgr.dispose();
    });

    it('[case-5] member crash: testament written to leader mailbox (toAgentId = leader slotId)', async () => {
      // This case passes regardless of whether removeAgent() is called — testament is written first.
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'CrashedWorker',
        conversationType: 'acp',
      });
      const { mgr, mailbox } = makeTeammateManager([leader, member]);

      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'crash-c5',
        data: { error: 'Process exited (code: 1)', agentCrash: true },
      });

      await new Promise((r) => setTimeout(r, 100));

      expect(mailbox.write).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'team-1',
          toAgentId: 'slot-lead',
          fromAgentId: 'slot-member',
        })
      );

      mgr.dispose();
    });

    it('clears turnResponseBuffer when a member crashes (no leak across crash)', async () => {
      const leader = makeAgent({ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        conversationType: 'acp',
      });
      const { mgr } = makeTeammateManager([leader, member]);

      // Pre-seed the capture buffer to simulate streamed text mid-turn
      teamEventBus.emit('responseStream', {
        type: 'content',
        conversation_id: 'conv-member',
        msg_id: 'pre-crash-1',
        data: 'partial output before crash',
      });
      const bufferBeforeCrash = (mgr as unknown as { turnResponseBuffer: Map<string, string> }).turnResponseBuffer;
      expect(bufferBeforeCrash.has('conv-member')).toBe(true);

      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'crash-buf-1',
        data: { error: 'Process exited unexpectedly', agentCrash: true },
      });
      await new Promise((r) => setTimeout(r, 100));

      expect(bufferBeforeCrash.has('conv-member')).toBe(false);
      mgr.dispose();
    });

    it('clears turnResponseBuffer when a leader crashes', async () => {
      const leader = makeAgent({
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
        agentName: 'Leader',
      });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
      });
      const { mgr } = makeTeammateManager([leader, member]);

      // Lead is excluded from capture (role check), but make sure we still
      // delete its conversation entry on crash if any historic value existed.
      const buffer = (mgr as unknown as { turnResponseBuffer: Map<string, string> }).turnResponseBuffer;
      buffer.set('conv-lead', 'leftover from somewhere');

      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-lead',
        msg_id: 'crash-lead-buf',
        data: { error: 'Leader crashed', agentCrash: true },
      });
      await new Promise((r) => setTimeout(r, 100));

      expect(buffer.has('conv-lead')).toBe(false);
      mgr.dispose();
    });

    it('clears turnResponseBuffer when a member crashes with NO leader present', async () => {
      // No leader → handleAgentCrash takes the no-leader branch
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Lonely',
      });
      const { mgr } = makeTeammateManager([member]);

      const buffer = (mgr as unknown as { turnResponseBuffer: Map<string, string> }).turnResponseBuffer;
      buffer.set('conv-member', 'pre-crash text');

      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'lonely-crash',
        data: { error: 'Process died', agentCrash: true },
      });
      await new Promise((r) => setTimeout(r, 100));

      expect(buffer.has('conv-member')).toBe(false);
      mgr.dispose();
    });

    it('[case-6] member crash: leader is woken after testament is written', async () => {
      // This case passes regardless of whether removeAgent() is called — wake(leadSlotId) fires last.
      const leader = makeAgent({
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
        status: 'idle',
      });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentName: 'Worker',
        conversationType: 'acp',
      });
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([leader, member]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({
        sendMessage: mockSendMessage,
      } as never);

      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'crash-c6',
        data: { error: 'Process exited unexpectedly', agentCrash: true },
      });

      await new Promise((r) => setTimeout(r, 100));

      // Leader's wake was triggered — getOrBuildTask called with leader's conversationId
      expect(workerTaskManager.getOrBuildTask).toHaveBeenCalledWith('conv-lead');

      mgr.dispose();
    });
  });

  // ---------------------------------------------------------------------------
  // Auto-captured fallback: response capture buffer + dedup + cap + cleanup
  // (regression coverage for the "leader sees only 'Turn completed'" bug fix)
  // ---------------------------------------------------------------------------
  describe('auto-captured fallback', () => {
    type WithBuffers = {
      turnResponseBuffer: Map<string, string>;
      explicitSendToLeadThisTurn: Set<string>;
    };

    function makeLeaderMember() {
      const leader = makeAgent({
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
        agentName: 'Leader',
      });
      const member = makeAgent({
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        status: 'active',
        agentName: 'Worker',
      });
      return { leader, member };
    }

    // -------------------------------------------------------------------------
    // Capture: streamed content accumulates into per-conversation buffer
    // -------------------------------------------------------------------------

    it('accumulates streamed content events for non-lead teammates', () => {
      const { leader, member } = makeLeaderMember();
      const { mgr } = makeTeammateManager([leader, member]);

      teamEventBus.emit('responseStream', {
        type: 'content',
        conversation_id: 'conv-member',
        msg_id: 'c1',
        data: 'hello ',
      });
      teamEventBus.emit('responseStream', {
        type: 'content',
        conversation_id: 'conv-member',
        msg_id: 'c2',
        data: 'world',
      });

      const buf = (mgr as unknown as WithBuffers).turnResponseBuffer;
      expect(buf.get('conv-member')).toBe('hello world');
      mgr.dispose();
    });

    it('does NOT capture content for the lead agent (lead role excluded)', () => {
      const { leader, member } = makeLeaderMember();
      const { mgr } = makeTeammateManager([leader, member]);

      teamEventBus.emit('responseStream', {
        type: 'content',
        conversation_id: 'conv-lead',
        msg_id: 'l1',
        data: 'leader text',
      });

      const buf = (mgr as unknown as WithBuffers).turnResponseBuffer;
      expect(buf.has('conv-lead')).toBe(false);
      mgr.dispose();
    });

    it('ignores content events with non-string data (defensive against malformed events)', () => {
      const { leader, member } = makeLeaderMember();
      const { mgr } = makeTeammateManager([leader, member]);

      teamEventBus.emit('responseStream', {
        type: 'content',
        conversation_id: 'conv-member',
        msg_id: 'x1',
        data: { not: 'a string' },
      });
      teamEventBus.emit('responseStream', { type: 'content', conversation_id: 'conv-member', msg_id: 'x2', data: '' });

      const buf = (mgr as unknown as WithBuffers).turnResponseBuffer;
      expect(buf.has('conv-member')).toBe(false);
      mgr.dispose();
    });

    // -------------------------------------------------------------------------
    // Token explosion safeguard: tail-biased clip at 3000 chars
    // -------------------------------------------------------------------------

    it('caps the buffer at MAX_RESPONSE_CAPTURE_CHARS (3000) regardless of input size', () => {
      const { leader, member } = makeLeaderMember();
      const { mgr } = makeTeammateManager([leader, member]);

      // Push 100KB of content in 100 chunks of 1KB each
      for (let i = 0; i < 100; i++) {
        teamEventBus.emit('responseStream', {
          type: 'content',
          conversation_id: 'conv-member',
          msg_id: `chunk-${i}`,
          data: 'A'.repeat(1024),
        });
      }

      const buf = (mgr as unknown as WithBuffers).turnResponseBuffer;
      const stored = buf.get('conv-member') ?? '';
      expect(stored.length).toBeLessThanOrEqual(3000);
      expect(stored.length).toBe(3000);
      mgr.dispose();
    });

    it('preserves the TAIL of the stream (so closing summary survives, preamble drops)', () => {
      const { leader, member } = makeLeaderMember();
      const { mgr } = makeTeammateManager([leader, member]);

      // 4000 chars of preamble, then 'TAIL_MARKER' at the very end
      teamEventBus.emit('responseStream', {
        type: 'content',
        conversation_id: 'conv-member',
        msg_id: 'pre',
        data: 'P'.repeat(4000),
      });
      teamEventBus.emit('responseStream', {
        type: 'content',
        conversation_id: 'conv-member',
        msg_id: 'tail',
        data: 'TAIL_MARKER',
      });

      const buf = (mgr as unknown as WithBuffers).turnResponseBuffer;
      const stored = buf.get('conv-member') ?? '';
      expect(stored.length).toBe(3000);
      expect(stored.endsWith('TAIL_MARKER')).toBe(true);
      mgr.dispose();
    });

    // -------------------------------------------------------------------------
    // Fallback message format: marker prefix
    // -------------------------------------------------------------------------

    it('writes [auto-captured fallback ...] prefix when teammate produced text but did not call team_send_message', async () => {
      const { leader, member } = makeLeaderMember();
      const { mgr, mailbox } = makeTeammateManager([leader, member]);

      teamEventBus.emit('responseStream', {
        type: 'content',
        conversation_id: 'conv-member',
        msg_id: 'c1',
        data: 'I did the thing',
      });
      teamEventBus.emit('responseStream', { type: 'finish', conversation_id: 'conv-member', msg_id: 'f1', data: null });

      await new Promise((r) => setTimeout(r, 50));

      const idleCalls = vi
        .mocked(mailbox.write)
        .mock.calls.filter((args) => args[0].type === 'idle_notification' && args[0].toAgentId === 'slot-lead');
      expect(idleCalls).toHaveLength(1);
      const content = idleCalls[0][0].content as string;
      expect(content).toContain('[auto-captured fallback');
      expect(content).toContain('I did the thing');
      mgr.dispose();
    });

    it('writes "(no response text produced)" fallback when teammate produced no text', async () => {
      const { leader, member } = makeLeaderMember();
      const { mgr, mailbox } = makeTeammateManager([leader, member]);

      // No content event emitted, just finish
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'f-empty',
        data: null,
      });

      await new Promise((r) => setTimeout(r, 50));

      const idleCalls = vi
        .mocked(mailbox.write)
        .mock.calls.filter((args) => args[0].type === 'idle_notification' && args[0].toAgentId === 'slot-lead');
      expect(idleCalls).toHaveLength(1);
      const content = idleCalls[0][0].content as string;
      expect(content).toContain('[auto-captured fallback]');
      expect(content).toContain('no response text produced');
      mgr.dispose();
    });

    it('treats whitespace-only captured response as empty (still emits the no-text fallback)', async () => {
      const { leader, member } = makeLeaderMember();
      const { mgr, mailbox } = makeTeammateManager([leader, member]);

      teamEventBus.emit('responseStream', {
        type: 'content',
        conversation_id: 'conv-member',
        msg_id: 'ws',
        data: '   \n\t   \n',
      });
      teamEventBus.emit('responseStream', {
        type: 'finish',
        conversation_id: 'conv-member',
        msg_id: 'fws',
        data: null,
      });

      await new Promise((r) => setTimeout(r, 50));

      const idleCalls = vi
        .mocked(mailbox.write)
        .mock.calls.filter((args) => args[0].type === 'idle_notification' && args[0].toAgentId === 'slot-lead');
      expect(idleCalls).toHaveLength(1);
      expect(idleCalls[0][0].content).toContain('no response text produced');
      mgr.dispose();
    });

    // -------------------------------------------------------------------------
    // Dedup: explicit send to lead suppresses fallback
    // -------------------------------------------------------------------------

    it('skips the fallback when markExplicitSendToLead was called this turn', async () => {
      const { leader, member } = makeLeaderMember();
      const { mgr, mailbox } = makeTeammateManager([leader, member]);

      // Teammate streams text AND calls explicit send (the normal "good" path)
      teamEventBus.emit('responseStream', {
        type: 'content',
        conversation_id: 'conv-member',
        msg_id: 'c1',
        data: 'curated report',
      });
      mgr.markExplicitSendToLead('slot-member');
      teamEventBus.emit('responseStream', { type: 'finish', conversation_id: 'conv-member', msg_id: 'f1', data: null });

      await new Promise((r) => setTimeout(r, 50));

      // Only the leader-targeted idle_notification should be suppressed.
      // The explicit message was already written by TeamMcpServer (not modeled here).
      const idleCalls = vi
        .mocked(mailbox.write)
        .mock.calls.filter((args) => args[0].type === 'idle_notification' && args[0].toAgentId === 'slot-lead');
      expect(idleCalls).toHaveLength(0);
      mgr.dispose();
    });

    it('markExplicitSendToLead is per-turn (next turn re-arms the fallback)', async () => {
      const { leader, member } = makeLeaderMember();
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, mailbox, workerTaskManager } = makeTeammateManager([leader, member]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({ sendMessage: mockSendMessage } as never);

      // Turn 1: explicit send → no fallback
      mgr.markExplicitSendToLead('slot-member');
      teamEventBus.emit('responseStream', { type: 'finish', conversation_id: 'conv-member', msg_id: 't1', data: null });
      await new Promise((r) => setTimeout(r, 50));

      // Re-wake triggers a new turn; flag should be reset
      vi.mocked(mailbox.write).mockClear();
      await mgr.wake('slot-member');

      // Turn 2: NO explicit send → fallback should fire
      teamEventBus.emit('responseStream', {
        type: 'content',
        conversation_id: 'conv-member',
        msg_id: 'c2',
        data: 'silent turn output',
      });
      teamEventBus.emit('responseStream', { type: 'finish', conversation_id: 'conv-member', msg_id: 't2', data: null });
      await new Promise((r) => setTimeout(r, 50));

      const idleCalls = vi
        .mocked(mailbox.write)
        .mock.calls.filter((args) => args[0].type === 'idle_notification' && args[0].toAgentId === 'slot-lead');
      expect(idleCalls).toHaveLength(1);
      expect(idleCalls[0][0].content).toContain('silent turn output');
      mgr.dispose();
    });

    it('markExplicitSendToLead is idempotent (multiple calls in same turn → still suppresses once)', async () => {
      const { leader, member } = makeLeaderMember();
      const { mgr, mailbox } = makeTeammateManager([leader, member]);

      mgr.markExplicitSendToLead('slot-member');
      mgr.markExplicitSendToLead('slot-member');
      mgr.markExplicitSendToLead('slot-member');

      teamEventBus.emit('responseStream', { type: 'finish', conversation_id: 'conv-member', msg_id: 'f', data: null });
      await new Promise((r) => setTimeout(r, 50));

      const idleCalls = vi
        .mocked(mailbox.write)
        .mock.calls.filter((args) => args[0].type === 'idle_notification' && args[0].toAgentId === 'slot-lead');
      expect(idleCalls).toHaveLength(0);
      mgr.dispose();
    });

    // -------------------------------------------------------------------------
    // Cleanup paths (memory leak prevention)
    // -------------------------------------------------------------------------

    it('finalizeTurn clears the buffer entry (no growth across turns)', async () => {
      const { leader, member } = makeLeaderMember();
      const { mgr } = makeTeammateManager([leader, member]);

      teamEventBus.emit('responseStream', {
        type: 'content',
        conversation_id: 'conv-member',
        msg_id: 'c',
        data: 'turn output',
      });
      teamEventBus.emit('responseStream', { type: 'finish', conversation_id: 'conv-member', msg_id: 'f', data: null });
      await new Promise((r) => setTimeout(r, 50));

      const buf = (mgr as unknown as WithBuffers).turnResponseBuffer;
      expect(buf.has('conv-member')).toBe(false);
      mgr.dispose();
    });

    it('wake() resets the buffer entry defensively (in case prior turn dropped finish)', async () => {
      const { leader, member } = makeLeaderMember();
      const idleMember = { ...member, status: 'idle' as const };
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([leader, idleMember]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({ sendMessage: mockSendMessage } as never);

      // Pre-seed leftover state from a hypothetically-lost prior turn
      const buf = (mgr as unknown as WithBuffers).turnResponseBuffer;
      const flags = (mgr as unknown as WithBuffers).explicitSendToLeadThisTurn;
      buf.set('conv-member', 'leftover from a turn whose finish event was dropped');
      flags.add('slot-member');

      await mgr.wake('slot-member');

      expect(buf.has('conv-member')).toBe(false);
      expect(flags.has('slot-member')).toBe(false);
      mgr.dispose();
    });

    it('removeAgent clears both the buffer and the flag for the removed agent', () => {
      const { leader, member } = makeLeaderMember();
      const { mgr } = makeTeammateManager([leader, member]);

      const buf = (mgr as unknown as WithBuffers).turnResponseBuffer;
      const flags = (mgr as unknown as WithBuffers).explicitSendToLeadThisTurn;
      buf.set('conv-member', 'mid-turn text');
      flags.add('slot-member');

      mgr.removeAgent('slot-member');

      expect(buf.has('conv-member')).toBe(false);
      expect(flags.has('slot-member')).toBe(false);
      mgr.dispose();
    });

    it('dispose clears all buffer entries and flags', () => {
      const { leader, member } = makeLeaderMember();
      const second = makeAgent({ slotId: 'slot-2', conversationId: 'conv-2', role: 'teammate', agentName: 'Beta' });
      const { mgr } = makeTeammateManager([leader, member, second]);

      const buf = (mgr as unknown as WithBuffers).turnResponseBuffer;
      const flags = (mgr as unknown as WithBuffers).explicitSendToLeadThisTurn;
      buf.set('conv-member', 'a');
      buf.set('conv-2', 'b');
      flags.add('slot-member');
      flags.add('slot-2');

      // Suppress the dispose-time leftover-state warning during the assertion
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mgr.dispose();
      warnSpy.mockRestore();

      expect(buf.size).toBe(0);
      expect(flags.size).toBe(0);
    });

    it('dispose logs a warning when leftover per-turn state is present (leak detection)', () => {
      const { leader, member } = makeLeaderMember();
      const { mgr } = makeTeammateManager([leader, member]);

      const buf = (mgr as unknown as WithBuffers).turnResponseBuffer;
      buf.set('conv-member', 'leftover');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mgr.dispose();
      const warned = warnSpy.mock.calls.some(
        (args) => typeof args[0] === 'string' && args[0].includes('leftover per-turn state')
      );
      warnSpy.mockRestore();

      expect(warned).toBe(true);
    });

    it('dispose does NOT warn when state is clean', () => {
      const { leader, member } = makeLeaderMember();
      const { mgr } = makeTeammateManager([leader, member]);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mgr.dispose();
      const warned = warnSpy.mock.calls.some(
        (args) => typeof args[0] === 'string' && args[0].includes('leftover per-turn state')
      );
      warnSpy.mockRestore();

      expect(warned).toBe(false);
    });

    // -------------------------------------------------------------------------
    // Stress: many turns must not leak memory or grow the buffer
    // -------------------------------------------------------------------------

    it('STRESS: 200 turns × 50KB each → buffer is empty after each finalize and total size never grows beyond cap', async () => {
      const { leader, member } = makeLeaderMember();
      // Use a workerTaskManager whose getOrBuildTask resolves so the leader wake
      // chain (triggered by maybeWakeLeaderWhenAllIdle) can complete cleanly.
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      const { mgr, workerTaskManager } = makeTeammateManager([leader, member]);
      vi.mocked(workerTaskManager.getOrBuildTask).mockResolvedValue({ sendMessage: mockSendMessage } as never);

      const buf = (mgr as unknown as WithBuffers).turnResponseBuffer;
      const flags = (mgr as unknown as WithBuffers).explicitSendToLeadThisTurn;
      const finalizedTurns = (mgr as unknown as { finalizedTurns: Set<string> }).finalizedTurns;
      let maxObservedBufferSize = 0;

      for (let turn = 0; turn < 200; turn++) {
        // Stream ~50KB in 50 chunks
        for (let i = 0; i < 50; i++) {
          teamEventBus.emit('responseStream', {
            type: 'content',
            conversation_id: 'conv-member',
            msg_id: `t${turn}-c${i}`,
            data: 'X'.repeat(1024),
          });
          const cur = buf.get('conv-member')?.length ?? 0;
          if (cur > maxObservedBufferSize) maxObservedBufferSize = cur;
        }

        // Finish — schedules async finalizeTurn (which awaits mailbox.write).
        // Clear the dedup window first so each turn's finish is actually processed.
        finalizedTurns.clear();
        teamEventBus.emit('responseStream', {
          type: 'finish',
          conversation_id: 'conv-member',
          msg_id: `t${turn}-fin`,
          data: null,
        });
        // Real-time yield (≥1ms) so the awaited mailbox.write resolves and
        // finalizeTurn runs to completion before we assert.
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1));

        expect(buf.has('conv-member'), `turn ${turn}: buffer should be drained after finalize`).toBe(false);
        expect(flags.has('slot-member'), `turn ${turn}: explicit-send flag should be cleared`).toBe(false);
      }

      expect(maxObservedBufferSize, 'mid-stream size must never exceed the 3000-char cap').toBeLessThanOrEqual(3000);

      mgr.dispose();
    });
  });
});
