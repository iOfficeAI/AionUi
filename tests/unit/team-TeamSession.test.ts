// tests/unit/team-TeamSession.test.ts
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

import { TeamSession } from '@process/team/TeamSession';
import type { ITeamRepository } from '@process/team/repository/ITeamRepository';
import type { TTeam } from '@process/team/types';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo(): ITeamRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMailboxByTeam: vi.fn(),
    deleteTasksByTeam: vi.fn(),
    writeMessage: vi.fn(async (message) => message),
    readUnread: vi.fn(),
    readUnreadAndMark: vi.fn(),
    markRead: vi.fn(),
    getMailboxHistory: vi.fn(),
    createTask: vi.fn(),
    findTaskById: vi.fn(),
    updateTask: vi.fn(),
    findTasksByTeam: vi.fn(),
    findTasksByOwner: vi.fn(),
    deleteTask: vi.fn(),
    appendToBlocks: vi.fn(),
    removeFromBlockedBy: vi.fn(),
  } as unknown as ITeamRepository;
}

function makeWorkerTaskManager(): IWorkerTaskManager {
  return {
    getOrBuildTask: vi.fn(),
    kill: vi.fn(),
  } as unknown as IWorkerTaskManager;
}

function makeTeam(overrides: Partial<TTeam> = {}): TTeam {
  return {
    id: 'team-1',
    name: 'Test Team',
    leaderAgentId: 'slot-lead',
    agents: [
      {
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
        agentType: 'acp',
        agentName: 'Leader',
        conversationType: 'acp',
        status: 'idle',
      },
      {
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentType: 'acp',
        agentName: 'Worker',
        conversationType: 'acp',
        status: 'idle',
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as TTeam;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TeamSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('dispose()', () => {
    it('kills all agent processes during dispose', async () => {
      const workerTaskManager = makeWorkerTaskManager();
      const session = new TeamSession(makeTeam(), makeRepo(), workerTaskManager);

      await session.dispose();

      // Both agents should have their processes killed
      expect(workerTaskManager.kill).toHaveBeenCalledWith('conv-lead');
      expect(workerTaskManager.kill).toHaveBeenCalledWith('conv-member');
      expect(workerTaskManager.kill).toHaveBeenCalledTimes(2);
    });

    it('cleans up listeners even if mcpServer.stop() throws', async () => {
      const workerTaskManager = makeWorkerTaskManager();
      const session = new TeamSession(makeTeam(), makeRepo(), workerTaskManager);

      // Access private mcpServer and make stop() throw
      const mcpServer = (session as unknown as { mcpServer: { stop: () => Promise<void> } }).mcpServer;
      mcpServer.stop = vi.fn().mockRejectedValue(new Error('MCP stop failed'));

      // Listen for removeAllListeners being called
      const removeListenersSpy = vi.spyOn(session, 'removeAllListeners');

      // dispose should reject (error propagates through try/finally)
      await expect(session.dispose()).rejects.toThrow('MCP stop failed');

      // removeAllListeners should still be called (try/finally ensures cleanup)
      expect(removeListenersSpy).toHaveBeenCalled();

      removeListenersSpy.mockRestore();
    });

    it('skips kill for agents without conversationId', async () => {
      const workerTaskManager = makeWorkerTaskManager();
      const team = makeTeam({
        agents: [
          {
            slotId: 'slot-lead',
            conversationId: 'conv-lead',
            role: 'leader' as const,
            agentType: 'acp',
            agentName: 'Leader',
            conversationType: 'acp',
            status: 'idle' as const,
          },
          {
            slotId: 'slot-pending',
            conversationId: '',
            role: 'teammate' as const,
            agentType: 'acp',
            agentName: 'Pending',
            conversationType: 'acp',
            status: 'pending' as const,
          },
        ],
      });
      const session = new TeamSession(team, makeRepo(), workerTaskManager);

      await session.dispose();

      // Only the agent with conversationId should be killed
      expect(workerTaskManager.kill).toHaveBeenCalledWith('conv-lead');
      expect(workerTaskManager.kill).toHaveBeenCalledTimes(1);
    });
  });

  describe('delivery semantics', () => {
    it('sendMessage resolves after mailbox acceptance even when wake fails', async () => {
      const repo = makeRepo();
      const session = new TeamSession(makeTeam(), repo, makeWorkerTaskManager());
      vi.spyOn(session, 'startMcpServer').mockResolvedValue({ command: 'noop', args: [], env: [] });

      const wakeSpy = vi
        .spyOn(
          (session as unknown as { teammateManager: { wake: (slotId: string) => Promise<void> } }).teammateManager,
          'wake'
        )
        .mockRejectedValue(new Error('Task unavailable'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(session.sendMessage('hello team')).resolves.toBeUndefined();

      expect(repo.writeMessage).toHaveBeenCalledTimes(1);
      expect(wakeSpy).toHaveBeenCalledWith('slot-lead');
      expect(errorSpy).toHaveBeenCalledWith(
        '[TeamSession] Accepted team message but failed to wake slot-lead:',
        'Task unavailable'
      );
    });

    it('sendMessageToAgent resolves after mailbox acceptance even when wake fails', async () => {
      const repo = makeRepo();
      const session = new TeamSession(makeTeam(), repo, makeWorkerTaskManager());
      vi.spyOn(session, 'startMcpServer').mockResolvedValue({ command: 'noop', args: [], env: [] });

      const wakeSpy = vi
        .spyOn(
          (session as unknown as { teammateManager: { wake: (slotId: string) => Promise<void> } }).teammateManager,
          'wake'
        )
        .mockRejectedValue(new Error('Task unavailable'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(session.sendMessageToAgent('slot-member', 'hello member')).resolves.toBeUndefined();

      expect(repo.writeMessage).toHaveBeenCalledTimes(1);
      expect(wakeSpy).toHaveBeenCalledWith('slot-member');
      expect(errorSpy).toHaveBeenCalledWith(
        '[TeamSession] Accepted agent message but failed to wake slot-member:',
        'Task unavailable'
      );
    });

    it('still rejects when acceptance fails before mailbox delivery', async () => {
      const repo = makeRepo();
      const session = new TeamSession(makeTeam(), repo, makeWorkerTaskManager());
      vi.spyOn(session, 'startMcpServer').mockRejectedValue(new Error('mcp failed'));

      await expect(session.sendMessage('hello team')).rejects.toThrow('mcp failed');
      expect(repo.writeMessage).not.toHaveBeenCalled();
    });
  });
});
