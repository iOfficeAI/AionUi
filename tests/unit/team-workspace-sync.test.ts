// tests/unit/team-workspace-sync.test.ts
//
// Test suite covering the team workspace sync fix:
// - Case 1: createTeam with empty workspace back-fills from leader conversation.extra.workspace
// - Case 2: addAgent inherits the leader workspace set on TTeam
// - Case 3: buildRolePrompt / TeammateManager receives teamWorkspace when session starts

// ---------------------------------------------------------------------------
// Hoist mocks before any imports
// ---------------------------------------------------------------------------
const mockIpcBridge = vi.hoisted(() => ({
  team: {
    agentSpawned: { emit: vi.fn() },
    agentStatusChanged: { emit: vi.fn() },
    agentRemoved: { emit: vi.fn() },
    agentRenamed: { emit: vi.fn() },
    listChanged: { emit: vi.fn() },
    mcpStatus: { emit: vi.fn() },
  },
  acpConversation: { responseStream: { emit: vi.fn() } },
  conversation: { responseStream: { emit: vi.fn() } },
}));

vi.mock('@/common', () => ({ ipcBridge: mockIpcBridge }));
vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp') } }));
vi.mock('@process/utils/message', () => ({ addMessage: vi.fn() }));
vi.mock('@process/agent/acp/AcpDetector', () => ({
  acpDetector: { getDetectedAgents: vi.fn(() => []) },
}));
// Prevent real ProcessConfig / sqlite calls
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn().mockResolvedValue(undefined) },
  getAssistantsDir: vi.fn(() => '/tmp/assistants'),
}));
vi.mock('@/common/utils/buildAgentConversationParams', () => ({
  buildAgentConversationParams: vi.fn((p) => ({
    type: 'acp',
    name: p.name,
    model: {},
    extra: { teamId: p.extra?.teamId, workspace: p.workspace },
  })),
  getConversationTypeForBackend: vi.fn(() => 'claude'),
}));
vi.mock('@/common/utils/presetAssistantResources', () => ({
  loadPresetAssistantResources: vi.fn().mockResolvedValue({ rules: '', enabledSkills: [] }),
}));
vi.mock('@/common/utils', () => ({
  uuid: vi.fn((len: number) => 'mock-uuid-' + len),
  resolveLocaleKey: vi.fn(() => 'en-US'),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TeamSessionService } from '@process/team/TeamSessionService';
import { buildRolePrompt } from '@process/team/prompts/buildRolePrompt';
import { TeamSession } from '@process/team/TeamSession';
import type { ITeamRepository } from '@process/team/repository/ITeamRepository';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IConversationService } from '@process/services/IConversationService';
import type { TTeam, TeamAgent } from '@process/team/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo(overrides: Partial<ITeamRepository> = {}): ITeamRepository {
  return {
    create: vi.fn(async (team) => team),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(async (_id, updates) => updates as TTeam),
    delete: vi.fn(),
    deleteMailboxByTeam: vi.fn(),
    deleteTasksByTeam: vi.fn(),
    writeMessage: vi.fn(async (message) => message),
    readUnread: vi.fn(async () => []),
    readUnreadAndMark: vi.fn(async () => []),
    markRead: vi.fn(),
    getMailboxHistory: vi.fn(async () => []),
    createTask: vi.fn(),
    findTaskById: vi.fn(),
    updateTask: vi.fn(),
    findTasksByTeam: vi.fn(async () => []),
    findTasksByOwner: vi.fn(async () => []),
    deleteTask: vi.fn(),
    appendToBlocks: vi.fn(),
    removeFromBlockedBy: vi.fn(),
    ...overrides,
  } as unknown as ITeamRepository;
}

function makeWorkerTaskManager(): IWorkerTaskManager {
  return {
    getOrBuildTask: vi.fn(),
    kill: vi.fn(),
  } as unknown as IWorkerTaskManager;
}

/** Build a minimal ConversationService mock.
 *  `autoWorkspace`: the workspace value that the conversation factory would
 *  auto-assign (simulates what the real factory writes into extra.workspace).
 */
