/**
 * Deep integration tests: REAL components wired together with minimal mocking.
 *
 * Only mocked (absolutely cannot instantiate in tests):
 *  - ipcBridge (@/common)         — Electron IPC routes through webContents.send()
 *  - electron                     — Not available in Node test environment
 *  - @process/utils/message       — Calls getDatabase() which needs Electron runtime
 *  - @process/agent/acp/AcpDetector — Filesystem/network agent detection
 *  - IWorkerTaskManager           — The actual LLM API call
 *
 * Everything else is REAL:
 *  - Mailbox              (real in-memory repo)
 *  - TaskManager          (real in-memory repo)
 *  - teamEventBus         (real EventEmitter)
 *  - TeammateManager      (real state machine)
 *  - TeamMcpServer        (real TCP server)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';

// ---------------------------------------------------------------------------
// Hoist mocks BEFORE any source imports
// ---------------------------------------------------------------------------

const mockIpcBridge = vi.hoisted(() => ({
  team: {
    agentSpawned: { emit: vi.fn() },
    agentStatusChanged: { emit: vi.fn() },
    agentRemoved: { emit: vi.fn() },
    agentRenamed: { emit: vi.fn() },
    messageStream: { emit: vi.fn() },
    mcpStatus: { emit: vi.fn() },
  },
  acpConversation: { responseStream: { emit: vi.fn() } },
  conversation: { responseStream: { emit: vi.fn() } },
}));

const mockAddMessage = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({ ipcBridge: mockIpcBridge }));
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: vi.fn(() => '/tmp'), getPath: vi.fn(() => '/tmp') },
}));
vi.mock('@process/utils/message', () => ({ addMessage: mockAddMessage }));
vi.mock('@process/agent/acp/AcpDetector', () => ({
  acpDetector: { getDetectedAgents: vi.fn(() => []) },
}));

// ---------------------------------------------------------------------------
// Real source imports (after mocks)
// ---------------------------------------------------------------------------

import { Mailbox } from '@process/team/Mailbox';
import { TaskManager } from '@process/team/TaskManager';
import { TeammateManager } from '@process/team/TeammateManager';
import { TeamMcpServer } from '@process/team/mcp/team/TeamMcpServer';
import { teamEventBus } from '@process/team/teamEventBus';
import type { ITeamRepository } from '@process/team/repository/ITeamRepository';
import type { TeamAgent, MailboxMessage, TeamTask, TTeam } from '@process/team/types';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

// ---------------------------------------------------------------------------
// Real in-memory ITeamRepository
// ---------------------------------------------------------------------------

function createInMemoryRepo(): ITeamRepository {
  const teams = new Map<string, TTeam>();
  const messages = new Map<string, MailboxMessage>();
  const tasks = new Map<string, TeamTask>();

  return {
    // ── Team CRUD ────────────────────────────────────────────────────────
    async create(team: TTeam) {
      teams.set(team.id, { ...team });
      return teams.get(team.id)!;
    },
    async findById(id: string) {
      return teams.get(id) ?? null;
    },
    async findAll(userId: string) {
      return [...teams.values()].filter((t) => t.userId === userId);
    },
    async update(id: string, updates: Partial<TTeam>) {
      const existing = teams.get(id);
      if (!existing) throw new Error(`Team ${id} not found`);
      const updated = { ...existing, ...updates };
      teams.set(id, updated);
      return updated;
    },
    async delete(id: string) {
      teams.delete(id);
    },
    async deleteMailboxByTeam(teamId: string) {
      for (const [id, msg] of messages) {
        if (msg.teamId === teamId) messages.delete(id);
      }
    },
    async deleteTasksByTeam(teamId: string) {
      for (const [id, task] of tasks) {
        if (task.teamId === teamId) tasks.delete(id);
      }
    },

    // ── Mailbox ──────────────────────────────────────────────────────────
    async writeMessage(message: MailboxMessage) {
      messages.set(message.id, { ...message });
      return messages.get(message.id)!;
    },
    async readUnread(teamId: string, toAgentId: string) {
      return [...messages.values()]
        .filter((m) => m.teamId === teamId && m.toAgentId === toAgentId && !m.read)
        .toSorted((a, b) => a.createdAt - b.createdAt);
    },
    async readUnreadAndMark(teamId: string, toAgentId: string) {
      const unread = [...messages.values()]
        .filter((m) => m.teamId === teamId && m.toAgentId === toAgentId && !m.read)
        .toSorted((a, b) => a.createdAt - b.createdAt);
      for (const msg of unread) {
        messages.set(msg.id, { ...msg, read: true });
      }
      return unread;
    },
    async markRead(messageId: string) {
      const msg = messages.get(messageId);
      if (msg) messages.set(messageId, { ...msg, read: true });
    },
    async getMailboxHistory(teamId: string, toAgentId: string, limit?: number) {
      const all = [...messages.values()]
        .filter((m) => m.teamId === teamId && m.toAgentId === toAgentId)
        .toSorted((a, b) => b.createdAt - a.createdAt);
      return limit != null ? all.slice(0, limit) : all;
    },

    // ── Tasks ────────────────────────────────────────────────────────────
    async createTask(task: TeamTask) {
      tasks.set(task.id, { ...task });
      return tasks.get(task.id)!;
    },
    async findTaskById(id: string) {
      return tasks.get(id) ?? null;
    },
    async updateTask(id: string, updates: Partial<TeamTask>) {
      const existing = tasks.get(id);
      if (!existing) throw new Error(`Task ${id} not found`);
      const updated = { ...existing, ...updates };
      tasks.set(id, updated);
      return updated;
    },
    async findTasksByTeam(teamId: string) {
      return [...tasks.values()].filter((t) => t.teamId === teamId);
    },
    async findTasksByOwner(teamId: string, owner: string) {
      return [...tasks.values()].filter((t) => t.teamId === teamId && t.owner === owner);
    },
    async deleteTask(id: string) {
      tasks.delete(id);
    },
    async appendToBlocks(taskId: string, blockId: string) {
      const task = tasks.get(taskId);
      if (task && !task.blocks.includes(blockId)) {
        tasks.set(taskId, { ...task, blocks: [...task.blocks, blockId], updatedAt: Date.now() });
      }
    },
    async removeFromBlockedBy(taskId: string, unblockedId: string) {
      const task = tasks.get(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const updated = { ...task, blockedBy: task.blockedBy.filter((id) => id !== unblockedId), updatedAt: Date.now() };
      tasks.set(taskId, updated);
      return updated;
    },
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<TeamAgent> = {}): TeamAgent {
  return {
    slotId: 'slot-lead',
    conversationId: 'conv-lead',
    role: 'leader',
    agentType: 'claude',
    agentName: 'Leader',
    conversationType: 'acp',
    status: 'idle',
    ...overrides,
  };
}

function makeWorkerTaskManager(sendMessageFn = vi.fn().mockResolvedValue(undefined)): IWorkerTaskManager {
  return {
    getOrBuildTask: vi.fn().mockResolvedValue({ sendMessage: sendMessageFn }),
    kill: vi.fn(),
  } as unknown as IWorkerTaskManager;
}

// ---------------------------------------------------------------------------
// TCP helper: send a length-prefixed message and read the response
// ---------------------------------------------------------------------------

async function tcpCall(port: number, payload: Record<string, unknown>): Promise<{ result?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
      const json = JSON.stringify(payload);
      const body = Buffer.from(json, 'utf-8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(body.length, 0);
      socket.write(Buffer.concat([header, body]));
    });

    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length >= 4) {
        const bodyLen = buffer.readUInt32BE(0);
        if (buffer.length >= 4 + bodyLen) {
          const jsonStr = buffer.subarray(4, 4 + bodyLen).toString('utf-8');
          try {
            resolve(JSON.parse(jsonStr) as { result?: string; error?: string });
          } catch {
            reject(new Error('Bad JSON response'));
          }
          socket.destroy();
        }
      }
    });

    socket.on('error', reject);
    socket.setTimeout(3000, () => {
      socket.destroy();
      reject(new Error('TCP timeout'));
    });
  });
}

// ===========================================================================
// Test suites
// ===========================================================================

// ---------------------------------------------------------------------------
// Suite 1: Real Mailbox round-trip with in-memory storage
// ---------------------------------------------------------------------------

describe('Real Mailbox — in-memory storage round-trip', () => {
  let repo: ITeamRepository;
  let mailbox: Mailbox;

  beforeEach(() => {
    repo = createInMemoryRepo();
    mailbox = new Mailbox(repo);
  });

  it('writes a message and reads it back as unread', async () => {
    const msg = await mailbox.write({
      teamId: 'team-1',
      toAgentId: 'slot-B',
      fromAgentId: 'slot-A',
      content: 'Hello from A',
    });

    expect(msg.id).toBeTruthy();
    expect(msg.read).toBe(false);

    const unread = await mailbox.readUnread('team-1', 'slot-B');
    expect(unread).toHaveLength(1);
    expect(unread[0].content).toBe('Hello from A');
    expect(unread[0].read).toBe(false); // readUnread returns the messages as they were before marking
  });

  it('marks messages as read after readUnread', async () => {
    await mailbox.write({ teamId: 't', toAgentId: 'B', fromAgentId: 'A', content: 'msg1' });

    const first = await mailbox.readUnread('t', 'B');
    expect(first).toHaveLength(1);

    // Second read should return empty — messages were marked read
    const second = await mailbox.readUnread('t', 'B');
    expect(second).toHaveLength(0);
  });

  it('preserves message ordering by createdAt (FIFO)', async () => {
    // Write 3 messages with explicit timestamps to test ordering
    const base = Date.now();
    await repo.writeMessage({
      id: crypto.randomUUID(),
      teamId: 't',
      toAgentId: 'B',
      fromAgentId: 'A',
      type: 'message',
      content: 'first',
      read: false,
      createdAt: base,
    });
    await repo.writeMessage({
      id: crypto.randomUUID(),
      teamId: 't',
      toAgentId: 'B',
      fromAgentId: 'A',
      type: 'message',
      content: 'second',
      read: false,
      createdAt: base + 1,
    });
    await repo.writeMessage({
      id: crypto.randomUUID(),
      teamId: 't',
      toAgentId: 'B',
      fromAgentId: 'A',
      type: 'message',
      content: 'third',
      read: false,
      createdAt: base + 2,
    });

    const unread = await mailbox.readUnread('t', 'B');
    expect(unread.map((m) => m.content)).toEqual(['first', 'second', 'third']);
  });

  it('isolates messages between agents: Agent A does not read Agent B messages', async () => {
    await mailbox.write({ teamId: 't', toAgentId: 'A', fromAgentId: 'X', content: 'for A' });
    await mailbox.write({ teamId: 't', toAgentId: 'B', fromAgentId: 'X', content: 'for B' });

    const aMessages = await mailbox.readUnread('t', 'A');
    const bMessages = await mailbox.readUnread('t', 'B');

    expect(aMessages).toHaveLength(1);
    expect(aMessages[0].content).toBe('for A');
    expect(bMessages).toHaveLength(1);
    expect(bMessages[0].content).toBe('for B');
  });

  it('isolates messages between teams', async () => {
    await mailbox.write({ teamId: 'team-1', toAgentId: 'A', fromAgentId: 'X', content: 'team1' });
    await mailbox.write({ teamId: 'team-2', toAgentId: 'A', fromAgentId: 'X', content: 'team2' });

    const team1 = await mailbox.readUnread('team-1', 'A');
    const team2 = await mailbox.readUnread('team-2', 'A');

    expect(team1).toHaveLength(1);
    expect(team1[0].content).toBe('team1');
    expect(team2).toHaveLength(1);
    expect(team2[0].content).toBe('team2');
  });

  it('supports idle_notification type messages', async () => {
    const msg = await mailbox.write({
      teamId: 't',
      toAgentId: 'leader',
      fromAgentId: 'member',
      content: 'Task done',
      type: 'idle_notification',
    });

    expect(msg.type).toBe('idle_notification');
    const unread = await mailbox.readUnread('t', 'leader');
    expect(unread[0].type).toBe('idle_notification');
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Real TaskManager — dependency graph with in-memory storage
// ---------------------------------------------------------------------------

describe('Real TaskManager — dependency graph resolution', () => {
  let repo: ITeamRepository;
  let taskManager: TaskManager;

  beforeEach(() => {
    repo = createInMemoryRepo();
    taskManager = new TaskManager(repo);
  });

  it('creates a task with default pending status', async () => {
    const task = await taskManager.create({ teamId: 't', subject: 'Build feature' });
    expect(task.status).toBe('pending');
    expect(task.blockedBy).toEqual([]);
    expect(task.blocks).toEqual([]);
    expect(task.id).toBeTruthy();
  });

  it('bidirectional links: creating B with blockedBy A updates A.blocks', async () => {
    const taskA = await taskManager.create({ teamId: 't', subject: 'Task A' });
    const taskB = await taskManager.create({ teamId: 't', subject: 'Task B', blockedBy: [taskA.id] });

    expect(taskB.blockedBy).toContain(taskA.id);

    // Verify A.blocks was updated with B's id
    const updatedA = await repo.findTaskById(taskA.id);
    expect(updatedA?.blocks).toContain(taskB.id);
  });

  it('checkUnblocks removes taskId from dependents blockedBy array', async () => {
    const taskA = await taskManager.create({ teamId: 't', subject: 'Task A' });
    const taskB = await taskManager.create({ teamId: 't', subject: 'Task B', blockedBy: [taskA.id] });
    const taskC = await taskManager.create({ teamId: 't', subject: 'Task C', blockedBy: [taskA.id] });

    // Complete task A
    await taskManager.update(taskA.id, { status: 'completed' });
    const unblocked = await taskManager.checkUnblocks(taskA.id);

    // B and C should both be unblocked
    expect(unblocked).toHaveLength(2);
    const unblockedIds = unblocked.map((t) => t.id).toSorted();
    expect(unblockedIds).toContain(taskB.id);
    expect(unblockedIds).toContain(taskC.id);

    // Verify their blockedBy arrays are now empty
    const finalB = await repo.findTaskById(taskB.id);
    const finalC = await repo.findTaskById(taskC.id);
    expect(finalB?.blockedBy).toEqual([]);
    expect(finalC?.blockedBy).toEqual([]);
  });

  it('checkUnblocks returns empty for tasks with no dependents', async () => {
    const task = await taskManager.create({ teamId: 't', subject: 'Standalone task' });
    await taskManager.update(task.id, { status: 'completed' });

    const unblocked = await taskManager.checkUnblocks(task.id);
    expect(unblocked).toHaveLength(0);
  });

  it('checkUnblocks returns only fully unblocked tasks (not partially blocked)', async () => {
    const taskA = await taskManager.create({ teamId: 't', subject: 'A' });
    const taskB = await taskManager.create({ teamId: 't', subject: 'B' });
    // Task C depends on BOTH A and B
    const taskC = await taskManager.create({ teamId: 't', subject: 'C', blockedBy: [taskA.id, taskB.id] });

    await taskManager.update(taskA.id, { status: 'completed' });
    const partialUnblock = await taskManager.checkUnblocks(taskA.id);

    // C still depends on B, so should NOT be returned as fully unblocked
    expect(partialUnblock.map((t) => t.id)).not.toContain(taskC.id);

    // Verify C still has B in its blockedBy
    const finalC = await repo.findTaskById(taskC.id);
    expect(finalC?.blockedBy).toContain(taskB.id);
    expect(finalC?.blockedBy).not.toContain(taskA.id);
  });

  it('FIXED: checkUnblocks now clears blocks array on the completed task', async () => {
    const taskA = await taskManager.create({ teamId: 't', subject: 'A' });
    const taskB = await taskManager.create({ teamId: 't', subject: 'B', blockedBy: [taskA.id] });

    await taskManager.update(taskA.id, { status: 'completed' });
    await taskManager.checkUnblocks(taskA.id);

    const cleanedA = await repo.findTaskById(taskA.id);
    // FIXED: A.blocks is now cleared after checkUnblocks
    expect(cleanedA?.blocks).toEqual([]);
    // B.blockedBy is correctly empty
    const updatedB = await repo.findTaskById(taskB.id);
    expect(updatedB?.blockedBy).toEqual([]);
  });

  it('list returns all tasks for a team', async () => {
    await taskManager.create({ teamId: 't', subject: 'Alpha' });
    await taskManager.create({ teamId: 't', subject: 'Beta' });
    await taskManager.create({ teamId: 'other', subject: 'Gamma' });

    const tasks = await taskManager.list('t');
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.subject).toSorted()).toEqual(['Alpha', 'Beta']);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Real TeammateManager + real Mailbox + real TaskManager
// ---------------------------------------------------------------------------

describe('Real TeammateManager with real Mailbox + TaskManager', () => {
  let repo: ITeamRepository;
  let mailbox: Mailbox;
  let taskManager: TaskManager;
  let workerTM: IWorkerTaskManager;
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let mgr: TeammateManager;

  const leadAgent = makeAgent({
    slotId: 'slot-lead',
    conversationId: 'conv-lead',
    role: 'leader',
    agentName: 'Leader',
  });
  const memberAgent = makeAgent({
    slotId: 'slot-member',
    conversationId: 'conv-member',
    role: 'teammate',
    agentName: 'Worker',
    status: 'idle',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createInMemoryRepo();
    mailbox = new Mailbox(repo);
    taskManager = new TaskManager(repo);
    mockSendMessage = vi.fn().mockResolvedValue(undefined);
    workerTM = makeWorkerTaskManager(mockSendMessage);
    mgr = new TeammateManager({
      teamId: 'team-1',
      agents: [leadAgent, memberAgent],
      mailbox,
      taskManager,
      workerTaskManager: workerTM,
    });
  });

  afterEach(() => {
    mgr.dispose();
  });

  it('member finishing turn auto-sends idle_notification to real leader Mailbox', async () => {
    teamEventBus.emit('responseStream', {
      type: 'finish',
      conversation_id: 'conv-member',
      msg_id: 'msg-1',
      data: null,
    });

    await new Promise((r) => setTimeout(r, 80));

    // Idle notification should be in leader's real Mailbox
    const leaderMessages = await mailbox.getHistory('team-1', 'slot-lead');
    expect(leaderMessages.some((m) => m.type === 'idle_notification' && m.fromAgentId === 'slot-member')).toBe(true);
  });

  it('state transition: wake() changes agent status pending→idle→active via real events', async () => {
    const pendingMember = makeAgent({
      slotId: 'slot-pending',
      conversationId: 'conv-pending',
      role: 'teammate',
      agentName: 'Pending Worker',
      status: 'pending',
    });

    const repo2 = createInMemoryRepo();
    const mailbox2 = new Mailbox(repo2);
    const taskManager2 = new TaskManager(repo2);
    const sendMsg2 = vi.fn().mockResolvedValue(undefined);
    const workerTM2 = makeWorkerTaskManager(sendMsg2);
    const mgr2 = new TeammateManager({
      teamId: 'team-2',
      agents: [pendingMember],
      mailbox: mailbox2,
      taskManager: taskManager2,
      workerTaskManager: workerTM2,
    });

    const statusHistory: string[] = [];
    mgr2.on('agentStatusChanged', ({ status }: { status: string }) => statusHistory.push(status));

    await mgr2.wake('slot-pending');

    expect(statusHistory).toContain('idle');
    expect(statusHistory).toContain('active');
    // active was set and then (after turn) released
    mgr2.dispose();
  });

  it('dedup: rapid finish events only trigger finalizeTurn once', async () => {
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

    await new Promise((r) => setTimeout(r, 80));

    // Only one idle_notification should be written to leader's Mailbox
    const leaderMsgs = await mailbox.getHistory('team-1', 'slot-lead');
    const idleNotifs = leaderMsgs.filter((m) => m.type === 'idle_notification' && m.fromAgentId === 'slot-member');
    expect(idleNotifs).toHaveLength(1);
  });

  it('maybeWakeLeaderWhenAllIdle: leader woken only when ALL members settled', async () => {
    const member2 = makeAgent({
      slotId: 'slot-member2',
      conversationId: 'conv-member2',
      role: 'teammate',
      agentName: 'Worker2',
      status: 'active',
    });

    const repo2 = createInMemoryRepo();
    const mailbox2 = new Mailbox(repo2);
    const taskManager2 = new TaskManager(repo2);
    const sendMsg2 = vi.fn().mockResolvedValue(undefined);
    const workerTM2 = makeWorkerTaskManager(sendMsg2);
    const mgr2 = new TeammateManager({
      teamId: 'team-2',
      agents: [
        makeAgent({
          slotId: 'lead2',
          conversationId: 'conv-lead2',
          role: 'leader',
          agentName: 'Lead2',
          status: 'idle',
        }),
        makeAgent({
          slotId: 'slot-m1',
          conversationId: 'conv-m1',
          role: 'teammate',
          agentName: 'M1',
          status: 'active',
        }),
        member2,
      ],
      mailbox: mailbox2,
      taskManager: taskManager2,
      workerTaskManager: workerTM2,
    });

    // Only member1 finishes — member2 is still active
    teamEventBus.emit('responseStream', {
      type: 'finish',
      conversation_id: 'conv-m1',
      msg_id: 'm1',
      data: null,
    });

    await new Promise((r) => setTimeout(r, 80));

    // Leader should NOT have been woken yet
    expect(vi.mocked(workerTM2.getOrBuildTask)).not.toHaveBeenCalledWith('conv-lead2');
    mgr2.dispose();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Real TeamMcpServer with real TCP transport
// ---------------------------------------------------------------------------

describe('Real TeamMcpServer — TCP transport with real stores', () => {
  let repo: ITeamRepository;
  let mailbox: Mailbox;
  let taskManager: TaskManager;
  let mcpServer: TeamMcpServer;
  let authToken: string;
  let port: number;
  let agents: TeamAgent[];
  let mockWakeAgent: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    repo = createInMemoryRepo();
    mailbox = new Mailbox(repo);
    taskManager = new TaskManager(repo);
    mockWakeAgent = vi.fn().mockResolvedValue(undefined);

    agents = [
      makeAgent({ slotId: 'slot-lead', agentName: 'Leader', role: 'leader', conversationType: 'acp', status: 'idle' }),
      makeAgent({
        slotId: 'slot-worker',
        agentName: 'Worker',
        role: 'teammate',
        conversationType: 'acp',
        status: 'idle',
        conversationId: 'conv-worker',
      }),
    ];

    mcpServer = new TeamMcpServer({
      teamId: 'team-1',
      getAgents: () => agents,
      mailbox,
      taskManager,
      wakeAgent: mockWakeAgent,
    });

    const stdioConfig = await mcpServer.start();
    port = mcpServer.getPort();

    // Extract the auth token from the stdio config env
    const tokenEnv = stdioConfig.env.find((e) => e.name === 'TEAM_MCP_TOKEN');
    authToken = tokenEnv!.value;
  });

  afterEach(async () => {
    await mcpServer.stop();
  });

  it('starts on a dynamic port and accepts TCP connections', () => {
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it('rejects requests with wrong auth token', async () => {
    const response = await tcpCall(port, {
      tool: 'team_members',
      args: {},
      auth_token: 'wrong-token',
    });
    expect(response.error).toBe('Unauthorized');
  });

  it('team_members returns all agents', async () => {
    const response = await tcpCall(port, {
      tool: 'team_members',
      args: {},
      auth_token: authToken,
    });
    expect(response.result).toContain('Leader');
    expect(response.result).toContain('Worker');
  });

  it('team_send_message writes to real Mailbox and wakes target', async () => {
    const response = await tcpCall(port, {
      tool: 'team_send_message',
      args: { to: 'Worker', message: 'Please run the build' },
      from_slot_id: 'slot-lead',
      auth_token: authToken,
    });

    expect(response.result).toContain('Message sent to Worker');

    // Verify message is in Worker's real Mailbox
    const messages = await mailbox.readUnread('team-1', 'slot-worker');
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Please run the build');
    expect(messages[0].fromAgentId).toBe('slot-lead');

    // Verify wakeAgent was called for the target
    expect(mockWakeAgent).toHaveBeenCalledWith('slot-worker');
  });

  it('team_send_message to unknown agent returns error', async () => {
    const response = await tcpCall(port, {
      tool: 'team_send_message',
      args: { to: 'NonExistent', message: 'Hello' },
      from_slot_id: 'slot-lead',
      auth_token: authToken,
    });
    expect(response.error).toContain('NonExistent');
    expect(response.error).toContain('not found');
  });

  it('team_task_create creates task in real TaskManager', async () => {
    const response = await tcpCall(port, {
      tool: 'team_task_create',
      args: { subject: 'Write unit tests', description: 'Cover all edge cases', owner: 'slot-worker' },
      auth_token: authToken,
    });

    expect(response.result).toContain('Task created');
    expect(response.result).toContain('Write unit tests');

    const tasks = await taskManager.list('team-1');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].subject).toBe('Write unit tests');
    expect(tasks[0].owner).toBe('slot-worker');
  });

  it('team_task_list returns real tasks from TaskManager', async () => {
    await taskManager.create({ teamId: 'team-1', subject: 'Task Alpha', owner: 'slot-worker' });
    await taskManager.create({ teamId: 'team-1', subject: 'Task Beta' });

    const response = await tcpCall(port, {
      tool: 'team_task_list',
      args: {},
      auth_token: authToken,
    });

    expect(response.result).toContain('Task Alpha');
    expect(response.result).toContain('Task Beta');
  });

  it('team_task_update changes task status in real store', async () => {
    const task = await taskManager.create({ teamId: 'team-1', subject: 'Deploy' });

    const response = await tcpCall(port, {
      tool: 'team_task_update',
      args: { task_id: task.id, status: 'in_progress' },
      auth_token: authToken,
    });

    expect(response.result).toContain('updated');

    const updated = await repo.findTaskById(task.id);
    expect(updated?.status).toBe('in_progress');
  });

  it('team_task_update with invalid status returns error', async () => {
    const task = await taskManager.create({ teamId: 'team-1', subject: 'Deploy' });

    const response = await tcpCall(port, {
      tool: 'team_task_update',
      args: { task_id: task.id, status: 'flying' },
      auth_token: authToken,
    });

    expect(response.error).toContain('Invalid task status');
    expect(response.error).toContain('flying');
  });

  it('team_spawn_agent rejects non-leader callers', async () => {
    const response = await tcpCall(port, {
      tool: 'team_spawn_agent',
      args: { name: 'NewAgent', agent_type: 'claude' },
      from_slot_id: 'slot-worker', // worker, not leader
      auth_token: authToken,
    });

    expect(response.error).toContain('Only the team leader can spawn');
  });

  it('team_rename_agent renames agent in real agents list', async () => {
    let renamedSlotId = '';
    let renamedName = '';

    // Rebuild server with renameAgent callback
    await mcpServer.stop();
    const repo2 = createInMemoryRepo();
    const mailbox2 = new Mailbox(repo2);
    const taskManager2 = new TaskManager(repo2);
    const agentsCopy = [...agents];

    const server2 = new TeamMcpServer({
      teamId: 'team-1',
      getAgents: () => agentsCopy,
      mailbox: mailbox2,
      taskManager: taskManager2,
      wakeAgent: vi.fn().mockResolvedValue(undefined),
      renameAgent: (slotId: string, newName: string) => {
        renamedSlotId = slotId;
        renamedName = newName;
        const agent = agentsCopy.find((a) => a.slotId === slotId);
        if (agent) agent.agentName = newName;
      },
    });

    await server2.start();
    const port2 = server2.getPort();
    const stdioConfig2 = server2.getStdioConfig();
    const token2 = stdioConfig2.env.find((e) => e.name === 'TEAM_MCP_TOKEN')!.value;

    const response = await tcpCall(port2, {
      tool: 'team_rename_agent',
      args: { agent: 'Worker', new_name: 'Expert' },
      auth_token: token2,
    });

    expect(response.result).toContain('renamed');
    expect(renamedSlotId).toBe('slot-worker');
    expect(renamedName).toBe('Expert');

    await server2.stop();
  });

  it('team_shutdown_agent sends shutdown request to real Mailbox', async () => {
    const response = await tcpCall(port, {
      tool: 'team_shutdown_agent',
      args: { agent: 'Worker' },
      from_slot_id: 'slot-lead',
      auth_token: authToken,
    });

    expect(response.result).toContain('Shutdown request sent');

    // Verify real Mailbox received the shutdown request
    const messages = await mailbox.readUnread('team-1', 'slot-worker');
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('shutdown_request');
    expect(messages[0].content).toContain('shut down');
  });

  it('team_shutdown_agent refuses to shut down team leader', async () => {
    const response = await tcpCall(port, {
      tool: 'team_shutdown_agent',
      args: { agent: 'Leader' },
      auth_token: authToken,
    });
    expect(response.error).toContain('Cannot shut down the team leader');
  });

  it('unknown tool returns error', async () => {
    const response = await tcpCall(port, {
      tool: 'team_fly_to_moon',
      args: {},
      auth_token: authToken,
    });
    expect(response.error).toContain('Unknown tool');
  });

  it('team_send_message broadcast (*) reaches all agents except sender', async () => {
    const response = await tcpCall(port, {
      tool: 'team_send_message',
      args: { to: '*', message: 'All hands on deck!' },
      from_slot_id: 'slot-lead',
      auth_token: authToken,
    });

    expect(response.result).toContain('broadcast');

    // Worker should receive the broadcast
    const workerMessages = await mailbox.readUnread('team-1', 'slot-worker');
    expect(workerMessages).toHaveLength(1);
    expect(workerMessages[0].content).toBe('All hands on deck!');

    // Lead should NOT receive their own broadcast
    const leaderMessages = await mailbox.readUnread('team-1', 'slot-lead');
    const ownBroadcast = leaderMessages.filter((m) => m.content === 'All hands on deck!');
    expect(ownBroadcast).toHaveLength(0);
  });

  it('team_task_update with completed status triggers checkUnblocks', async () => {
    const taskA = await taskManager.create({ teamId: 'team-1', subject: 'A' });
    const taskB = await taskManager.create({ teamId: 'team-1', subject: 'B', blockedBy: [taskA.id] });

    await tcpCall(port, {
      tool: 'team_task_update',
      args: { task_id: taskA.id, status: 'completed' },
      auth_token: authToken,
    });

    // B should now be unblocked
    const updatedB = await repo.findTaskById(taskB.id);
    expect(updatedB?.blockedBy).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Cross-component event flow
// ---------------------------------------------------------------------------

describe('Cross-component event flow: teamEventBus → TeammateManager → real stores', () => {
  let repo: ITeamRepository;
  let mailbox: Mailbox;
  let taskManager: TaskManager;
  let workerTM: IWorkerTaskManager;
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let mgr: TeammateManager;

  const leader = makeAgent({
    slotId: 'leader',
    conversationId: 'conv-lead',
    role: 'leader',
    agentName: 'Leader',
    status: 'idle',
  });
  const m1 = makeAgent({
    slotId: 'm1',
    conversationId: 'conv-m1',
    role: 'teammate',
    agentName: 'M1',
    status: 'active',
  });
  const m2 = makeAgent({
    slotId: 'm2',
    conversationId: 'conv-m2',
    role: 'teammate',
    agentName: 'M2',
    status: 'active',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createInMemoryRepo();
    mailbox = new Mailbox(repo);
    taskManager = new TaskManager(repo);
    mockSendMessage = vi.fn().mockResolvedValue(undefined);
    workerTM = makeWorkerTaskManager(mockSendMessage);
    mgr = new TeammateManager({
      teamId: 'team-1',
      agents: [leader, m1, m2],
      mailbox,
      taskManager,
      workerTaskManager: workerTM,
    });
  });

  afterEach(() => {
    mgr.dispose();
  });

  it('full chain: m1 finish → idle_notification in leader Mailbox → leader woken when m2 also done', async () => {
    // m1 finishes first — m2 still active
    teamEventBus.emit('responseStream', {
      type: 'finish',
      conversation_id: 'conv-m1',
      msg_id: 'e1',
      data: null,
    });

    await new Promise((r) => setTimeout(r, 80));

    // Leader NOT woken yet (m2 still active)
    expect(vi.mocked(workerTM.getOrBuildTask)).not.toHaveBeenCalledWith('conv-lead');

    // m1's idle_notification is in lead's mailbox
    const afterM1 = await mailbox.getHistory('team-1', 'leader');
    expect(afterM1.some((m) => m.type === 'idle_notification' && m.fromAgentId === 'm1')).toBe(true);

    // Now m2 finishes
    teamEventBus.emit('responseStream', {
      type: 'finish',
      conversation_id: 'conv-m2',
      msg_id: 'e2',
      data: null,
    });

    await new Promise((r) => setTimeout(r, 100));

    // Now lead should be woken
    expect(vi.mocked(workerTM.getOrBuildTask)).toHaveBeenCalledWith('conv-lead');

    // Both idle_notifications in lead's mailbox
    const finalMsgs = await mailbox.getHistory('team-1', 'leader');
    const idleNotifs = finalMsgs.filter((m) => m.type === 'idle_notification');
    expect(idleNotifs.length).toBeGreaterThanOrEqual(2);
  });

  it('teamEventBus isolates events: unowned conversationId does not affect manager', async () => {
    const preAgents = mgr.getAgents().map((a) => ({ slotId: a.slotId, status: a.status }));

    teamEventBus.emit('responseStream', {
      type: 'finish',
      conversation_id: 'conv-foreign-team',
      msg_id: 'x1',
      data: null,
    });

    await new Promise((r) => setTimeout(r, 50));

    const postAgents = mgr.getAgents().map((a) => ({ slotId: a.slotId, status: a.status }));
    expect(postAgents).toEqual(preAgents);

    // No messages written to any agent in this team
    const msgs = await mailbox.getHistory('team-1', 'leader');
    expect(msgs).toHaveLength(0);
  });

  it('dispose cleans up teamEventBus listeners — no more reactions after dispose', async () => {
    mgr.dispose();

    // Emit a finish event for a team-owned conversation after dispose
    teamEventBus.emit('responseStream', {
      type: 'finish',
      conversation_id: 'conv-m1',
      msg_id: 'e1',
      data: null,
    });

    await new Promise((r) => setTimeout(r, 80));

    // No idle_notification should have been written (listener was removed)
    const leaderMsgs = await mailbox.getHistory('team-1', 'leader');
    const idleNotifs = leaderMsgs.filter((m) => m.type === 'idle_notification');
    expect(idleNotifs).toHaveLength(0);
  });
});
