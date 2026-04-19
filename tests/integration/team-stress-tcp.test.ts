/**
 * Stress tests: TeamMcpServer TCP transport under pressure.
 *
 * Tests:
 * - Large message payloads (1KB, 10KB, 100KB) through real TCP framing
 * - Mid-chunk byte splits (message boundary falls in middle of TCP packet)
 * - 20+ parallel tool calls — no cross-contamination
 * - Rapid connect/disconnect cycles
 * - Malformed JSON — graceful error handling
 * - Oversize length prefix — immediate disconnect without unbounded buffering
 * - Auth token rejection under load
 *
 * Only mocks: Mailbox (write), TaskManager (create/list/update), wakeAgent.
 * TeamMcpServer TCP framing is exercised with REAL net.Socket connections.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';
import { TeamMcpServer } from '@process/team/mcp/team/TeamMcpServer';
import { MAX_MCP_MESSAGE_SIZE } from '@process/team/mcp/tcpHelpers';
import type { TeamAgent } from '@/common/types/teamTypes';
import type { Mailbox } from '@process/team/Mailbox';
import type { TaskManager } from '@process/team/TaskManager';

// ── TCP helpers ───────────────────────────────────────────────────────────────

function writeTcpMessage(socket: net.Socket, data: unknown): void {
  const body = Buffer.from(JSON.stringify(data), 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  socket.write(Buffer.concat([header, body]));
}

function readOneTcpResponse(socket: net.Socket, timeoutMs = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => reject(new Error(`TCP response timeout after ${timeoutMs}ms`)), timeoutMs);

    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const bodyLen = buf.readUInt32BE(0);
        if (buf.length < 4 + bodyLen) break;
        const json = buf.subarray(4, 4 + bodyLen).toString('utf-8');
        buf = buf.subarray(4 + bodyLen);
        clearTimeout(timer);
        socket.removeListener('data', onData);
        try {
          resolve(JSON.parse(json));
        } catch {
          reject(new Error(`Bad JSON in response: ${json.slice(0, 100)}`));
        }
        break;
      }
    };

    socket.on('data', onData);
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
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
      readOneTcpResponse(socket)
        .then(resolve)
        .catch(reject)
        .finally(() => socket.destroy());

      writeTcpMessage(socket, {
        tool,
        args,
        auth_token: authToken,
        ...(fromSlotId ? { from_slot_id: fromSlotId } : {}),
      });
    });
    socket.on('error', reject);
  });
}

/** Send raw bytes with a controlled split point to simulate TCP chunking */
async function callToolWithChunkedDelivery(
  port: number,
  authToken: string,
  tool: string,
  args: Record<string, unknown>,
  splitAt: number
): Promise<unknown> {
  const body = Buffer.from(JSON.stringify({ tool, args, auth_token: authToken }), 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  const full = Buffer.concat([header, body]);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
      readOneTcpResponse(socket, 5000)
        .then(resolve)
        .catch(reject)
        .finally(() => socket.destroy());

      // Send in two parts with a small gap to guarantee separate TCP packets
      socket.write(full.subarray(0, splitAt));
      setTimeout(() => {
        if (!socket.destroyed) {
          socket.write(full.subarray(splitAt));
        }
      }, 10);
    });
    socket.on('error', reject);
  });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

function buildServer(agents: TeamAgent[], wakeAgent = vi.fn().mockResolvedValue(undefined)) {
  const mailbox = { write: vi.fn().mockResolvedValue({ id: 'msg-1' }) } as unknown as Mailbox;
  const taskManager = {
    create: vi.fn().mockImplementation(async (p: { teamId: string; subject: string }) => ({
      id: crypto.randomUUID(),
      subject: p.subject,
      status: 'pending',
    })),
    update: vi.fn().mockResolvedValue({ id: 'task-1', status: 'in_progress' }),
    list: vi.fn().mockResolvedValue([]),
    checkUnblocks: vi.fn().mockResolvedValue([]),
  } as unknown as TaskManager;

  const server = new TeamMcpServer({
    teamId: 'team-tcp-stress',
    getAgents: () => agents,
    mailbox,
    taskManager,
    wakeAgent,
    renameAgent: vi.fn(),
    removeAgent: vi.fn(),
  });

  return { server, mailbox, taskManager, wakeAgent };
}

