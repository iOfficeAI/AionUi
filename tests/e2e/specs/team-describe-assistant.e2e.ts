/**
 * E2E: team_describe_assistant (and follow-up team_spawn_agent) via the real
 * TeamMcpServer TCP bridge.
 *
 * What we're exercising (and why unit tests weren't enough):
 *   - The MCP tool is registered in the stdio bridge (`teamMcpStdio.ts`) and
 *     dispatched by the TCP server in `TeamMcpServer.ts`. Unit tests only
 *     reach into the server handler — they never exercise the length-prefixed
 *     TCP framing, the auth-token check, or the stdio-side registration.
 *   - A teammate spawned via `custom_agent_id` needs the server to resolve
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
 *      response. Call `team_describe_assistant` with a known preset id,
 *      then `team_spawn_agent` with the same id.
 *   4. Assert the describe response contains the preset's name + skills
 *      + "team_spawn_agent" hint, and that the spawn adds a teammate with
 *      the correct `customAgentId`.
 *   5. Cleanup via `team.remove`.
 *
 * Why not hit the tool through the leader agent? Leader inference is
 * non-deterministic and slow (~2-3 min); asserting on natural-language
 * output is flaky. The MCP TCP endpoint is the deterministic surface.
 */
import * as net from 'node:net';
import { test, expect } from '../fixtures';
import { invokeBridge } from '../helpers';
import type { TTeam } from '@/common/types/teamTypes';

type TcpReply = { result?: string; error?: string };
type StdioEnvEntry = { name?: string; value?: string };
type StdioConfig = { env?: StdioEnvEntry[] };
type LeaderConversation = { id?: string; extra?: { teamMcpStdioConfig?: StdioConfig } } | null;

// Preferred presets to probe (in priority order). The test resolves to
// whichever one is currently enabled in this environment by asking the MCP
// server to describe each candidate and taking the first that succeeds.
// Preset enabled-state persists across E2E runs, so a user (or a prior test)
// that disabled "word-creator" would break a hardcoded id.
const PREFERRED_PRESET_IDS = [
  'builtin-cowork',
  'builtin-word-creator',
  'builtin-ppt-creator',
  'builtin-excel-creator',
] as const;

/** Write one length-prefixed JSON frame, wait for one reply, close. */
function sendFramedRequest(port: number, payload: Record<string, unknown>, timeoutMs = 15_000): Promise<TcpReply> {
  return new Promise<TcpReply>((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      const body = Buffer.from(JSON.stringify(payload), 'utf-8');
      const frame = Buffer.allocUnsafe(4 + body.length);
      frame.writeUInt32BE(body.length, 0);
      body.copy(frame, 4);
      socket.write(frame);
    });

    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const finish = (err: Error | null, value?: TcpReply): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(value as TcpReply);
    };

    socket.on('data', (chunk) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total < 4) return;
      const header = Buffer.concat(chunks, total);
      const bodyLen = header.readUInt32BE(0);
      if (total < 4 + bodyLen) return;
      const body = header.subarray(4, 4 + bodyLen).toString('utf-8');
      try {
        finish(null, JSON.parse(body) as TcpReply);
      } catch (parseErr) {
        finish(parseErr as Error);
      }
    });

    socket.on('error', (err) => finish(err));
    socket.on('end', () => finish(new Error('TCP connection ended before response')));
    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => finish(new Error('TCP request timeout')));
  });
}

function readEnv(env: StdioEnvEntry[] | undefined, name: string): string | undefined {
  return env?.find((e) => e.name === name)?.value;
}

