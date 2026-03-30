import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  responseStreamOn: vi.fn(),
  responseStreamOff: vi.fn(),
  turnCompletedOn: vi.fn(),
  turnCompletedOff: vi.fn(),
  agentStatusChangedEmit: vi.fn(),
  messageStreamEmit: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: { on: mocks.responseStreamOn, off: mocks.responseStreamOff },
      turnCompleted: { on: mocks.turnCompletedOn, off: mocks.turnCompletedOff },
    },
    team: {
      agentStatusChanged: { emit: mocks.agentStatusChangedEmit },
      messageStream: { emit: mocks.messageStreamEmit },
    },
  },
}));

import { TeamSession } from '@process/team/TeamSession';
import type { TTeam, TeamAgentRuntime } from '@process/team/types';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IConversationService } from '@process/services/IConversationService';
import type { IAgentManager } from '@process/task/IAgentManager';

function makeTeam(): TTeam {
  return {
    id: 'team-1',
    userId: 'user-1',
    name: 'Test Team',
    workspace: '/tmp/ws',
    workspaceMode: 'shared',
    agents: [
      {
        slotId: 'slot-dispatch',
        conversationId: 'conv-dispatch',
        role: 'dispatch',
        agentType: 'acp',
        agentName: 'Claude',
      },
      { slotId: 'slot-sub', conversationId: 'conv-sub', role: 'sub', agentType: 'gemini', agentName: 'Gemini' },
    ],
    createdAt: 1000,
    updatedAt: 1000,
  };
}

function makeAgentManager(conversationId: string): IAgentManager {
  return {
    type: 'acp',
    status: 'finished',
    workspace: '/tmp/ws',
    conversation_id: conversationId,
    sendMessage: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn(),
    getConfirmations: vi.fn().mockReturnValue([]),
    kill: vi.fn(),
  };
}

describe('TeamSession', () => {
  let session: TeamSession;
  let mockWorkerTaskManager: IWorkerTaskManager;
  let mockConversationService: IConversationService;
  let dispatchAgent: IAgentManager;
  let subAgent: IAgentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatchAgent = makeAgentManager('conv-dispatch');
    subAgent = makeAgentManager('conv-sub');

    mockWorkerTaskManager = {
      getTask: vi.fn(),
      getOrBuildTask: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'conv-dispatch') return dispatchAgent;
        if (id === 'conv-sub') return subAgent;
        throw new Error(`Unknown conversation ${id}`);
      }),
      addTask: vi.fn(),
      kill: vi.fn(),
      clear: vi.fn(),
      listTasks: vi.fn().mockReturnValue([]),
    };

    mockConversationService = {
      createConversation: vi.fn(),
      deleteConversation: vi.fn(),
      updateConversation: vi.fn(),
      getConversation: vi.fn(),
      createWithMigration: vi.fn(),
      listAllConversations: vi.fn(),
    } as unknown as IConversationService;

    session = new TeamSession(makeTeam(), mockWorkerTaskManager, mockConversationService);
  });

  it('initialises runtime status as idle for all agents', () => {
    const runtimes = session.getRuntimes();
    expect(runtimes.size).toBe(2);
    expect(runtimes.get('slot-dispatch')?.status).toBe('idle');
    expect(runtimes.get('slot-sub')?.status).toBe('idle');
  });

  it('sendMessage forwards to dispatch agent', async () => {
    await session.sendMessage('hello');
    expect(dispatchAgent.sendMessage).toHaveBeenCalledWith('hello');
  });

  it('routeTask routes to the correct sub-agent', async () => {
    await session.routeTask({ slotId: 'slot-sub', prompt: 'do something' });
    expect(subAgent.sendMessage).toHaveBeenCalledWith('do something');
  });

  it('routeTask sets sub-agent status to working then done', async () => {
    const statusEvents: TeamAgentRuntime[] = [];
    session.on('agentStatusChanged', (runtime: TeamAgentRuntime) => {
      statusEvents.push({ ...runtime });
    });
    await session.routeTask({ slotId: 'slot-sub', prompt: 'task' });
    expect(statusEvents[0]?.status).toBe('working');
  });

  it('addAgent appends a new runtime entry', () => {
    session.addAgent({
      slotId: 'slot-new',
      conversationId: 'conv-new',
      role: 'sub',
      agentType: 'gemini',
      agentName: 'Gemini 2',
    });
    const runtimes = session.getRuntimes();
    expect(runtimes.has('slot-new')).toBe(true);
    expect(runtimes.get('slot-new')?.status).toBe('idle');
  });
});
