/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for AionMcpService tool handler logic (TCP architecture):
 *   - aion_create_team: input validation, TeamSessionService wiring, return shape
 *   - aion_navigate: route whitelist enforcement, IPC emit
 *   - TEAM_GUIDE_ALLOWED_BACKENDS: whitelist set (Task #4)
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

import { AionMcpService } from '../../src/process/services/mcpServices/AionMcpService';
import { TEAM_GUIDE_ALLOWED_BACKENDS } from '../../src/process/agent/acp/mcpSessionConfig';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function getPort(service: AionMcpService): number {
  const entry = service.getStdioConfig().env.find((e) => e.name === 'AION_MCP_PORT');
  return Number(entry?.value ?? 0);
}

function getAuthToken(service: AionMcpService): string {
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
// TEAM_GUIDE_ALLOWED_BACKENDS (Task #4 whitelist)
// ------------------------------------------------------------------

describe('TEAM_GUIDE_ALLOWED_BACKENDS whitelist', () => {
  it('includes claude', () => {
    expect(TEAM_GUIDE_ALLOWED_BACKENDS.has('claude')).toBe(true);
  });

  it('includes codex', () => {
    expect(TEAM_GUIDE_ALLOWED_BACKENDS.has('codex')).toBe(true);
  });

  it('includes gemini', () => {
    expect(TEAM_GUIDE_ALLOWED_BACKENDS.has('gemini')).toBe(true);
  });

  it('excludes qwen', () => {
    expect(TEAM_GUIDE_ALLOWED_BACKENDS.has('qwen')).toBe(false);
  });

  it('excludes opencode', () => {
    expect(TEAM_GUIDE_ALLOWED_BACKENDS.has('opencode')).toBe(false);
  });

  it('excludes iflow', () => {
    expect(TEAM_GUIDE_ALLOWED_BACKENDS.has('iflow')).toBe(false);
  });

  it('excludes cursor', () => {
    expect(TEAM_GUIDE_ALLOWED_BACKENDS.has('cursor')).toBe(false);
  });
});

// ------------------------------------------------------------------
// AionMcpService lifecycle
// ------------------------------------------------------------------

describe('AionMcpService lifecycle', () => {
  let service: AionMcpService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new AionMcpService(makeTeamSessionService());
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
    const service2 = new AionMcpService(makeTeamSessionService());
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

describe('AionMcpService auth token', () => {
  let service: AionMcpService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new AionMcpService(makeTeamSessionService());
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('rejects requests with wrong auth token', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_navigate',
      args: { route: '/team/abc' },
      auth_token: 'wrong-token',
    })) as Record<string, unknown>;
    expect(response.error).toBe('Unauthorized');
  });

  it('accepts requests with correct auth token', async () => {
    mockDeepLinkEmit.mockReturnValue(undefined);
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_navigate',
      args: { route: '/team/abc-123' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;
    expect(response.error).toBeUndefined();
    expect(typeof response.result).toBe('string');
  });
});

// ------------------------------------------------------------------
// aion_create_team handler
// ------------------------------------------------------------------

describe('aion_create_team handler', () => {
  let service: AionMcpService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new AionMcpService(makeTeamSessionService());
    await service.start();

    mockCreateTeam.mockResolvedValue({
      id: 'team-abc-123',
      name: '电商网站全栈开发',
      agents: [{ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'lead' }],
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

  it('sends summary as first message to lead agent (async)', async () => {
    await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '构建电商网站', name: '电商' },
      auth_token: getAuthToken(service),
    });

    // Session start + message send are fire-and-forget; wait for microtasks to settle
    await vi.waitFor(() => {
      expect(mockSendMessageToAgent).toHaveBeenCalledWith('slot-lead', '构建电商网站');
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
// aion_navigate handler
// ------------------------------------------------------------------

describe('aion_navigate handler', () => {
  let service: AionMcpService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new AionMcpService(makeTeamSessionService());
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('emits deepLink IPC and returns success for /team/:id route', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_navigate',
      args: { route: '/team/abc-123' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    expect(mockDeepLinkEmit).toHaveBeenCalledWith({
      action: 'navigate',
      params: { route: '/team/abc-123' },
    });

    const data = JSON.parse(response.result as string) as Record<string, unknown>;
    expect(data.success).toBe(true);
  });

  it('emits deepLink IPC for /conversation/:id route', async () => {
    await tcpRequest(getPort(service), {
      tool: 'aion_navigate',
      args: { route: '/conversation/xyz-456' },
      auth_token: getAuthToken(service),
    });

    expect(mockDeepLinkEmit).toHaveBeenCalledWith({
      action: 'navigate',
      params: { route: '/conversation/xyz-456' },
    });
  });

  it('returns error and does NOT emit IPC for blocked routes', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_navigate',
      args: { route: '/evil/path' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    expect(response.error).toContain('not allowed');
    expect(mockDeepLinkEmit).not.toHaveBeenCalled();
  });

  it('returns error for /team/ without id segment', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_navigate',
      args: { route: '/team/' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    expect(response.error).toBeTruthy();
    expect(mockDeepLinkEmit).not.toHaveBeenCalled();
  });

  it('returns error for /settings/model', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_navigate',
      args: { route: '/settings/model' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    expect(response.error).toBeTruthy();
    expect(mockDeepLinkEmit).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------
// Unknown tool
// ------------------------------------------------------------------

describe('unknown tool', () => {
  let service: AionMcpService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new AionMcpService(makeTeamSessionService());
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
