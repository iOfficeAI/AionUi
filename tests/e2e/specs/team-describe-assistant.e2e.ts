/**
 * E2E: team_describe_assistant (and follow-up team_spawn_agent) via the real
 * TeamMcpServer TCP bridge.
 *
 * What we're exercising (and why unit tests weren't enough):
 *   - The MCP tool is registered in the stdio bridge (`teamMcpStdio.ts`) and
 *     dispatched by the TCP server in `TeamMcpServer.ts`. Unit tests only
 *     reach into the server handler — they never exercise the length-prefixed
 *     TCP framing, the auth-token check, or the stdio-side registration.
 *   - A teammate spawned via `assistant_id` needs the server to resolve
 *     the preset backend from config and hand a real `TeamAgent` back to
 *     the caller. This E2E walks the whole path end-to-end.
 *
 * Flow:
 *   1. Create a minimal team via `team.create` + `team.ensureSession` bridges
 *      (so the TCP server starts and the leader's conversation gets
 *      `extra.teamMcpStdioConfig` written).
 *   2. Pull the port + auth token from the leader conversation's
 *      `teamMcpStdioConfig.env` — the same info the stdio bridge would get.
 *   3. Open a raw TCP socket from the Playwright worker and speak the MCP
 *      frame protocol directly: one framed JSON request, one framed JSON
 *      response. Call `team_describe_assistant` with a known assistant id,
 *      then `team_spawn_agent` with the same id.
 *   4. Assert the describe response contains the preset's name + skills
 *      + "team_spawn_agent" hint, and that the spawn adds a teammate with
 *      the correct `assistantId`.
 *   5. Cleanup via `team.remove`.
 *
 * Why not hit the tool through the leader assistant? Leader inference is
 * non-deterministic and slow (~2-3 min); asserting on natural-language
 * output is flaky. The MCP TCP endpoint is the deterministic surface.
 */
import * as net from 'node:net';
import { test, expect } from '../fixtures';
import { createTeam, invokeBridge } from '../helpers';
import type { ITeamRunAck } from '@/common/types/team/teamTypes';

type JsonRpcError = { code?: number; message?: string };
type JsonRpcContent = { type?: string; text?: string };
type JsonRpcResult = {
  serverInfo?: { name?: string };
  content?: JsonRpcContent[];
  isError?: boolean;
};
type TcpReply = { result?: JsonRpcResult; error?: JsonRpcError };
type StdioEnvEntry = { name?: string; value?: string };
type StdioConfig = { env?: StdioEnvEntry[] };
type LeaderConversation = { id?: string; extra?: { teamMcpStdioConfig?: StdioConfig } } | null;

/** Backend /api/teams/:id GET response shape — aligns with aioncore schema. */
type TTeamBackendAgent = {
  slot_id: string;
  conversation_id: string;
  role: string;
  name: string;
  backend: string;
  assistant_backend?: string;
  model: string;
  status: string;
  assistant_id?: string;
  custom_agent_id?: string;
};
type TTeam = {
  id: string;
  name: string;
  assistants?: TTeamBackendAgent[];
  agents?: TTeamBackendAgent[];
};

// Preferred presets to probe (in priority order). The test resolves to
// whichever one is currently enabled in this environment by asking the MCP
// server to describe each candidate and taking the first that succeeds.
// Preset enabled-state persists across E2E runs, so a user (or a prior test)
// that disabled "word-creator" would break a hardcoded id.
const PREFERRED_PRESET_IDS = ['cowork', 'word-creator', 'ppt-creator', 'excel-creator'] as const;

