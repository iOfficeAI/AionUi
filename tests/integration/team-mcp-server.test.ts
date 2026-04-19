/**
 * Black-box integration tests for TeamMcpServer.
 *
 * Tests every MCP tool by communicating with the server through its TCP
 * transport layer — the only public interface agents use. This proves the
 * contract: correct inputs → expected output strings / errors.
 *
 * Dependency note: we import TeamMcpServer only to instantiate the server
 * under test. All MCP tool behavior is exercised exclusively through TCP.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as net from 'node:net';

// Mock ProcessConfig for dynamic team capability checks
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        const makeEntry = () => ({
          protocolVersion: 1,
          capabilities: {
            loadSession: false,
            promptCapabilities: { image: false, audio: false, embeddedContext: false },
            mcpCapabilities: { stdio: true, http: false, sse: false },
            sessionCapabilities: { fork: null, resume: null, list: null, close: null },
            _meta: {},
          },
          agentInfo: null,
          authMethods: [],
        });
        return { claude: makeEntry(), codex: makeEntry() };
      }
      return null;
    }),
  },
}));

// Mock acpDetector for getTeamCapableBackends error message
vi.mock('@process/agent/acp/AcpDetector', () => ({
  acpDetector: {
    getDetectedAgents: vi.fn(() => [
      { backend: 'claude', name: 'Claude' },
      { backend: 'codex', name: 'Codex' },
    ]),
  },
}));

import { TeamMcpServer } from '../../src/process/team/mcp/team/TeamMcpServer';
import type { TeamAgent } from '@/common/types/teamTypes';
import type { Mailbox } from '../../src/process/team/Mailbox';
import type { TaskManager } from '../../src/process/team/TaskManager';

// ── TCP helpers ─────────────────────────────────────────────────────────────

function writeTcp(socket: net.Socket, data: unknown): void {
  const body = Buffer.from(JSON.stringify(data), 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  socket.write(Buffer.concat([header, body]));
}

function readTcpResponse(socket: net.Socket, timeoutMs = 3000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => reject(new Error('TCP response timeout')), timeoutMs);

    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const bodyLen = buf.readUInt32BE(0);
        if (buf.length < 4 + bodyLen) break;
        const json = buf.subarray(4, 4 + bodyLen).toString('utf-8');
        buf = buf.subarray(4 + bodyLen);
        clearTimeout(timer);
        try {
          resolve(JSON.parse(json));
        } catch {
          reject(new Error(`Bad JSON: ${json}`));
        }
        break;
      }
    });

    socket.on('error', reject);
  });
}

async function callTool(
  port: number,
  authToken: string,
  tool: string,
  args: Record<string, unknown> = {},
  fromSlotId?: string
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
      readTcpResponse(socket)
        .then(resolve)
        .catch(reject)
        .finally(() => socket.destroy());

      writeTcp(socket, {
        tool,
        args,
        auth_token: authToken,
        ...(fromSlotId ? { from_slot_id: fromSlotId } : {}),
      });
    });
    socket.on('error', reject);
  });
}

// ── Mock builder helpers ────────────────────────────────────────────────────

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

type MockMailbox = {
  write: ReturnType<typeof vi.fn>;
};

type MockTaskManager = {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  checkUnblocks: ReturnType<typeof vi.fn>;
};

function makeMockMailbox(): MockMailbox {
  return {
    write: vi.fn().mockResolvedValue({ id: 'msg-001' }),
  };
}

function makeMockTaskManager(): MockTaskManager {
  return {
    create: vi.fn().mockResolvedValue({ id: 'task-uuid-001', subject: 'Test task' }),
    update: vi.fn().mockResolvedValue({ id: 'task-uuid-001', status: 'in_progress' }),
    list: vi.fn().mockResolvedValue([]),
    checkUnblocks: vi.fn().mockResolvedValue([]),
  };
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('TeamMcpServer — TCP tool interface', () => {
  let server: TeamMcpServer;
  let authToken: string;
  let port: number;
  let agents: TeamAgent[];
  let mailbox: MockMailbox;
  let taskManager: MockTaskManager;

  beforeEach(async () => {
    agents = [
      makeAgent({ slotId: 'slot-lead', agentName: 'Leader', role: 'leader' }),
      makeAgent({ slotId: 'slot-worker', agentName: 'Worker', role: 'teammate', status: 'idle' }),
    ];
    mailbox = makeMockMailbox();
    taskManager = makeMockTaskManager();

    server = new TeamMcpServer({
      teamId: 'team-test',
      getAgents: () => agents,
      mailbox: mailbox as unknown as Mailbox,
      taskManager: taskManager as unknown as TaskManager,
      spawnAgent: vi.fn().mockResolvedValue(makeAgent({ slotId: 'slot-new', agentName: 'NewAgent' })),
      renameAgent: vi.fn(),
      removeAgent: vi.fn(),
      wakeAgent: vi.fn().mockResolvedValue(undefined),
    });

    await server.start();
    port = server.getPort();

    // Extract the auth token from the stdio config (it's the TEAM_MCP_TOKEN env var)
    const config = server.getStdioConfig();
    const tokenEntry = config.env.find((e) => e.name === 'TEAM_MCP_TOKEN');
    authToken = tokenEntry!.value;
  });

  afterEach(async () => {
    await server.stop();
  });

  // ── Authentication ────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('rejects requests with wrong auth token', async () => {
      const response = (await callTool(port, 'wrong-token', 'team_members')) as { error: string };
      expect(response.error).toBe('Unauthorized');
    });

    it('rejects requests with empty auth token', async () => {
      const response = (await callTool(port, '', 'team_members')) as { error: string };
      expect(response.error).toBe('Unauthorized');
    });
  });

  // ── team_members ──────────────────────────────────────────────────────────

  describe('team_members', () => {
    it('returns formatted team member list', async () => {
      const resp = (await callTool(port, authToken, 'team_members')) as { result: string };
      expect(resp.result).toContain('## Team Members');
      expect(resp.result).toContain('Leader');
      expect(resp.result).toContain('leader');
      expect(resp.result).toContain('Worker');
      expect(resp.result).toContain('teammate');
    });

    it('returns no-members message when team is empty', async () => {
      agents.length = 0;
      const resp = (await callTool(port, authToken, 'team_members')) as { result: string };
      expect(resp.result).toBe('No team members yet.');
    });
  });

  // ── team_send_message ─────────────────────────────────────────────────────

  describe('team_send_message', () => {
    it('sends message to named agent', async () => {
      const resp = (await callTool(port, authToken, 'team_send_message', {
        to: 'Worker',
        message: 'Please start task A',
      })) as { result: string };

      expect(resp.result).toContain('Worker');
      expect(mailbox.write).toHaveBeenCalledWith(
        expect.objectContaining({
          toAgentId: 'slot-worker',
          content: 'Please start task A',
        })
      );
    });

    it('sends message to agent by slotId', async () => {
      const resp = (await callTool(port, authToken, 'team_send_message', {
        to: 'slot-worker',
        message: 'Direct slot message',
      })) as { result: string };

      expect(resp.result).toContain('inbox');
      expect(mailbox.write).toHaveBeenCalled();
    });

    it('broadcasts to all agents when to="*" (lead as sender)', async () => {
      const resp = (await callTool(
        port,
        authToken,
        'team_send_message',
        {
          to: '*',
          message: 'Team broadcast',
        },
        'slot-lead'
      )) as { result: string };

      expect(resp.result).toContain('broadcast');
      // Lead excluded from recipients; worker should receive
      expect(mailbox.write).toHaveBeenCalledWith(expect.objectContaining({ toAgentId: 'slot-worker' }));
      expect(mailbox.write).not.toHaveBeenCalledWith(expect.objectContaining({ toAgentId: 'slot-lead' }));
    });

    it('broadcasts to all agents when to="*" (non-lead as sender)', async () => {
      const resp = (await callTool(
        port,
        authToken,
        'team_send_message',
        {
          to: '*',
          message: 'Worker broadcast',
        },
        'slot-worker'
      )) as { result: string };

      expect(resp.result).toContain('broadcast');
      // Worker excluded from recipients; lead should receive
      expect(mailbox.write).toHaveBeenCalledWith(
        expect.objectContaining({ toAgentId: 'slot-lead', content: 'Worker broadcast' })
      );
      expect(mailbox.write).not.toHaveBeenCalledWith(expect.objectContaining({ toAgentId: 'slot-worker' }));
    });

    it('returns error when target agent not found', async () => {
      const resp = (await callTool(port, authToken, 'team_send_message', {
        to: 'NonExistent',
        message: 'hi',
      })) as { error: string };

      expect(resp.error).toContain('not found');
      expect(resp.error).toContain('NonExistent');
    });

    it('includes available agents in the error message', async () => {
      const resp = (await callTool(port, authToken, 'team_send_message', {
        to: 'Ghost',
        message: 'hello',
      })) as { error: string };

      expect(resp.error).toContain('Leader');
      expect(resp.error).toContain('Worker');
    });

    it('supports optional summary parameter', async () => {
      const resp = (await callTool(port, authToken, 'team_send_message', {
        to: 'Worker',
        message: 'Update complete',
        summary: 'Work done',
      })) as { result: string };

      expect(resp.result).toBeTruthy();
      expect(mailbox.write).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Work done' }));
    });

    it('intercepts shutdown_approved and removes agent', async () => {
      const removeAgent = vi.fn();
      const serverWithRemove = new TeamMcpServer({
        teamId: 'team-remove',
        getAgents: () => [
          makeAgent({ slotId: 'slot-lead', agentName: 'Leader', role: 'leader' }),
          makeAgent({ slotId: 'slot-worker', agentName: 'Worker', role: 'teammate' }),
        ],
        mailbox: mailbox as unknown as Mailbox,
        taskManager: taskManager as unknown as TaskManager,
        removeAgent,
        wakeAgent: vi.fn().mockResolvedValue(undefined),
      });
      await serverWithRemove.start();
      const removePort = serverWithRemove.getPort();
      const removeConfig = serverWithRemove.getStdioConfig();
      const removeToken = removeConfig.env.find((e) => e.name === 'TEAM_MCP_TOKEN')!.value;

      try {
        const resp = (await callTool(
          removePort,
          removeToken,
          'team_send_message',
          {
            to: 'slot-lead',
            message: 'shutdown_approved',
          },
          'slot-worker'
        )) as { result: string };

        expect(resp.result).toContain('removed');
        expect(removeAgent).toHaveBeenCalledWith('slot-worker');
      } finally {
        await serverWithRemove.stop();
      }
    });

    it('intercepts shutdown_rejected and forwards reason to lead without removing agent', async () => {
      const removeAgent = vi.fn();
      const localAgents = [
        makeAgent({ slotId: 'slot-lead', agentName: 'Leader', role: 'leader' }),
        makeAgent({ slotId: 'slot-worker', agentName: 'Worker', role: 'teammate' }),
      ];
      const localMailbox = makeMockMailbox();
      const serverReject = new TeamMcpServer({
        teamId: 'team-reject',
        getAgents: () => localAgents,
        mailbox: localMailbox as unknown as Mailbox,
        taskManager: taskManager as unknown as TaskManager,
        removeAgent,
        wakeAgent: vi.fn().mockResolvedValue(undefined),
      });
      await serverReject.start();
      const rejectPort = serverReject.getPort();
      const rejectConfig = serverReject.getStdioConfig();
      const rejectToken = rejectConfig.env.find((e) => e.name === 'TEAM_MCP_TOKEN')!.value;

      try {
        // Variant 1: with colon separator  (shutdown_rejected: reason)
        const resp = (await callTool(
          rejectPort,
          rejectToken,
          'team_send_message',
          { to: 'slot-lead', message: 'shutdown_rejected: I am still needed' },
          'slot-worker'
        )) as { result: string };

        expect(resp.result).toContain('Refusal');
        // removeAgent must NOT be called
        expect(removeAgent).not.toHaveBeenCalled();
        // Lead's mailbox receives the reason extracted by the regex
        expect(localMailbox.write).toHaveBeenCalledWith(
          expect.objectContaining({
            toAgentId: 'slot-lead',
            content: expect.stringContaining('I am still needed'),
          })
        );

        localMailbox.write.mockClear();

        // Variant 2: without colon separator (shutdown_rejected reason)
        const resp2 = (await callTool(
          rejectPort,
          rejectToken,
          'team_send_message',
          { to: 'slot-lead', message: 'shutdown_rejected busy with critical task' },
          'slot-worker'
        )) as { result: string };

        expect(resp2.result).toContain('Refusal');
        expect(removeAgent).not.toHaveBeenCalled();
        expect(localMailbox.write).toHaveBeenCalledWith(
          expect.objectContaining({
            toAgentId: 'slot-lead',
            content: expect.stringContaining('busy with critical task'),
          })
        );
      } finally {
        await serverReject.stop();
      }
    });
  });

  // ── team_task_create ──────────────────────────────────────────────────────

  describe('team_task_create', () => {
    it('creates a task with subject', async () => {
      const resp = (await callTool(port, authToken, 'team_task_create', {
        subject: 'Implement feature X',
      })) as { result: string };

      expect(resp.result).toContain('Task created');
      expect(resp.result).toContain('Implement feature X');
      expect(taskManager.create).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Implement feature X' }));
    });

    it('creates a task with subject, description, and owner', async () => {
      const resp = (await callTool(port, authToken, 'team_task_create', {
        subject: 'Deploy to prod',
        description: 'Run migration scripts',
        owner: 'Worker',
      })) as { result: string };

      expect(resp.result).toContain('Deploy to prod');
      expect(resp.result).toContain('Worker');
      expect(taskManager.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Deploy to prod',
          description: 'Run migration scripts',
          owner: 'Worker',
        })
      );
    });

    it('includes the task id (first 8 chars) in the result', async () => {
      const resp = (await callTool(port, authToken, 'team_task_create', {
        subject: 'Short task',
      })) as { result: string };

      // task id prefix from mock: 'task-uui' (first 8 of 'task-uuid-001')
      expect(resp.result).toContain('task-uui');
    });
  });

  // ── team_task_update ──────────────────────────────────────────────────────

  describe('team_task_update', () => {
    it('updates task status to in_progress', async () => {
      const resp = (await callTool(port, authToken, 'team_task_update', {
        task_id: 'task-uuid-001',
        status: 'in_progress',
      })) as { result: string };

      expect(resp.result).toContain('updated');
      expect(resp.result).toContain('in_progress');
      expect(taskManager.update).toHaveBeenCalledWith(
        'task-uuid-001',
        expect.objectContaining({ status: 'in_progress' })
      );
    });

    it('updates task status to completed and checks unblocks', async () => {
      const resp = (await callTool(port, authToken, 'team_task_update', {
        task_id: 'task-uuid-001',
        status: 'completed',
      })) as { result: string };

      expect(resp.result).toContain('completed');
      expect(taskManager.checkUnblocks).toHaveBeenCalledWith('task-uuid-001');
    });

    it('updates task owner', async () => {
      const resp = (await callTool(port, authToken, 'team_task_update', {
        task_id: 'task-uuid-001',
        owner: 'slot-worker',
      })) as { result: string };

      expect(resp.result).toContain('slot-worker');
      expect(taskManager.update).toHaveBeenCalledWith(
        'task-uuid-001',
        expect.objectContaining({ owner: 'slot-worker' })
      );
    });

    it('rejects invalid status values', async () => {
      const resp = (await callTool(port, authToken, 'team_task_update', {
        task_id: 'task-uuid-001',
        status: 'flying',
      })) as { error: string };

      expect(resp.error).toContain('Invalid task status');
      expect(resp.error).toContain('flying');
    });

    it('accepts all valid status values', async () => {
      const validStatuses = ['pending', 'in_progress', 'completed', 'deleted'];
      const results = await Promise.all(
        validStatuses.map((status) => callTool(port, authToken, 'team_task_update', { task_id: 'task-id', status }))
      );
      for (const [i, resp] of results.entries()) {
        expect((resp as { result: string }).result, `Status "${validStatuses[i]}" should succeed`).toContain('updated');
      }
    });
  });

  // ── team_task_list ────────────────────────────────────────────────────────

  describe('team_task_list', () => {
    it('returns no-tasks message when board is empty', async () => {
      const resp = (await callTool(port, authToken, 'team_task_list')) as { result: string };
      expect(resp.result).toBe('No tasks on the board yet.');
    });

    it('returns formatted task list with tasks present', async () => {
      taskManager.list.mockResolvedValue([
        {
          id: 'aaaabbbbccccdddd',
          subject: 'Build feature',
          status: 'in_progress',
          owner: 'Worker',
        },
        {
          id: 'eeeeffff11112222',
          subject: 'Write tests',
          status: 'pending',
          owner: undefined,
        },
      ]);

      const resp = (await callTool(port, authToken, 'team_task_list')) as { result: string };
      expect(resp.result).toContain('## Team Tasks');
      expect(resp.result).toContain('Build feature');
      expect(resp.result).toContain('in_progress');
      expect(resp.result).toContain('Worker');
      expect(resp.result).toContain('Write tests');
      expect(resp.result).toContain('unassigned');
    });
  });

  // ── team_spawn_agent ──────────────────────────────────────────────────────

  describe('team_spawn_agent', () => {
    it('allows lead to spawn a new agent', async () => {
      const resp = (await callTool(
        port,
        authToken,
        'team_spawn_agent',
        { name: 'NewAgent', agent_type: 'claude' },
        'slot-lead'
      )) as { result: string };

      expect(resp.result).toContain('NewAgent');
      expect(resp.result).toContain('slot-new');
    });

    it('rejects spawning by non-lead agents', async () => {
      const resp = (await callTool(
        port,
        authToken,
        'team_spawn_agent',
        { name: 'BadSpawn', agent_type: 'claude' },
        'slot-worker'
      )) as { error: string };

      expect(resp.error).toContain('Only the team leader can spawn');
    });

    it('rejects unsupported agent types', async () => {
      const resp = (await callTool(
        port,
        authToken,
        'team_spawn_agent',
        { name: 'Bot', agent_type: 'unsupported-type' },
        'slot-lead'
      )) as { error: string };

      expect(resp.error).toContain('not supported');
      expect(resp.error).toContain('unsupported-type');
    });

    it('allows claude and codex agent types', async () => {
      const results = await Promise.all(
        ['claude', 'codex'].map((agentType) =>
          callTool(
            port,
            authToken,
            'team_spawn_agent',
            { name: `Bot-${agentType}`, agent_type: agentType },
            'slot-lead'
          )
        )
      );
      for (const [i, resp] of results.entries()) {
        const typed = resp as { result?: string; error?: string };
        const agentType = ['claude', 'codex'][i];
        expect(typed.error, `Agent type "${agentType}" should be allowed`).toBeUndefined();
        expect(typed.result).toBeTruthy();
      }
    });

    it('returns error when spawnAgent is not configured', async () => {
      const serverNoSpawn = new TeamMcpServer({
        teamId: 'team-nospawn',
        getAgents: () => [makeAgent({ slotId: 'slot-lead', role: 'leader' })],
        mailbox: mailbox as unknown as Mailbox,
        taskManager: taskManager as unknown as TaskManager,
        wakeAgent: vi.fn().mockResolvedValue(undefined),
        // spawnAgent intentionally omitted
      });
      await serverNoSpawn.start();
      const noSpawnPort = serverNoSpawn.getPort();
      const noSpawnConfig = serverNoSpawn.getStdioConfig();
      const noSpawnToken = noSpawnConfig.env.find((e) => e.name === 'TEAM_MCP_TOKEN')!.value;

      try {
        const resp = (await callTool(noSpawnPort, noSpawnToken, 'team_spawn_agent', { name: 'Bot' }, 'slot-lead')) as {
          error: string;
        };
        expect(resp.error).toContain('not available');
      } finally {
        await serverNoSpawn.stop();
      }
    });
  });

  // ── team_rename_agent ─────────────────────────────────────────────────────

  describe('team_rename_agent', () => {
    it('renames an agent by name', async () => {
      const renameAgentFn = vi.fn();
      const serverRename = new TeamMcpServer({
        teamId: 'team-rename',
        getAgents: () => [
          makeAgent({ slotId: 'slot-lead', agentName: 'Leader', role: 'leader' }),
          makeAgent({ slotId: 'slot-bob', agentName: 'Bob', role: 'teammate' }),
        ],
        mailbox: mailbox as unknown as Mailbox,
        taskManager: taskManager as unknown as TaskManager,
        renameAgent: renameAgentFn,
        wakeAgent: vi.fn().mockResolvedValue(undefined),
      });
      await serverRename.start();
      const renamePort = serverRename.getPort();
      const renameConfig = serverRename.getStdioConfig();
      const renameToken = renameConfig.env.find((e) => e.name === 'TEAM_MCP_TOKEN')!.value;

      try {
        const resp = (await callTool(renamePort, renameToken, 'team_rename_agent', {
          agent: 'Bob',
          new_name: 'Alice',
        })) as { result: string };

        expect(resp.result).toContain('Bob');
        expect(resp.result).toContain('Alice');
        expect(renameAgentFn).toHaveBeenCalledWith('slot-bob', 'Alice');
      } finally {
        await serverRename.stop();
      }
    });

    it('renames an agent by slotId', async () => {
      const renameAgentFn = vi.fn();
      const serverRename = new TeamMcpServer({
        teamId: 'team-rename2',
        getAgents: () => [makeAgent({ slotId: 'slot-x', agentName: 'Xbot', role: 'teammate' })],
        mailbox: mailbox as unknown as Mailbox,
        taskManager: taskManager as unknown as TaskManager,
        renameAgent: renameAgentFn,
        wakeAgent: vi.fn().mockResolvedValue(undefined),
      });
      await serverRename.start();
      const p = serverRename.getPort();
      const cfg = serverRename.getStdioConfig();
      const tok = cfg.env.find((e) => e.name === 'TEAM_MCP_TOKEN')!.value;

      try {
        const resp = (await callTool(p, tok, 'team_rename_agent', {
          agent: 'slot-x',
          new_name: 'Ybot',
        })) as { result: string };

        expect(resp.result).toContain('Ybot');
        expect(renameAgentFn).toHaveBeenCalledWith('slot-x', 'Ybot');
      } finally {
        await serverRename.stop();
      }
    });

    it('returns error when agent not found', async () => {
      const resp = (await callTool(port, authToken, 'team_rename_agent', {
        agent: 'Ghost',
        new_name: 'Phantom',
      })) as { error: string };

      expect(resp.error).toContain('not found');
      expect(resp.error).toContain('Ghost');
    });

    it('returns error when renameAgent is not configured', async () => {
      const serverNoRename = new TeamMcpServer({
        teamId: 'team-norename',
        getAgents: () => [makeAgent({ slotId: 'slot-a', agentName: 'AgentA', role: 'teammate' })],
        mailbox: mailbox as unknown as Mailbox,
        taskManager: taskManager as unknown as TaskManager,
        wakeAgent: vi.fn().mockResolvedValue(undefined),
        // renameAgent intentionally omitted
      });
      await serverNoRename.start();
      const p = serverNoRename.getPort();
      const cfg = serverNoRename.getStdioConfig();
      const tok = cfg.env.find((e) => e.name === 'TEAM_MCP_TOKEN')!.value;

      try {
        const resp = (await callTool(p, tok, 'team_rename_agent', {
          agent: 'AgentA',
          new_name: 'New',
        })) as { error: string };
        expect(resp.error).toContain('not available');
      } finally {
        await serverNoRename.stop();
      }
    });
  });

  // ── team_shutdown_agent ───────────────────────────────────────────────────

  describe('team_shutdown_agent', () => {
    it('sends shutdown request to target agent', async () => {
      const resp = (await callTool(
        port,
        authToken,
        'team_shutdown_agent',
        {
          agent: 'Worker',
        },
        'slot-lead'
      )) as { result: string };

      expect(resp.result).toContain('Shutdown request sent');
      expect(resp.result).toContain('Worker');
      expect(mailbox.write).toHaveBeenCalledWith(
        expect.objectContaining({
          toAgentId: 'slot-worker',
          type: 'shutdown_request',
        })
      );
    });

    it('returns error when trying to shut down the team leader', async () => {
      const resp = (await callTool(port, authToken, 'team_shutdown_agent', {
        agent: 'Leader',
      })) as { error: string };

      expect(resp.error).toContain('Cannot shut down the team leader');
    });

    it('returns error for non-existent agent', async () => {
      const resp = (await callTool(port, authToken, 'team_shutdown_agent', {
        agent: 'NonExistent',
      })) as { error: string };

      expect(resp.error).toContain('not found');
    });
  });

  // ── Unknown tool ──────────────────────────────────────────────────────────

  describe('unknown tool', () => {
    it('returns error for unknown tool name', async () => {
      const resp = (await callTool(port, authToken, 'team_nonexistent')) as { error: string };
      expect(resp.error).toContain('Unknown tool');
      expect(resp.error).toContain('team_nonexistent');
    });
  });

  // ── getStdioConfig ────────────────────────────────────────────────────────

  describe('getStdioConfig', () => {
    it('returns valid stdio config with port and token', () => {
      const config = server.getStdioConfig();
      expect(config.name).toContain('aionui-team-');
      expect(config.command).toBe('node');
      expect(config.args).toHaveLength(1);
      expect(config.env).toContainEqual(expect.objectContaining({ name: 'TEAM_MCP_PORT', value: String(port) }));
      expect(config.env).toContainEqual(expect.objectContaining({ name: 'TEAM_MCP_TOKEN', value: authToken }));
    });

    it('includes TEAM_AGENT_SLOT_ID when agentSlotId is provided', () => {
      const config = server.getStdioConfig('slot-lead');
      expect(config.env).toContainEqual({ name: 'TEAM_AGENT_SLOT_ID', value: 'slot-lead' });
    });

    it('does not include TEAM_AGENT_SLOT_ID when agentSlotId is omitted', () => {
      const config = server.getStdioConfig();
      const slotEntry = config.env.find((e) => e.name === 'TEAM_AGENT_SLOT_ID');
      expect(slotEntry).toBeUndefined();
    });
  });

  // ── Server lifecycle ──────────────────────────────────────────────────────

  describe('server lifecycle', () => {
    it('getPort returns 0 after stop', async () => {
      const localServer = new TeamMcpServer({
        teamId: 'team-lifecycle',
        getAgents: () => [],
        mailbox: mailbox as unknown as Mailbox,
        taskManager: taskManager as unknown as TaskManager,
        wakeAgent: vi.fn().mockResolvedValue(undefined),
      });
      await localServer.start();
      expect(localServer.getPort()).toBeGreaterThan(0);
      await localServer.stop();
      expect(localServer.getPort()).toBe(0);
    });

    it('stop is idempotent when called twice', async () => {
      const localServer = new TeamMcpServer({
        teamId: 'team-idempotent',
        getAgents: () => [],
        mailbox: mailbox as unknown as Mailbox,
        taskManager: taskManager as unknown as TaskManager,
        wakeAgent: vi.fn().mockResolvedValue(undefined),
      });
      await localServer.start();
      await localServer.stop();
      await expect(localServer.stop()).resolves.toBeUndefined();
    });
  });
});
