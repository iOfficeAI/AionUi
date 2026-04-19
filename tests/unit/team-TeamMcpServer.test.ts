// tests/unit/team-TeamMcpServer.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/app' },
}));

// Mock ProcessConfig for dynamic team capability checks
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return {
          claude: {
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
          },
          codex: {
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
          },
        };
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

import { TeamMcpServer } from '@process/team/mcp/team/TeamMcpServer';
import type { Mailbox } from '@process/team/Mailbox';
import type { TaskManager } from '@process/team/TaskManager';
import type { TeamAgent } from '@process/team/types';

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
    readUnread: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([]),
  } as unknown as Mailbox;
}

function makeTaskManager() {
  return {
    create: vi.fn().mockResolvedValue({ id: 'task-1', subject: 'Test', status: 'pending', owner: undefined }),
    update: vi.fn().mockResolvedValue({ id: 'task-1', status: 'completed' }),
    list: vi.fn().mockResolvedValue([]),
    getByOwner: vi.fn().mockResolvedValue([]),
    checkUnblocks: vi.fn().mockResolvedValue([]),
  } as unknown as TaskManager;
}

/**
 * Send a length-prefixed TCP message and return the parsed response.
 */
async function tcpRequest(port: number, data: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    socket.connect(port, '127.0.0.1', () => {
      const json = JSON.stringify(data);
      const body = Buffer.from(json, 'utf-8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(body.length, 0);
      socket.write(Buffer.concat([header, body]));
    });

    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const bodyLen = buffer.readUInt32BE(0);
        if (buffer.length < 4 + bodyLen) break;
        const jsonStr = buffer.subarray(4, 4 + bodyLen).toString('utf-8');
        buffer = buffer.subarray(4 + bodyLen);
        try {
          resolve(JSON.parse(jsonStr));
        } catch (e) {
          reject(e);
        }
      }
    });

    socket.on('error', reject);
    setTimeout(() => reject(new Error('TCP request timed out')), 3000);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TeamMcpServer', () => {
  let server: TeamMcpServer;
  let mailbox: Mailbox;
  let taskManager: ReturnType<typeof makeTaskManager>;
  let agents: TeamAgent[];
  let wakeAgent: ReturnType<typeof vi.fn>;
  let spawnAgent: ReturnType<typeof vi.fn>;
  let renameAgent: ReturnType<typeof vi.fn>;
  let removeAgent: ReturnType<typeof vi.fn>;
  let authToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    agents = [
      makeAgent({ slotId: 'slot-lead', agentName: 'Leader', role: 'leader' }),
      makeAgent({ slotId: 'slot-member', agentName: 'Alice', role: 'teammate' }),
    ];
    mailbox = makeMailbox();
    taskManager = makeTaskManager();
    wakeAgent = vi.fn().mockResolvedValue(undefined);
    spawnAgent = vi.fn().mockResolvedValue(makeAgent({ slotId: 'slot-new', agentName: 'NewBot' }));
    renameAgent = vi.fn();
    removeAgent = vi.fn();

    server = new TeamMcpServer({
      teamId: 'team-1',
      getAgents: () => agents,
      mailbox,
      taskManager,
      spawnAgent,
      renameAgent,
      removeAgent,
      wakeAgent,
    });

    await server.start();

    // Extract the auth token from the server's stdio config env
    const config = server.getStdioConfig();
    const tokenEntry = config.env.find((e) => e.name === 'TEAM_MCP_TOKEN');
    authToken = tokenEntry?.value ?? '';
  });

  afterEach(async () => {
    await server.stop();
  });

  // -------------------------------------------------------------------------
  // start / stop / getPort
  // -------------------------------------------------------------------------

  describe('start / stop / getPort', () => {
    it('starts on a non-zero port', () => {
      expect(server.getPort()).toBeGreaterThan(0);
    });

    it('getStdioConfig returns correct structure', () => {
      const config = server.getStdioConfig();
      expect(config.name).toContain('aionui-team-team-1');
      expect(config.command).toBe('node');
      expect(Array.isArray(config.args)).toBe(true);
      expect(config.env.some((e) => e.name === 'TEAM_MCP_PORT')).toBe(true);
      expect(config.env.some((e) => e.name === 'TEAM_MCP_TOKEN')).toBe(true);
    });

    it('getStdioConfig includes TEAM_AGENT_SLOT_ID when agentSlotId is provided', () => {
      const config = server.getStdioConfig('slot-lead');
      const slotEntry = config.env.find((e) => e.name === 'TEAM_AGENT_SLOT_ID');
      expect(slotEntry?.value).toBe('slot-lead');
    });

    it('resets port to 0 after stop', async () => {
      await server.stop();
      expect(server.getPort()).toBe(0);
      // Re-start for afterEach to stop again cleanly
      await server.start();
    });
  });

  // -------------------------------------------------------------------------
  // Auth token validation
  // -------------------------------------------------------------------------

  describe('auth token', () => {
    it('rejects requests with wrong auth token and closes connection', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_members',
        args: {},
        auth_token: 'wrong-token',
      })) as Record<string, unknown>;
      expect(response.error).toBe('Unauthorized');
    });

    it('accepts requests with correct auth token', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_members',
        args: {},
        auth_token: authToken,
      })) as Record<string, unknown>;
      expect(response.error).toBeUndefined();
      expect(typeof response.result).toBe('string');
    });
  });

  // -------------------------------------------------------------------------
  // team_members tool
  // -------------------------------------------------------------------------

  describe('team_members', () => {
    it('returns formatted team member list', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_members',
        args: {},
        auth_token: authToken,
      })) as Record<string, unknown>;
      expect(response.result).toContain('Leader');
      expect(response.result).toContain('Alice');
      expect(response.result).toContain('leader');
      expect(response.result).toContain('teammate');
    });

    it('returns "No team members yet." when agents list is empty', async () => {
      agents.length = 0;
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_members',
        args: {},
        auth_token: authToken,
      })) as Record<string, unknown>;
      expect(response.result).toBe('No team members yet.');
    });
  });

  // -------------------------------------------------------------------------
  // team_task_list tool
  // -------------------------------------------------------------------------

  describe('team_task_list', () => {
    it('returns "No tasks" message when task board is empty', async () => {
      vi.mocked(taskManager.list).mockResolvedValue([]);

      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_task_list',
        args: {},
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(response.result).toBe('No tasks on the board yet.');
    });

    it('returns formatted task list when tasks exist', async () => {
      vi.mocked(taskManager.list).mockResolvedValue([
        {
          id: 'aaaaaaaa-0000-0000-0000-000000000000',
          teamId: 'team-1',
          subject: 'Write code',
          status: 'in_progress',
          owner: 'slot-lead',
          blockedBy: [],
          blocks: [],
          metadata: {},
          createdAt: 1000,
          updatedAt: 1000,
        },
      ]);

      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_task_list',
        args: {},
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(response.result).toContain('Write code');
      expect(response.result).toContain('in_progress');
    });
  });

  // -------------------------------------------------------------------------
  // team_task_create tool
  // -------------------------------------------------------------------------

  describe('team_task_create', () => {
    it('creates a task and returns confirmation', async () => {
      vi.mocked(taskManager.create).mockResolvedValue({
        id: 'task-new-00000000',
        teamId: 'team-1',
        subject: 'New Feature',
        status: 'pending',
        blockedBy: [],
        blocks: [],
        metadata: {},
        createdAt: 1000,
        updatedAt: 1000,
      });

      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_task_create',
        args: { subject: 'New Feature', description: 'Some desc', owner: 'slot-member' },
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(taskManager.create).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'New Feature', description: 'Some desc', owner: 'slot-member' })
      );
      expect(response.result).toContain('New Feature');
    });
  });

  // -------------------------------------------------------------------------
  // team_task_update tool
  // -------------------------------------------------------------------------

  describe('team_task_update', () => {
    it('updates task status', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_task_update',
        args: { task_id: 'task-abc', status: 'completed' },
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(taskManager.update).toHaveBeenCalledWith('task-abc', expect.objectContaining({ status: 'completed' }));
      expect(taskManager.checkUnblocks).toHaveBeenCalledWith('task-abc');
      expect(response.result).toContain('task-ab');
    });

    it('does not call checkUnblocks when status is not "completed"', async () => {
      await tcpRequest(server.getPort(), {
        tool: 'team_task_update',
        args: { task_id: 'task-abc', status: 'in_progress' },
        auth_token: authToken,
      });

      expect(taskManager.checkUnblocks).not.toHaveBeenCalled();
    });

    it('returns error for invalid status', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_task_update',
        args: { task_id: 'task-abc', status: 'invalid_status' },
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(response.error).toContain('Invalid task status');
    });
  });

  // -------------------------------------------------------------------------
  // team_send_message tool
  // -------------------------------------------------------------------------

  describe('team_send_message', () => {
    it('sends a message to a specific agent by name', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_send_message',
        args: { to: 'Alice', message: 'Hello Alice' },
        from_slot_id: 'slot-lead',
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(mailbox.write).toHaveBeenCalledWith(
        expect.objectContaining({
          toAgentId: 'slot-member',
          fromAgentId: 'slot-lead',
          content: 'Hello Alice',
        })
      );
      expect(wakeAgent).toHaveBeenCalledWith('slot-member');
      expect(response.result).toContain('Alice');
    });

    it('throws when target agent not found', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_send_message',
        args: { to: 'NonExistent', message: 'Hello' },
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(response.error).toContain('NonExistent');
    });

    it('broadcasts to all agents when to="*"', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_send_message',
        args: { to: '*', message: 'Everyone hear this' },
        from_slot_id: 'slot-lead',
        auth_token: authToken,
      })) as Record<string, unknown>;

      // Should write to Alice (not to sender = leader)
      expect(mailbox.write).toHaveBeenCalledWith(
        expect.objectContaining({ toAgentId: 'slot-member', content: 'Everyone hear this' })
      );
      expect(response.result).toContain('broadcast');
    });

    it('handles shutdown_approved by removing the sender agent', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_send_message',
        args: { to: 'Leader', message: 'shutdown_approved' },
        from_slot_id: 'slot-member',
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(removeAgent).toHaveBeenCalledWith('slot-member');
      expect(response.result).toContain('Shutdown confirmed');
    });

    it('handles shutdown_rejected by notifying leader', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_send_message',
        args: { to: 'Leader', message: 'shutdown_rejected: I need to finish my task' },
        from_slot_id: 'slot-member',
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(mailbox.write).toHaveBeenCalledWith(
        expect.objectContaining({
          toAgentId: 'slot-lead',
          content: expect.stringContaining('refused to shut down'),
        })
      );
      expect(response.result).toContain('Refusal sent');
    });
  });

  // -------------------------------------------------------------------------
  // team_spawn_agent tool
  // -------------------------------------------------------------------------

  describe('team_spawn_agent', () => {
    it('spawns a new agent when called by leader', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_spawn_agent',
        args: { name: 'NewBot', agent_type: 'claude' },
        from_slot_id: 'slot-lead',
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(spawnAgent).toHaveBeenCalledWith('NewBot', 'claude', undefined);
      expect(response.result).toContain('NewBot');
    });

    it('rejects spawn from non-leader agent', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_spawn_agent',
        args: { name: 'NewBot', agent_type: 'claude' },
        from_slot_id: 'slot-member',
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(response.error).toContain('Only the team leader');
      expect(spawnAgent).not.toHaveBeenCalled();
    });

    it('rejects unsupported agent types', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_spawn_agent',
        args: { name: 'UnknownBot', agent_type: 'codebuddy' },
        from_slot_id: 'slot-lead',
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(response.error).toContain('not supported in team mode');
    });
  });

  // -------------------------------------------------------------------------
  // team_shutdown_agent tool
  // -------------------------------------------------------------------------

  describe('team_shutdown_agent', () => {
    it('sends shutdown request to specified agent', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_shutdown_agent',
        args: { agent: 'Alice' },
        from_slot_id: 'slot-lead',
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(mailbox.write).toHaveBeenCalledWith(
        expect.objectContaining({
          toAgentId: 'slot-member',
          type: 'shutdown_request',
        })
      );
      expect(wakeAgent).toHaveBeenCalledWith('slot-member');
      expect(response.result).toContain('Alice');
    });

    it('rejects shutdown of the leader', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_shutdown_agent',
        args: { agent: 'Leader' },
        from_slot_id: 'slot-lead',
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(response.error).toContain('Cannot shut down the team leader');
    });

    it('returns error when agent not found', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_shutdown_agent',
        args: { agent: 'Nonexistent' },
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(response.error).toContain('Nonexistent');
    });
  });

  // -------------------------------------------------------------------------
  // team_rename_agent tool
  // -------------------------------------------------------------------------

  describe('team_rename_agent', () => {
    it('renames an agent', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_rename_agent',
        args: { agent: 'Alice', new_name: 'AliceRenamed' },
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(renameAgent).toHaveBeenCalledWith('slot-member', 'AliceRenamed');
      expect(response.result).toContain('Alice');
      expect(response.result).toContain('AliceRenamed');
    });

    it('returns error when agent not found', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'team_rename_agent',
        args: { agent: 'Nonexistent', new_name: 'New' },
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(response.error).toContain('Nonexistent');
    });

    it('returns error when renameAgent is not available', async () => {
      const serverWithoutRename = new TeamMcpServer({
        teamId: 'team-x',
        getAgents: () => agents,
        mailbox,
        taskManager,
        wakeAgent,
      });
      await serverWithoutRename.start();
      const cfg = serverWithoutRename.getStdioConfig();
      const token = cfg.env.find((e) => e.name === 'TEAM_MCP_TOKEN')!.value;

      const response = (await tcpRequest(serverWithoutRename.getPort(), {
        tool: 'team_rename_agent',
        args: { agent: 'Alice', new_name: 'New' },
        auth_token: token,
      })) as Record<string, unknown>;

      await serverWithoutRename.stop();
      expect(response.error).toContain('not available');
    });
  });

  // -------------------------------------------------------------------------
  // Unknown tool
  // -------------------------------------------------------------------------

  describe('unknown tool', () => {
    it('returns an error for unknown tool names', async () => {
      const response = (await tcpRequest(server.getPort(), {
        tool: 'totally_unknown_tool',
        args: {},
        auth_token: authToken,
      })) as Record<string, unknown>;

      expect(response.error).toContain('Unknown tool');
    });
  });

  // -------------------------------------------------------------------------
  // TCP framing (partial / chunked messages)
  // -------------------------------------------------------------------------

  describe('TCP framing', () => {
    it('handles message sent in multiple chunks', async () => {
      const response = await new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.connect(server.getPort(), '127.0.0.1', () => {
          const json = JSON.stringify({ tool: 'team_members', args: {}, auth_token: authToken });
          const body = Buffer.from(json, 'utf-8');
          const header = Buffer.alloc(4);
          header.writeUInt32BE(body.length, 0);
          const full = Buffer.concat([header, body]);

          // Send in two chunks
          socket.write(full.subarray(0, 5));
          setTimeout(() => socket.write(full.subarray(5)), 10);
        });

        let buffer = Buffer.alloc(0);
        socket.on('data', (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          if (buffer.length >= 4) {
            const bodyLen = buffer.readUInt32BE(0);
            if (buffer.length >= 4 + bodyLen) {
              const jsonStr = buffer.subarray(4, 4 + bodyLen).toString('utf-8');
              resolve(JSON.parse(jsonStr));
            }
          }
        });
        socket.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 3000);
      });

      expect((response as Record<string, unknown>).result).toContain('Leader');
    });
  });
});