class FramedTcpClient {
  private readonly socket: net.Socket;
  private buffer = Buffer.alloc(0);
  private waiting:
    | {
        resolve: (reply: TcpReply) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  private readonly timeoutMs: number;

  constructor(socket: net.Socket, timeoutMs = 15_000) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.socket.setTimeout(timeoutMs);
    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flush();
    });
    this.socket.on('error', (error) => this.fail(error));
    this.socket.on('end', () => this.fail(new Error('TCP connection ended before response')));
    this.socket.on('timeout', () => this.fail(new Error('TCP request timeout')));
  }

  private flush(): void {
    if (!this.waiting || this.buffer.length < 4) return;
    const bodyLen = this.buffer.readUInt32BE(0);
    if (this.buffer.length < 4 + bodyLen) return;
    const body = this.buffer.subarray(4, 4 + bodyLen).toString('utf-8');
    this.buffer = this.buffer.subarray(4 + bodyLen);
    const waiting = this.waiting;
    this.waiting = undefined;
    try {
      waiting.resolve(JSON.parse(body) as TcpReply);
    } catch (error) {
      waiting.reject(error as Error);
    }
  }

  private fail(error: Error): void {
    if (!this.waiting) return;
    const waiting = this.waiting;
    this.waiting = undefined;
    waiting.reject(error);
  }

  async request(payload: Record<string, unknown>): Promise<TcpReply> {
    const body = Buffer.from(JSON.stringify(payload), 'utf-8');
    const frame = Buffer.allocUnsafe(4 + body.length);
    frame.writeUInt32BE(body.length, 0);
    body.copy(frame, 4);

    const response = new Promise<TcpReply>((resolve, reject) => {
      this.waiting = { resolve, reject };
      this.flush();
    });

    this.socket.write(frame);
    return await response;
  }

  close(): void {
    this.socket.destroy();
  }
}

function connectFramedClient(port: number, timeoutMs = 15_000): Promise<FramedTcpClient> {
  return new Promise<FramedTcpClient>((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      resolve(new FramedTcpClient(socket, timeoutMs));
    });
    socket.once('error', reject);
  });
}

async function mcpConnect(port: number, authToken: string, slotId: string): Promise<FramedTcpClient> {
  const client = await connectFramedClient(port);
  const initReply = await client.request({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      auth_token: authToken,
      slot_id: slotId,
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'playwright-e2e', version: '0.1' },
    },
  });

  if (!initReply.result?.serverInfo?.name) {
    client.close();
    throw new Error(`initialize failed: ${JSON.stringify(initReply)}`);
  }

  return client;
}

async function mcpCallTool(
  client: FramedTcpClient,
  id: number,
  toolName: string,
  args: Record<string, unknown>
): Promise<TcpReply> {
  return await client.request({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  });
}

function mcpText(reply: TcpReply): string {
  return reply.result?.content?.[0]?.text ?? '';
}

function mcpErrorText(reply: TcpReply): string {
  return reply.error?.message ?? mcpText(reply);
}

function readEnv(env: StdioEnvEntry[] | undefined, name: string): string | undefined {
  return env?.find((e) => e.name === name)?.value;
}