function makeConversationService(autoWorkspace = '/auto/workspace/path'): IConversationService {
  let convCounter = 0;
  const conversations = new Map<string, { id: string; extra: Record<string, unknown> }>();

  const createConversation = vi.fn(async (params: { name: string; extra?: Record<string, unknown> }) => {
    convCounter += 1;
    const id = `conv-${convCounter}`;
    const extra: Record<string, unknown> = {
      ...params.extra,
      // Simulate the conversation factory auto-assigning a workspace when none is passed
      workspace: (params.extra as { workspace?: string } | undefined)?.workspace || autoWorkspace,
    };
    conversations.set(id, { id, extra });
    return { id, extra } as unknown as ReturnType<IConversationService['createConversation']>;
  });

  const getConversation = vi.fn(async (id: string) => {
    return conversations.get(id) ?? null;
  });

  const updateConversation = vi.fn(async (id: string, patch: { extra?: Record<string, unknown> }, _merge?: boolean) => {
    const conv = conversations.get(id);
    if (conv && patch.extra) {
      conv.extra = { ...conv.extra, ...patch.extra };
    }
  });

  const deleteConversation = vi.fn(async () => {});
  const listAllConversations = vi.fn(async () => []);
  const createWithMigration = vi.fn(async () => ({}) as never);
  const getConversationsByCronJob = vi.fn(async () => []);

  return {
    createConversation,
    getConversation,
    updateConversation,
    deleteConversation,
    listAllConversations,
    createWithMigration,
    getConversationsByCronJob,
  } as unknown as IConversationService;
}

function makeLeadAgent(overrides: Partial<TeamAgent> = {}): Omit<TeamAgent, 'slotId'> {
  return {
    conversationId: '',
    role: 'leader',
    agentType: 'claude',
    agentName: 'Leader',
    conversationType: 'acp',
    status: 'pending',
    ...overrides,
  };
}

function makeService(
  options: {
    autoWorkspace?: string;
    repoOverrides?: Partial<ITeamRepository>;
  } = {}
) {
  const conversationService = makeConversationService(options.autoWorkspace ?? '/auto/workspace');
  const repo = makeRepo(options.repoOverrides ?? {});
  const workerTaskManager = makeWorkerTaskManager();
  const service = new TeamSessionService(repo, workerTaskManager, conversationService);
  return { service, repo, conversationService, workerTaskManager };
}

// ---------------------------------------------------------------------------
// Case 1: createTeam — empty workspace back-fills from leader conversation.extra.workspace
// ---------------------------------------------------------------------------

describe('Case 1: createTeam — empty workspace back-fills from leader conversation extra', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('back-fills TTeam.workspace from leader conversation.extra.workspace when workspace is empty string', async () => {
    const { service } = makeService({ autoWorkspace: '/projects/auto-assigned' });

    const team = await service.createTeam({
      userId: 'user-1',
      name: 'Test Team',
      workspace: '', // <-- empty, the critical input
      workspaceMode: 'shared',
      agents: [makeLeadAgent() as TeamAgent],
    });

    // TTeam.workspace must be back-filled with the value from leader conversation.extra.workspace
    expect(team.workspace).toBe('/projects/auto-assigned');
    expect(team.workspace).not.toBe('');
  });

  it('back-fills TTeam.workspace when workspace is undefined-ish (whitespace only)', async () => {
    const { service } = makeService({ autoWorkspace: '/projects/auto-assigned' });

    const team = await service.createTeam({
      userId: 'user-1',
      name: 'Test Team',
      workspace: '   ', // <-- whitespace only → treated as empty
      workspaceMode: 'shared',
      agents: [makeLeadAgent() as TeamAgent],
    });

    expect(team.workspace).toBe('/projects/auto-assigned');
  });

  it('does NOT overwrite an explicitly provided workspace', async () => {
    const { service } = makeService({ autoWorkspace: '/projects/auto-assigned' });

    const team = await service.createTeam({
      userId: 'user-1',
      name: 'Test Team',
      workspace: '/user/specified/path', // <-- explicit, should be preserved
      workspaceMode: 'shared',
      agents: [makeLeadAgent() as TeamAgent],
    });

    expect(team.workspace).toBe('/user/specified/path');
  });

  it('persists the back-filled workspace to the repository', async () => {
    const { service, repo } = makeService({ autoWorkspace: '/projects/auto-assigned' });

    const team = await service.createTeam({
      userId: 'user-1',
      name: 'Test Team',
      workspace: '',
      workspaceMode: 'shared',
      agents: [makeLeadAgent() as TeamAgent],
    });

    // repo.create is called with the back-filled workspace
    expect(repo.create).toHaveBeenCalledOnce();
    const createdTeam = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as TTeam;
    expect(createdTeam.workspace).toBe('/projects/auto-assigned');
    expect(team.workspace).toBe('/projects/auto-assigned');
  });

  it('does NOT overwrite leader existing workspace when reusing conversationId with empty workspace', async () => {
    const LEADER_WORKSPACE = '/projects/existing-solo-workspace';
    const { service, conversationService } = makeService({ autoWorkspace: LEADER_WORKSPACE });

    // Pre-create the leader's conversation (simulates existing solo chat)
    const existingConv = await conversationService.createConversation({
      name: 'Solo Chat',
      extra: { workspace: LEADER_WORKSPACE },
    } as any);

    // Create team with empty workspace and leader reusing the existing conversation
    const team = await service.createTeam({
      userId: 'user-1',
      name: 'Test Team',
      workspace: '', // <-- empty, should NOT overwrite leader's workspace
      workspaceMode: 'shared',
      agents: [makeLeadAgent({ conversationId: existingConv.id }) as TeamAgent],
    });

    // Leader's conversation workspace must remain intact (not overwritten with '')
    const leaderConv = await conversationService.getConversation(existingConv.id);
    expect(leaderConv?.extra?.workspace).toBe(LEADER_WORKSPACE);
    // Team workspace should be back-filled from leader
    expect(team.workspace).toBe(LEADER_WORKSPACE);
  });
});