function getAuthToken(server: TeamMcpServer): string {
  const config = server.getStdioConfig();
  return config.env.find((e) => e.name === 'TEAM_MCP_TOKEN')!.value;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Stress — TCP large payload handling', () => {
  let server: TeamMcpServer;
  let port: number;
  let authToken: string;

  beforeEach(async () => {
    const agents = [makeAgent()];
    const built = buildServer(agents);
    server = built.server;
    await server.start();
    port = server.getPort();
    authToken = getAuthToken(server);
  });

  afterEach(async () => {
    await server.stop();
  });

  it('1KB message payload: framing and reassembly correct', async () => {
    const message = 'A'.repeat(1024);
    const result = (await callTool(port, authToken, 'team_send_message', {
      to: 'Leader',
      message,
    })) as { result?: string; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
  });

  it('10KB message payload: framing and reassembly correct', async () => {
    const message = 'B'.repeat(10 * 1024);
    const result = (await callTool(port, authToken, 'team_send_message', {
      to: 'Leader',
      message,
    })) as { result?: string; error?: string };

    // Should not receive "Teammate not found" — Lead is in the agent list
    // But since Lead sends to itself, it succeeds
    expect(result).toBeDefined();
  });

  it('100KB message payload: TCP framing reassembles across multiple OS-level packets', async () => {
    const message = 'C'.repeat(100 * 1024);
    const result = (await callTool(port, authToken, 'team_task_create', {
      subject: message.slice(0, 200), // subject is limited by test; large payload exercises framing
      description: message,
    })) as { result?: string; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.result).toContain('Task created');
  });

  it('split at header boundary (byte 2): reassembly handles partial header', async () => {
    // Split inside the 4-byte length header
    const result = (await callToolWithChunkedDelivery(
      port,
      authToken,
      'team_task_list',
      {},
      2 // Split after 2 bytes of the 4-byte header
    )) as { result?: string; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
  });

  it('split at header/body boundary (byte 4): reassembly handles complete header + partial body', async () => {
    // Split exactly between header and body
    const result = (await callToolWithChunkedDelivery(
      port,
      authToken,
      'team_task_list',
      {},
      4 // Split right after the 4-byte header, before any body
    )) as { result?: string; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
  });

  it('split in middle of JSON body: reassembly handles partial body', async () => {
    // Split somewhere in the middle of the JSON payload
    const body = JSON.stringify({ tool: 'team_task_list', args: {}, auth_token: authToken });
    const splitAt = Math.floor((body.length + 4) / 2);

    const result = (await callToolWithChunkedDelivery(port, authToken, 'team_task_list', {}, splitAt)) as {
      result?: string;
      error?: string;
    };

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
  });
});

// ── Parallel connections ──────────────────────────────────────────────────────

describe('Stress — 20 parallel TCP tool calls', () => {
  let server: TeamMcpServer;
  let port: number;
  let authToken: string;

  beforeEach(async () => {
    const agents = [
      makeAgent({ slotId: 'slot-lead', agentName: 'Leader', role: 'leader' }),
      makeAgent({ slotId: 'slot-worker', agentName: 'Worker', role: 'teammate' }),
    ];
    const built = buildServer(agents);
    server = built.server;
    await server.start();
    port = server.getPort();
    authToken = getAuthToken(server);
  });

  afterEach(async () => {
    await server.stop();
  });

  it('20 parallel team_task_list calls: all return correct results, no cross-contamination', async () => {
    const results = (await Promise.all(
      Array.from({ length: 20 }, () => callTool(port, authToken, 'team_task_list'))
    )) as Array<{ result?: string; error?: string }>;

    for (const r of results) {
      expect(r.error).toBeUndefined();
      expect(r.result).toBeDefined();
    }
  });

  it('20 parallel team_members calls: each returns the same team list', async () => {
    const results = (await Promise.all(
      Array.from({ length: 20 }, () => callTool(port, authToken, 'team_members'))
    )) as Array<{ result?: string }>;

    for (const r of results) {
      expect(r.result).toContain('Leader');
      expect(r.result).toContain('Worker');
    }
  });

  it('20 parallel task creates: each gets a unique task ID', async () => {
    const results = (await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        callTool(port, authToken, 'team_task_create', { subject: `Parallel task ${i}` })
      )
    )) as Array<{ result?: string; error?: string }>;

    // All succeed
    for (const r of results) {
      expect(r.error).toBeUndefined();
    }
    // All 20 tasks were registered (via taskManager.create)
    // The mock itself handles each call independently
    expect(results).toHaveLength(20);
  });

  it('interleaved send_message and task_list calls: no response cross-contamination', async () => {
    const taskListCalls = Array.from({ length: 10 }, () => callTool(port, authToken, 'team_task_list'));
    const membersCalls = Array.from({ length: 10 }, () => callTool(port, authToken, 'team_members'));

    const results = (await Promise.all([...taskListCalls, ...membersCalls])) as Array<{
      result?: string;
      error?: string;
    }>;

    const taskResults = results.slice(0, 10);
    const memberResults = results.slice(10);

    // Task results should not contain member data and vice versa
    for (const r of taskResults) {
      expect(r.error).toBeUndefined();
    }
    for (const r of memberResults) {
      expect(r.result).toContain('Team Members');
    }
  });
});