test.describe('Team MCP - team_describe_assistant', () => {
  test('describes a preset and then spawns it as a teammate via the real TCP bridge', async ({ page }) => {
    test.setTimeout(90_000);

    let createdTeamId: string | undefined;

    try {
      // ── 1. Create team through the assistant-only UI flow ─────────────────
      try {
        createdTeamId = await createTeam(page, `E2E Describe Assistant ${Date.now()}`, 'gemini');
      } catch (error) {
        test.skip(
          true,
          `Could not create a gemini generated-assistant led team (gemini assistant likely unavailable): ${(error as Error).message}`
        );
        return;
      }

      // Starting the session is what boots the TCP MCP server and writes the
      // stdio config into the leader's conversation extra.
      await invokeBridge(page, 'team.ensure-session', { team_id: createdTeamId });

      // ── 2. Read the port + auth token from the leader conversation ───────
      const team = await invokeBridge<TTeam | null>(page, 'team.get', { id: createdTeamId });
      expect(team, 'team.get should return the freshly-created team').toBeTruthy();
      const teamAssistants = team!.assistants ?? team!.agents ?? [];
      const leader = teamAssistants.find((a) => a.role === 'lead' || a.role === 'leader');
      expect(leader?.conversation_id, 'leader must have a conversation id').toBeTruthy();

      const leaderConv = await invokeBridge<LeaderConversation>(page, 'get-conversation', {
        id: leader!.conversation_id,
      });
      const env = leaderConv?.extra?.teamMcpStdioConfig?.env;
      const portStr = readEnv(env, 'TEAM_MCP_PORT');
      const token = readEnv(env, 'TEAM_MCP_TOKEN');
      expect(portStr, 'teamMcpStdioConfig must expose TEAM_MCP_PORT').toBeTruthy();
      expect(token, 'teamMcpStdioConfig must expose TEAM_MCP_TOKEN').toBeTruthy();
      const port = parseInt(portStr!, 10);
      expect(Number.isFinite(port) && port > 0).toBe(true);

      // Wake the leader once so the team has an active run before the MCP
      // tool tries to persist a spawned teammate into that run's scope.
      const runAck = await invokeBridge<ITeamRunAck | null>(page, 'team.send-message', {
        team_id: createdTeamId,
        input: 'Please acknowledge this setup message.',
      });
      expect(runAck?.team_run_id, 'team.send-message should create an active run').toBeTruthy();
      expect(runAck?.team_id).toBe(createdTeamId);

      const client = await mcpConnect(port, token!, leader!.slot_id);
      try {
        // ── 3a. Resolve a preset that's currently enabled in this env ────────
        // We try each candidate; the first one that returns a non-error describe
        // payload wins. This keeps the test robust against user config drift.
        let presetId: string | undefined;
        let describeText: string | undefined;
        const describeErrors: string[] = [];
        let requestId = 10;
        for (const candidate of PREFERRED_PRESET_IDS) {
          const reply = await mcpCallTool(client, requestId++, 'team_describe_assistant', {
            assistant_id: candidate,
            locale: 'en-US',
          });
          if (!reply.result?.isError) {
            presetId = candidate;
            describeText = mcpText(reply);
            break;
          }
          describeErrors.push(`${candidate}: ${mcpErrorText(reply) || '<empty result>'}`);
        }
        expect(presetId, `no preferred preset was enabled (tried: ${describeErrors.join('; ')})`).toBeTruthy();
        expect(describeText).toContain(presetId!);
        expect(describeText).toContain('Backend: aionrs');
        expect(describeText).toContain('## Description');
        expect(describeText).toContain('## Skills');
        expect(describeText).toContain('## Example tasks');
        expect(describeText).toContain('team_spawn_agent');
        expect(describeText).toContain(`assistant_id="${presetId}"`);

        // ── 3b. Reject bogus auth token (defence-in-depth smoke test) ────────
        const unauthorizedClient = await connectFramedClient(port);
        try {
          const unauthorizedReply = await unauthorizedClient.request({
            jsonrpc: '2.0',
            id: 2,
            method: 'initialize',
            params: {
              auth_token: 'not-the-real-token',
              slot_id: leader!.slot_id,
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: { name: 'playwright-e2e', version: '0.1' },
            },
          });
          expect(mcpErrorText(unauthorizedReply)).toContain('Authentication failed');
        } finally {
          unauthorizedClient.close();
        }

        // ── 3c. Surface a useful error when preset id is unknown ─────────────
        const notFoundReply = await mcpCallTool(client, requestId++, 'team_describe_assistant', {
          assistant_id: 'does-not-exist',
        });
        expect(notFoundReply.result?.isError, 'unknown preset must error').toBe(true);
        expect(mcpText(notFoundReply)).toMatch(/not found/i);

        // ── 4. team_spawn_agent using the same assistant_id ──────────────────
        const teammateName = `doc-writer-${Date.now()}`;
        const spawnReply = await mcpCallTool(client, requestId++, 'team_spawn_agent', {
          name: teammateName,
          assistant_id: presetId,
        });
        expect(spawnReply.result?.isError, 'spawn should not error').toBeFalsy();
        expect(mcpText(spawnReply)).toContain(teammateName);

        // Backend verification: team now has two agents, and the new one
        // carries the expected preset metadata.
        const teamAfterSpawn = await invokeBridge<TTeam | null>(page, 'team.get', { id: createdTeamId });
        const assistantsAfterSpawn = teamAfterSpawn?.assistants ?? teamAfterSpawn?.agents ?? [];
        expect(assistantsAfterSpawn.length).toBe(2);
        const spawned = assistantsAfterSpawn.find((a) => a.name === teammateName);
        expect(spawned, 'spawned teammate must be present').toBeTruthy();
        expect(spawned!.assistant_id).toBe(presetId);
        expect(spawned!.custom_agent_id).toBeUndefined();
        expect(spawned!.assistant_backend ?? spawned!.backend).toBe('aionrs'); // preset backend wins
      } finally {
        client.close();
      }
    } finally {
      if (createdTeamId) {
        await invokeBridge(page, 'team.remove', { id: createdTeamId }).catch(() => {});
      }
    }
  });
});