test.describe('Team MCP - team_describe_assistant', () => {
  test('describes a preset and then spawns it as a teammate via the real TCP bridge', async ({ page }) => {
    test.setTimeout(90_000);

    let createdTeamId: string | undefined;

    try {
      // ── 1. Create team (gemini leader; any backend works, we only need MCP) ──
      const created = await invokeBridge<{ id: string } | null>(page, 'team.create', {
        userId: 'system_default_user',
        name: `E2E Describe Assistant ${Date.now()}`,
        workspace: '',
        workspaceMode: 'shared',
        agents: [
          {
            slotId: 'slot-lead',
            conversationId: '',
            role: 'leader',
            agentType: 'gemini',
            agentName: 'Leader',
            conversationType: 'gemini',
            status: 'idle',
          },
        ],
      }).catch(() => null);

      if (!created?.id) {
        test.skip(true, 'Could not create a gemini-led team (gemini backend likely missing in env)');
        return;
      }
      createdTeamId = created.id;

      // Starting the session is what boots the TCP MCP server and writes the
      // stdio config into the leader's conversation extra.
      await invokeBridge(page, 'team.ensure-session', { teamId: createdTeamId });

      // ── 2. Read the port + auth token from the leader conversation ───────
      const team = await invokeBridge<TTeam | null>(page, 'team.get', { id: createdTeamId });
      expect(team, 'team.get should return the freshly-created team').toBeTruthy();
      const leader = team!.agents.find((a) => a.role === 'leader');
      expect(leader?.conversationId, 'leader must have a conversation id').toBeTruthy();

      const leaderConv = await invokeBridge<LeaderConversation>(page, 'get-conversation', {
        id: leader!.conversationId,
      });
      const env = leaderConv?.extra?.teamMcpStdioConfig?.env;
      const portStr = readEnv(env, 'TEAM_MCP_PORT');
      const token = readEnv(env, 'TEAM_MCP_TOKEN');
      expect(portStr, 'teamMcpStdioConfig must expose TEAM_MCP_PORT').toBeTruthy();
      expect(token, 'teamMcpStdioConfig must expose TEAM_MCP_TOKEN').toBeTruthy();
      const port = parseInt(portStr!, 10);
      expect(Number.isFinite(port) && port > 0).toBe(true);

      // ── 3a. Resolve a preset that's currently enabled in this env ────────
      // We try each candidate; the first one that returns a non-error describe
      // payload wins. This keeps the test robust against user config drift.
      let presetId: string | undefined;
      let describeText: string | undefined;
      const describeErrors: string[] = [];
      for (const candidate of PREFERRED_PRESET_IDS) {
        const reply = await sendFramedRequest(port, {
          tool: 'team_describe_assistant',
          args: { custom_agent_id: candidate, locale: 'en-US' },
          auth_token: token,
          from_slot_id: leader!.slotId,
        });
        if (!reply.error && reply.result) {
          presetId = candidate;
          describeText = reply.result;
          break;
        }
        describeErrors.push(`${candidate}: ${reply.error ?? '<empty result>'}`);
      }
      expect(presetId, `no preferred preset was enabled (tried: ${describeErrors.join('; ')})`).toBeTruthy();
      expect(describeText).toContain(presetId!);
      expect(describeText).toContain('Backend: gemini');
      expect(describeText).toContain('## Description');
      expect(describeText).toContain('## Skills');
      expect(describeText).toContain('## Example tasks');
      expect(describeText).toContain('team_spawn_agent');
      expect(describeText).toContain(`custom_agent_id="${presetId}"`);

      // ── 3b. Reject bogus auth token (defence-in-depth smoke test) ────────
      const unauthorizedReply = await sendFramedRequest(port, {
        tool: 'team_describe_assistant',
        args: { custom_agent_id: presetId },
        auth_token: 'not-the-real-token',
      });
      expect(unauthorizedReply.error).toContain('Unauthorized');

      // ── 3c. Surface a useful error when preset id is unknown ─────────────
      const notFoundReply = await sendFramedRequest(port, {
        tool: 'team_describe_assistant',
        args: { custom_agent_id: 'builtin-does-not-exist' },
        auth_token: token,
      });
      expect(notFoundReply.error, 'unknown preset must error').toBeTruthy();
      expect(notFoundReply.error).toMatch(/not found/i);

      // ── 4. team_spawn_agent using the same custom_agent_id ───────────────
      const teammateName = `doc-writer-${Date.now()}`;
      const spawnReply = await sendFramedRequest(
        port,
        {
          tool: 'team_spawn_agent',
          args: { name: teammateName, custom_agent_id: presetId },
          auth_token: token,
          from_slot_id: leader!.slotId,
        },
        30_000
      );
      expect(spawnReply.error, 'spawn should not error').toBeFalsy();
      expect(spawnReply.result).toContain(teammateName);

      // Backend verification: team now has two agents, and the new one
      // carries the expected preset metadata.
      const teamAfterSpawn = await invokeBridge<TTeam | null>(page, 'team.get', { id: createdTeamId });
      expect(teamAfterSpawn?.agents.length).toBe(2);
      const spawned = teamAfterSpawn!.agents.find((a) => a.agentName === teammateName);
      expect(spawned, 'spawned teammate must be present').toBeTruthy();
      expect(spawned!.customAgentId).toBe(presetId);
      expect(spawned!.agentType).toBe('gemini'); // preset backend wins
    } finally {
      if (createdTeamId) {
        await invokeBridge(page, 'team.remove', { id: createdTeamId }).catch(() => {});
      }
    }
  });
});