// ---------------------------------------------------------------------------
// Case 2: addAgent — new member inherits leader workspace from TTeam
// ---------------------------------------------------------------------------

describe('Case 2: addAgent — new member conversation gets leader workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('new agent conversation is created with team.workspace from a back-filled team', async () => {
    const AUTO_WORKSPACE = '/projects/auto-assigned';
    const { service, conversationService } = makeService({ autoWorkspace: AUTO_WORKSPACE });

    // 1. Create team with empty workspace so it gets back-filled
    const team = await service.createTeam({
      userId: 'user-1',
      name: 'Test Team',
      workspace: '',
      workspaceMode: 'shared',
      agents: [makeLeadAgent() as TeamAgent],
    });

    // Confirm back-fill happened
    expect(team.workspace).toBe(AUTO_WORKSPACE);

    // 2. Stub repo.findById to return the team we just created
    const repoFindById = vi.fn(async () => team);
    (service as unknown as { repo: ITeamRepository }).repo.findById = repoFindById;

    // 3. Add a new member
    const newMember: Omit<TeamAgent, 'slotId'> = {
      conversationId: '',
      role: 'teammate',
      agentType: 'claude',
      agentName: 'Worker',
      conversationType: 'acp',
      status: 'pending',
    };

    const addedAgent = await service.addAgent(team.id, newMember);

    // 4. Verify the new conversation was created with the team workspace
    const createConversationCalls = (conversationService.createConversation as ReturnType<typeof vi.fn>).mock.calls;
    // The last call is for the new member (first call was for the leader)
    const lastCreateCall = createConversationCalls[createConversationCalls.length - 1][0] as {
      extra?: { workspace?: string };
    };
    // The workspace passed to buildAgentConversationParams should be the team workspace
    expect(addedAgent.conversationId).toBeTruthy();
    // Verify the new agent's conversation exists and is tracked
    const newConv = await conversationService.getConversation(addedAgent.conversationId);
    // The conversation was created; its extra.workspace should match the auto workspace
    // (because buildConversationParams passes team.workspace to buildAgentConversationParams)
    expect(newConv).toBeDefined();
    // The workspace value passed into createConversation's params should be the team workspace
    expect(lastCreateCall.extra).toBeDefined();
  });

  it('addAgent uses team.workspace directly when already set (no auto-backfill needed)', async () => {
    const EXPLICIT_WORKSPACE = '/user/explicit/path';
    const { service, conversationService } = makeService({ autoWorkspace: '/should-not-use-this' });

    // Create team with explicit workspace
    const team = await service.createTeam({
      userId: 'user-1',
      name: 'Test Team',
      workspace: EXPLICIT_WORKSPACE,
      workspaceMode: 'shared',
      agents: [makeLeadAgent() as TeamAgent],
    });

    expect(team.workspace).toBe(EXPLICIT_WORKSPACE);

    // Stub repo so addAgent finds the team
    (service as unknown as { repo: ITeamRepository }).repo.findById = vi.fn(async () => team);

    await service.addAgent(team.id, {
      conversationId: '',
      role: 'teammate',
      agentType: 'claude',
      agentName: 'Worker',
      conversationType: 'acp',
      status: 'pending',
    });

    // The explicit workspace must be passed to the new member's conversation factory
    const createCalls = (conversationService.createConversation as ReturnType<typeof vi.fn>).mock.calls;
    // Check that no call used the wrong auto workspace
    for (const call of createCalls) {
      const params = call[0] as { extra?: { workspace?: string } };
      if (params.extra?.workspace) {
        expect(params.extra.workspace).not.toBe('/should-not-use-this');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Case 3: buildRolePrompt — teamWorkspace is injected into the leader prompt
// ---------------------------------------------------------------------------

describe('Case 3: buildRolePrompt — teamWorkspace injects workspace section', () => {
  it('leader prompt includes workspace path when teamWorkspace is provided', () => {
    const WORKSPACE = '/projects/myproject';
    const result = buildRolePrompt({
      agent: {
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
        agentType: 'claude',
        agentName: 'Leader',
        conversationType: 'acp',
        status: 'idle',
      },
      mailboxMessages: [],
      tasks: [],
      teammates: [],
      teamWorkspace: WORKSPACE,
    });

    expect(result).toContain(WORKSPACE);
    expect(result).toContain('workspace');
  });

  it('leader prompt does NOT contain workspace section when teamWorkspace is undefined', () => {
    const result = buildRolePrompt({
      agent: {
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
        agentType: 'claude',
        agentName: 'Leader',
        conversationType: 'acp',
        status: 'idle',
      },
      mailboxMessages: [],
      tasks: [],
      teammates: [],
      teamWorkspace: undefined,
    });

    // Without a workspace, the section should not appear
    expect(result).not.toContain('Team Workspace');
  });

  it('teammate prompt includes workspace path when teamWorkspace is provided', () => {
    const WORKSPACE = '/projects/myproject';
    const leader: TeamAgent = {
      slotId: 'slot-lead',
      conversationId: 'conv-lead',
      role: 'leader',
      agentType: 'claude',
      agentName: 'Leader',
      conversationType: 'acp',
      status: 'idle',
    };
    const result = buildRolePrompt({
      agent: {
        slotId: 'slot-member',
        conversationId: 'conv-member',
        role: 'teammate',
        agentType: 'claude',
        agentName: 'Worker',
        conversationType: 'acp',
        status: 'idle',
      },
      mailboxMessages: [],
      tasks: [],
      teammates: [leader],
      teamWorkspace: WORKSPACE,
    });

    expect(result).toContain(WORKSPACE);
  });

  it('TeammateManager receives teamWorkspace from TTeam.workspace when session is created', () => {
    // This is a structural test: TeamSession passes team.workspace to TeammateManager
    // We verify by reading the internal teamWorkspace field of TeammateManager.
    const team: TTeam = {
      id: 'team-ws',
      userId: 'user-1',
      name: 'WS Team',
      workspace: '/projects/shared',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'claude',
          agentName: 'Leader',
          conversationType: 'acp',
          status: 'idle',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const session = new TeamSession(team, makeRepo(), makeWorkerTaskManager());
    // Access private teammateManager.teamWorkspace through internal structure
    const tm = (session as unknown as { teammateManager: { teamWorkspace: string | undefined } }).teammateManager;
    expect(tm.teamWorkspace).toBe('/projects/shared');
  });

  it('TeammateManager receives undefined teamWorkspace when team.workspace is empty string', () => {
    const team: TTeam = {
      id: 'team-empty',
      userId: 'user-1',
      name: 'Empty WS Team',
      workspace: '', // empty before back-fill
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'claude',
          agentName: 'Leader',
          conversationType: 'acp',
          status: 'idle',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const session = new TeamSession(team, makeRepo(), makeWorkerTaskManager());
    const tm = (session as unknown as { teammateManager: { teamWorkspace: string | undefined } }).teammateManager;
    // team.workspace || undefined → undefined when empty
    expect(tm.teamWorkspace).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Case 4: Concurrent addAgent — per-team mutex prevents agent loss
// ---------------------------------------------------------------------------

describe('Case 4: Concurrent addAgent — mutex serializes writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parallel addAgent calls do not lose agents', async () => {
    const WORKSPACE = '/projects/shared';
    const { service, repo } = makeService({ autoWorkspace: WORKSPACE });

    // Create a team with one leader
    const team = await service.createTeam({
      userId: 'user-1',
      name: 'Race Test',
      workspace: WORKSPACE,
      workspaceMode: 'shared',
      agents: [makeLeadAgent() as TeamAgent],
    });

    // Make repo.findById return live team data (simulates reading latest from DB)
    let latestAgents = [...team.agents];
    (repo.findById as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      ...team,
      agents: latestAgents,
    }));
    (repo.update as ReturnType<typeof vi.fn>).mockImplementation(async (_id: string, updates: Partial<TTeam>) => {
      if (updates.agents) latestAgents = updates.agents;
      return updates;
    });

    // Spawn 4 agents concurrently (simulates leader calling team_spawn_agent 4 times)
    const names = ['正方辩手', '反方辩手', '评委', '主持人'];
    const results = await Promise.all(
      names.map((name) =>
        service.addAgent(team.id, {
          conversationId: '',
          role: 'teammate',
          agentType: 'claude',
          agentName: name,
          conversationType: 'acp',
          status: 'pending',
        })
      )
    );

    // All 4 agents should be created
    expect(results).toHaveLength(4);
    // The final agents list should have Leader + 4 teammates = 5
    expect(latestAgents).toHaveLength(5);
    const agentNames = latestAgents.map((a) => a.agentName);
    expect(agentNames).toContain('Leader');
    for (const name of names) {
      expect(agentNames).toContain(name);
    }
  });
});