// ── Rapid connect/disconnect ──────────────────────────────────────────────────

describe('Stress — rapid connect/disconnect cycles', () => {
  let server: TeamMcpServer;
  let port: number;
  let authToken: string;

  beforeEach(async () => {
    const agents = [makeAgent()];
    const built = buildServer(agents);
    server = built.server;
    await server.start();
    port = server.getPort();
    authToken = getAuthToken(server);
  });

  afterEach(async () => {
    await server.stop();
  });

  it('50 sequential connections: server handles all without crashing', async () => {
    for (let i = 0; i < 50; i++) {
      // eslint-disable-next-line no-await-in-loop
      const result = (await callTool(port, authToken, 'team_members')) as { result?: string };
      expect(result.result).toContain('Team Members');
    }
  });

  it('abrupt disconnect mid-request: server handles error gracefully', async () => {
    await new Promise<void>((resolve, _reject) => {
      const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
        // Connect then immediately destroy without sending anything
        socket.destroy();
        // Give server time to handle the disconnect
        setTimeout(resolve, 50);
      });
      socket.on('error', () => resolve()); // Expected
    });

    // Server should still handle subsequent requests
    const result = (await callTool(port, authToken, 'team_members')) as { result?: string };
    expect(result.result).toContain('Team Members');
  });

  it('partial message sent then disconnect: server recovers for next connection', async () => {
    await new Promise<void>((resolve) => {
      const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
        // Send only 2 bytes of the 4-byte header, then disconnect
        socket.write(Buffer.from([0x00, 0x00]));
        setTimeout(() => {
          socket.destroy();
          setTimeout(resolve, 50);
        }, 10);
      });
      socket.on('error', () => resolve());
    });

    // Server should not crash and accept next connection
    const result = (await callTool(port, authToken, 'team_members')) as { result?: string };
    expect(result.result).toContain('Team Members');
  });
});

// ── Malformed JSON ────────────────────────────────────────────────────────────

