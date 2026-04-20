/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for TeamGuideMcpServer tool handler logic (TCP architecture):
 *   - aion_create_team: input validation, TeamSessionService wiring, return shape
 *   - shouldInjectTeamGuideMcp: dynamic capability check (uses cached ACP init results)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';

// ------------------------------------------------------------------
// Hoist mocks
// ------------------------------------------------------------------

const { mockDeepLinkEmit, mockListChangedEmit } = vi.hoisted(() => ({
  mockDeepLinkEmit: vi.fn(),
  mockListChangedEmit: vi.fn(),
}));

const makeCachedInitEntry = () => ({
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

vi.mock('@/common', () => ({
  ipcBridge: {
    deepLink: {
      received: { emit: mockDeepLinkEmit },
    },
    team: {
      listChanged: { emit: mockListChangedEmit },
    },
  },
}));

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/app' },
}));

// Mock ProcessConfig for dynamic team capability checks
vi.mock('../../src/process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return { claude: makeCachedInitEntry(), codex: makeCachedInitEntry() };
      }
      return null;
    }),
  },
}));

// ------------------------------------------------------------------
// Mock TeamSessionService
// ------------------------------------------------------------------

const mockCreateTeam = vi.fn();
const mockGetOrStartSession = vi.fn();
const mockSendMessageToAgent = vi.fn();

function makeTeamSessionService() {
  return {
    createTeam: mockCreateTeam,
    getOrStartSession: mockGetOrStartSession,
  } as unknown as import('../../src/process/team/TeamSessionService').TeamSessionService;
}

// ------------------------------------------------------------------
// Import units under test
// ------------------------------------------------------------------

import { TeamGuideMcpServer } from '../../src/process/team/mcp/guide/TeamGuideMcpServer';
import { MAX_MCP_MESSAGE_SIZE } from '../../src/process/team/mcp/tcpHelpers';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function getPort(service: TeamGuideMcpServer): number {
  const entry = service.getStdioConfig().env.find((e) => e.name === 'AION_MCP_PORT');
  return Number(entry?.value ?? 0);
}

function getAuthToken(service: TeamGuideMcpServer): string {
  return service.getStdioConfig().env.find((e) => e.name === 'AION_MCP_TOKEN')?.value ?? '';
}

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

// ------------------------------------------------------------------
// shouldInjectTeamGuideMcp (dynamic capability check)
// ------------------------------------------------------------------
// Tested in team-agentSelectUtils.test.ts via isTeamCapableBackend.
// The function itself is a thin wrapper around ProcessConfig + isTeamCapableBackend.

// ------------------------------------------------------------------
// TeamGuideMcpServer lifecycle
// ------------------------------------------------------------------

describe('TeamGuideMcpServer lifecycle', () => {
  let service: TeamGuideMcpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new TeamGuideMcpServer(makeTeamSessionService());
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('starts on a non-zero port', () => {
    expect(getPort(service)).toBeGreaterThan(0);
  });

  it('getStdioConfig returns correct structure', () => {
    const config = service.getStdioConfig();
    expect(config.name).toBe('aionui-team-guide');
    expect(config.command).toBe('node');
    expect(Array.isArray(config.args)).toBe(true);
    expect(config.env.some((e) => e.name === 'AION_MCP_PORT')).toBe(true);
    expect(config.env.some((e) => e.name === 'AION_MCP_TOKEN')).toBe(true);
  });

  it('start() returns the same StdioMcpConfig as getStdioConfig()', async () => {
    const service2 = new TeamGuideMcpServer(makeTeamSessionService());
    const returned = await service2.start();
    const getter = service2.getStdioConfig();
    expect(returned).toEqual(getter);
    await service2.stop();
  });

  it('AION_MCP_PORT resets to 0 after stop', async () => {
    await service.stop();
    expect(getPort(service)).toBe(0);
    await service.start();
  });
});

// ------------------------------------------------------------------
// Auth token validation
// ------------------------------------------------------------------

