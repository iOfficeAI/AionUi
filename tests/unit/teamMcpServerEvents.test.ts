/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Task #4: TeamMcpServer tcp_ready / tcp_error IPC events.
 *
 * Covers verification points:
 *  1. tcp_ready emitted after successful TCP bind, port field correct
 *  2. tcp_error emitted on TCP bind failure, error field non-empty + console.error called
 *  3. TEAM_ALLOWED includes 'gemini' (agentType whitelist)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as net from 'net';

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const { mockMcpStatusEmit } = vi.hoisted(() => ({
  mockMcpStatusEmit: vi.fn(),
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    team: {
      mcpStatus: { emit: mockMcpStatusEmit },
      agentSpawned: { emit: vi.fn() },
      agentRemoved: { emit: vi.fn() },
      agentRenamed: { emit: vi.fn() },
    },
  },
}));

vi.mock('../../src/common/adapter/ipcBridge', () => ({
  ipcBridge: {
    team: {
      mcpStatus: { emit: mockMcpStatusEmit },
    },
  },
  team: {
    mcpStatus: { emit: mockMcpStatusEmit },
    agentSpawned: { emit: vi.fn() },
    agentRemoved: { emit: vi.fn() },
    agentRenamed: { emit: vi.fn() },
  },
}));

// Mock electron app (TeamMcpServer uses app.getAppPath for script path)
vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn().mockReturnValue('/mock/app'),
    isPackaged: false,
  },
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import { TeamMcpServer } from '../../src/process/team/TeamMcpServer';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeMockDeps() {
  return {
    teamId: 'test-team-42',
    getAgents: vi.fn().mockReturnValue([]),
    mailbox: { send: vi.fn(), subscribe: vi.fn(), write: vi.fn().mockResolvedValue(undefined) } as any,
    taskManager: { createTask: vi.fn(), getTasks: vi.fn().mockReturnValue([]) } as any,
    wakeAgent: vi.fn().mockResolvedValue(undefined),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Task #4 Verification #1+2: tcp_ready / tcp_error events
// ─────────────────────────────────────────────────────────────────────────────

describe('Task #4: TeamMcpServer IPC events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits tcp_ready with correct port after successful TCP bind', async () => {
    const server = new TeamMcpServer(makeMockDeps());

    await server.start();

    const readyCalls = mockMcpStatusEmit.mock.calls.filter((c) => c[0].phase === 'tcp_ready');
    expect(readyCalls.length).toBeGreaterThan(0);
    const payload = readyCalls[0][0];
    expect(payload.teamId).toBe('test-team-42');
    expect(typeof payload.port).toBe('number');
    expect(payload.port).toBeGreaterThan(0);

    // cleanup
    await server.stop();
  });

  it('emits tcp_error with non-empty error string on TCP bind failure', async () => {
    // net.createServer is non-configurable in Node — cannot be mocked via vi.spyOn.
    // Instead: start() normally creates tcpServer, then we fire the 'error' event
    // on it before listen() resolves, triggering the catch branch.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const server = new TeamMcpServer(makeMockDeps());

    const startPromise = server.start();

    // Poll until start() has assigned this.tcpServer, then inject an error
    await new Promise<void>((resolve) => {
      const check = () => {
        if ((server as any).tcpServer) resolve();
        else setImmediate(check);
      };
      check();
    });
    const fakeErr = Object.assign(new Error('listen EADDRINUSE 127.0.0.1:0'), { code: 'EADDRINUSE' });
    (server as any).tcpServer.emit('error', fakeErr);

    await expect(startPromise).rejects.toThrow('EADDRINUSE');

    const errorCalls = mockMcpStatusEmit.mock.calls.filter((c) => c[0].phase === 'tcp_error');
    expect(errorCalls.length).toBeGreaterThan(0);
    const payload = errorCalls[0][0];
    expect(payload.teamId).toBe('test-team-42');
    expect(typeof payload.error).toBe('string');
    expect(payload.error!.length).toBeGreaterThan(0);

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task #4 Verification #3: TEAM_ALLOWED gemini whitelist
// ─────────────────────────────────────────────────────────────────────────────

describe('Task #4: TeamMcpServer agent type whitelist', () => {
  it('allows gemini agents via handleSpawnAgent (TEAM_ALLOWED includes gemini)', async () => {
    const spawnAgent = vi.fn().mockResolvedValue({ slotId: 'new-slot', conversationId: 'c1' });
    const deps = { ...makeMockDeps(), spawnAgent };
    const server = new TeamMcpServer(deps);

    // gemini should not throw on the TEAM_ALLOWED check
    await expect(
      (server as any).handleSpawnAgent({ name: 'gemini-agent', agent_type: 'gemini' })
    ).resolves.not.toThrow();
    expect(spawnAgent).toHaveBeenCalledWith('gemini-agent', 'gemini');
  });

  it('rejects codebuddy agents via handleSpawnAgent (codebuddy removed from whitelist)', async () => {
    const spawnAgent = vi.fn();
    const deps = { ...makeMockDeps(), spawnAgent };
    const server = new TeamMcpServer(deps);

    await expect(
      (server as any).handleSpawnAgent({ name: 'codebuddy-agent', agent_type: 'codebuddy' })
    ).rejects.toThrow(/not supported/);
    expect(spawnAgent).not.toHaveBeenCalled();
  });

  it('rejects unsupported agent types', async () => {
    const spawnAgent = vi.fn();
    const deps = { ...makeMockDeps(), spawnAgent };
    const server = new TeamMcpServer(deps);

    await expect(
      (server as any).handleSpawnAgent({ name: 'bad-agent', agent_type: 'unknown-backend' })
    ).rejects.toThrow('not supported in team mode');
    expect(spawnAgent).not.toHaveBeenCalled();
  });
});