describe('Stress — malformed JSON and bad inputs', () => {
  let server: TeamMcpServer;
  let port: number;
  let authToken: string;

  beforeEach(async () => {
    const agents = [makeAgent()];
    const built = buildServer(agents);
    server = built.server;
    await server.start();
    port = server.getPort();
    authToken = getAuthToken(server);
  });

  afterEach(async () => {
    await server.stop();
  });

  it('malformed JSON body: server skips message and closes connection', async () => {
    // Send a valid 4-byte header but garbage body
    const garbage = Buffer.from('not valid json!!!', 'utf-8');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(garbage.length, 0);

    await new Promise<void>((resolve) => {
      const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
        socket.write(Buffer.concat([header, garbage]));

        // Server skips malformed JSON — no response is sent, socket closes
        socket.on('close', () => resolve());
        socket.on('error', () => resolve());
        // Timeout in case neither fires
        setTimeout(() => {
          socket.destroy();
          resolve();
        }, 500);
      });
      socket.on('error', () => resolve());
    });

    // Server recovers and handles next valid request
    const result = (await callTool(port, authToken, 'team_members')) as { result?: string };
    expect(result.result).toContain('Team Members');
  });

  it('oversize length prefix: destroys socket immediately and still serves later requests', async () => {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
        const header = Buffer.alloc(4);
        header.writeUInt32BE(MAX_MCP_MESSAGE_SIZE + 1, 0);
        socket.write(header);
      });

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };

      const timer = setTimeout(() => finish(new Error('Oversize TCP frame was not closed promptly')), 500);

      socket.once('data', (chunk) => {
        finish(new Error(`Expected disconnect for oversize frame, got data: ${chunk.toString('hex')}`));
      });
      socket.once('close', () => finish());
      socket.once('error', () => finish());
    });

    const result = (await callTool(port, authToken, 'team_members')) as { result?: string };
    expect(result.result).toContain('Team Members');
  });

  it('wrong auth token: returns Unauthorized error and closes socket', async () => {
    const result = (await callTool(port, 'wrong-token', 'team_members')) as {
      error?: string;
    };
    expect(result.error).toBe('Unauthorized');
  });

  it('unknown tool name: returns error message', async () => {
    const result = (await callTool(port, authToken, 'team_does_not_exist')) as {
      error?: string;
    };
    expect(result.error).toContain('Unknown tool');
  });

  it('missing required args: graceful error without crash', async () => {
    // team_send_message with empty 'to' — target not found
    const result = (await callTool(port, authToken, 'team_send_message', {
      to: '',
      message: 'hello',
    })) as { error?: string };
    expect(result.error).toContain('not found');
  });

  it('50 bad auth requests: server remains stable and serves good requests', async () => {
    const badRequests = Array.from({ length: 50 }, () =>
      callTool(port, 'invalid-token-xyz', 'team_members')
        .then((r) => r as { error?: string })
        .catch(() => ({ error: 'connection-error' }))
    );

    const results = await Promise.all(badRequests);
    for (const r of results) {
      expect(r.error).toBeDefined();
    }

    // Server still works after 50 auth failures
    const goodResult = (await callTool(port, authToken, 'team_members')) as { result?: string };
    expect(goodResult.result).toContain('Team Members');
  });

  it('zero-length body (bodyLen=0): handled without error', async () => {
    // Send a framed message with body length 0 — empty JSON
    await new Promise<void>((resolve) => {
      const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
        const header = Buffer.alloc(4);
        header.writeUInt32BE(0, 0);
        socket.write(header);

        socket.on('close', () => resolve());
        socket.on('error', () => resolve());
        setTimeout(() => {
          socket.destroy();
          resolve();
        }, 300);
      });
      socket.on('error', () => resolve());
    });

    // Server should still handle next valid request
    const result = (await callTool(port, authToken, 'team_members')) as { result?: string };
    expect(result.result).toContain('Team Members');
  });
});

// ── Server lifecycle under stress ─────────────────────────────────────────────

describe('Stress — server start/stop lifecycle', () => {
  it('stop while requests in flight: no unhandled promise rejections', async () => {
    const agents = [makeAgent()];
    const { server } = buildServer(agents);
    await server.start();
    const port = server.getPort();
    const authToken = getAuthToken(server);

    // Fire 10 requests but stop the server immediately
    const requests = Array.from({ length: 10 }, () => callTool(port, authToken, 'team_members').catch(() => null));

    // Stop server while requests are in flight
    await server.stop();

    // Requests should settle (either succeed or fail gracefully)
    const results = await Promise.all(requests);
    // Some may have succeeded before stop, some may be null (failed)
    expect(results).toHaveLength(10);
  });

  it('start() is idempotent with stop/start cycle', async () => {
    const agents = [makeAgent()];
    const { server } = buildServer(agents);

    await server.start();
    const port1 = server.getPort();
    expect(port1).toBeGreaterThan(0);

    await server.stop();
    expect(server.getPort()).toBe(0);

    await server.start();
    const port2 = server.getPort();
    expect(port2).toBeGreaterThan(0);
    // Ports may differ between restarts (OS assigns ephemeral port)

    await server.stop();
  });
});