describe('TeamGuideMcpServer auth token', () => {
  let service: TeamGuideMcpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new TeamGuideMcpServer(makeTeamSessionService());
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('rejects requests with wrong auth token', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: 'test' },
      auth_token: 'wrong-token',
    })) as Record<string, unknown>;
    expect(response.error).toBe('Unauthorized');
  });

  it('destroys oversize framed requests immediately and still accepts the next valid request', async () => {
    mockCreateTeam.mockResolvedValue({
      id: 'team-oversize-check',
      name: 'oversize recovery check',
      agents: [{ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' }],
    });
    mockGetOrStartSession.mockResolvedValue({
      sendMessageToAgent: mockSendMessageToAgent,
    });
    mockSendMessageToAgent.mockResolvedValue(undefined);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new net.Socket();

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };

      const timer = setTimeout(() => finish(new Error('Oversize guide MCP frame was not closed promptly')), 500);

      socket.connect(getPort(service), '127.0.0.1', () => {
        const header = Buffer.alloc(4);
        header.writeUInt32BE(MAX_MCP_MESSAGE_SIZE + 1, 0);
        socket.write(header);
      });

      socket.once('data', (chunk) => {
        finish(new Error(`Expected disconnect for oversize guide frame, got data: ${chunk.toString('hex')}`));
      });
      socket.once('close', () => finish());
      socket.once('error', () => finish());
    });

    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: 'oversize recovery check' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    expect(response.error).toBeUndefined();
    expect(String(response.result)).toContain('team_created');
  });
});

// ------------------------------------------------------------------
// aion_create_team handler
// ------------------------------------------------------------------

describe('aion_create_team handler', () => {
  let service: TeamGuideMcpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new TeamGuideMcpServer(makeTeamSessionService());
    await service.start();

    mockCreateTeam.mockResolvedValue({
      id: 'team-abc-123',
      name: '电商网站全栈开发',
      agents: [{ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' }],
    });

    mockGetOrStartSession.mockResolvedValue({
      sendMessageToAgent: mockSendMessageToAgent,
    });

    mockSendMessageToAgent.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await service.stop();
  });

  it('returns teamId, name, route, and status on valid input', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '构建完整电商网站', name: '电商网站全栈开发' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    const data = JSON.parse(response.result as string) as Record<string, unknown>;
    expect(data).toMatchObject({
      teamId: 'team-abc-123',
      name: '电商网站全栈开发',
      route: '/team/team-abc-123',
      status: 'team_created',
    });
  });

  it('auto-generates name from summary when name is omitted', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '构建电商网站 React 前端' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    const data = JSON.parse(response.result as string) as Record<string, unknown>;
    expect(data.teamId).toBe('team-abc-123');
    expect(data.route).toBe('/team/team-abc-123');
  });

  it('calls TeamSessionService.createTeam with the provided name', async () => {
    await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '测试摘要', name: '测试团队' },
      auth_token: getAuthToken(service),
    });

    expect(mockCreateTeam).toHaveBeenCalledWith(expect.objectContaining({ name: '测试团队' }));
  });

  it('sends summary as first message to leader agent (async)', async () => {
    await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '构建电商网站', name: '电商' },
      auth_token: getAuthToken(service),
    });

    // Session start + message send are fire-and-forget; wait for microtasks to settle
    await vi.waitFor(() => {
      expect(mockSendMessageToAgent).toHaveBeenCalledWith('slot-lead', '构建电商网站', { silent: false });
    });
  });

  it('returns error when summary is empty', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    expect(response.error).toBeTruthy();
    expect(String(response.error)).toContain('summary is required');
  });

  it('returns error when TeamSessionService.createTeam throws', async () => {
    mockCreateTeam.mockRejectedValue(new Error('DB write failed'));

    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '构建网站' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    expect(response.error).toContain('DB write failed');
  });

  it('uses system-injected backend (from AION_MCP_BACKEND) as agent type', async () => {
    await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '分析代码' },
      auth_token: getAuthToken(service),
      backend: 'codex',
    });

    expect(mockCreateTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: expect.arrayContaining([expect.objectContaining({ agentType: 'codex' })]),
      })
    );
  });

  it('falls back to claude when backend is not in whitelist', async () => {
    await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '分析代码' },
      auth_token: getAuthToken(service),
      backend: 'qwen',
    });

    expect(mockCreateTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: expect.arrayContaining([expect.objectContaining({ agentType: 'claude' })]),
      })
    );
  });

  it('falls back to claude when backend is not provided', async () => {
    await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '构建网站' },
      auth_token: getAuthToken(service),
    });

    expect(mockCreateTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: expect.arrayContaining([expect.objectContaining({ agentType: 'claude' })]),
      })
    );
  });
});

// ------------------------------------------------------------------
// Unknown tool
// ------------------------------------------------------------------

describe('unknown tool', () => {
  let service: TeamGuideMcpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new TeamGuideMcpServer(makeTeamSessionService());
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('returns error for unknown tool names', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'totally_unknown_tool',
      args: {},
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    expect(response.error).toContain('Unknown tool');
  });
});
