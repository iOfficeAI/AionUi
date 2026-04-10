/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AionMcpService — in-process MCP server that exposes team management tools
 * to solo ACP agents (claude / codex).
 *
 * Runs a TCP server inside the Electron main process. A standalone stdio script
 * (out/main/aion-mcp-stdio.js) bridges Claude CLI <-> TCP, matching the same
 * pattern used by TeamMcpServer.
 */

import * as crypto from 'node:crypto';
import * as net from 'node:net';
import * as path from 'node:path';
import { ipcBridge } from '@/common';
import type { TeamSessionService } from '@process/team/TeamSessionService';
import type { StdioMcpConfig } from '@process/team/TeamMcpServer';
import { TEAM_SUPPORTED_BACKENDS } from '@/common/types/teamTypes';
import { getConversationTypeForBackend } from '@/common/utils/buildAgentConversationParams';

/** Allowed route patterns that aion_navigate may redirect to */
const ALLOWED_ROUTE_PATTERNS: RegExp[] = [/^\/team\/[a-zA-Z0-9_-]+$/, /^\/conversation\/[a-zA-Z0-9_-]+$/];

function isAllowedRoute(route: string): boolean {
  return ALLOWED_ROUTE_PATTERNS.some((pattern) => pattern.test(route));
}

// ── TCP message helpers ───────────────────────────────────────────────────────

function writeTcpMessage(socket: net.Socket, data: unknown): void {
  const json = JSON.stringify(data);
  const body = Buffer.from(json, 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  socket.write(Buffer.concat([header, body]));
}

function createTcpMessageReader(onMessage: (msg: unknown) => void): (chunk: Buffer) => void {
  let buffer = Buffer.alloc(0);

  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 4) {
      const bodyLen = buffer.readUInt32BE(0);
      if (buffer.length < 4 + bodyLen) break;

      const jsonStr = buffer.subarray(4, 4 + bodyLen).toString('utf-8');
      buffer = buffer.subarray(4 + bodyLen);

      try {
        const msg = JSON.parse(jsonStr);
        onMessage(msg);
      } catch {
        // Malformed JSON — skip
      }
    }
  };
}

/**
 * Resolve the directory containing the aion-mcp-stdio.js bundle.
 * Mirrors resolveTeamMcpDir() in TeamMcpServer.ts.
 *
 * In dev:       out/main/
 * In packaged:  app.asar.unpacked/out/main/
 */
function resolveAionMcpDir(): string {
  const mainModuleDir =
    typeof require !== 'undefined' && require.main?.filename ? path.dirname(require.main.filename) : __dirname;
  const baseDir = path.basename(mainModuleDir) === 'chunks' ? path.dirname(mainModuleDir) : mainModuleDir;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    if (app.isPackaged) {
      return baseDir.replace('app.asar', 'app.asar.unpacked');
    }
  } catch {
    // Not in Electron (unit tests / CLI mode) — use baseDir as-is
  }
  return baseDir;
}

/**
 * Singleton in-process MCP server for Aion team management tools.
 * Uses TCP transport + a stdio bridge script, same as TeamMcpServer.
 * Call `start()` once on app boot; `stop()` on app quit.
 */
export class AionMcpService {
  private tcpServer: net.Server | null = null;
  private _port = 0;
  private readonly authToken = crypto.randomUUID();
  private teamSessionService: TeamSessionService;

  constructor(teamSessionService: TeamSessionService) {
    this.teamSessionService = teamSessionService;
  }

  /** Start the TCP server and return stdio config for injection into ACP sessions. */
  async start(): Promise<StdioMcpConfig> {
    this.tcpServer = net.createServer((socket) => {
      this.handleTcpConnection(socket);
    });

    await new Promise<void>((resolve, reject) => {
      this.tcpServer!.listen(0, '127.0.0.1', () => {
        const addr = this.tcpServer!.address();
        if (addr && typeof addr === 'object') {
          this._port = addr.port;
        }
        resolve();
      });
      this.tcpServer!.once('error', reject);
    });

    console.log(`[AionMcpService] TCP server started on port ${this._port}`);
    return this.getStdioConfig();
  }

  /** Stop the TCP server. */
  async stop(): Promise<void> {
    if (this.tcpServer) {
      await new Promise<void>((resolve) => {
        this.tcpServer!.close(() => {
          console.log('[AionMcpService] TCP server stopped');
          this.tcpServer = null;
          resolve();
        });
      });
    }
    this._port = 0;
  }

  /** Build the stdio MCP config to inject into session/new. */
  getStdioConfig(): StdioMcpConfig {
    const scriptPath = path.join(resolveAionMcpDir(), 'aion-mcp-stdio.js');
    return {
      name: 'aionui-team-guide',
      command: 'node',
      args: [scriptPath],
      env: [
        { name: 'AION_MCP_PORT', value: String(this._port) },
        { name: 'AION_MCP_TOKEN', value: this.authToken },
      ],
    };
  }

  // ── TCP connection handler ────────────────────────────────────────────────

  private handleTcpConnection(socket: net.Socket): void {
    const reader = createTcpMessageReader(async (msg) => {
      const request = msg as {
        tool?: string;
        args?: Record<string, unknown>;
        auth_token?: string;
        /** Backend type of the calling agent, injected by aion-mcp-stdio via AION_MCP_BACKEND env var */
        backend?: string;
      };

      if (request.auth_token !== this.authToken) {
        writeTcpMessage(socket, { error: 'Unauthorized' });
        socket.end();
        return;
      }

      const toolName = request.tool ?? '';
      const args = request.args ?? {};

      try {
        const result = await this.handleToolCall(toolName, args, request.backend);
        writeTcpMessage(socket, { result });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        writeTcpMessage(socket, { error: errMsg });
      }
      socket.end();
    });

    socket.on('data', reader);
    socket.on('error', () => {
      // Connection errors are expected (e.g., client disconnect)
    });
  }

  // ── Tool dispatch ─────────────────────────────────────────────────────────

  private async handleToolCall(toolName: string, args: Record<string, unknown>, backend?: string): Promise<string> {
    switch (toolName) {
      case 'aion_create_team':
        return this.handleCreateTeam(args, backend);
      case 'aion_navigate':
        return this.handleNavigate(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async handleCreateTeam(args: Record<string, unknown>, backend?: string): Promise<string> {
    const summary = String(args.summary ?? '').trim();
    const name = args.name ? String(args.name).trim() : undefined;
    const workspace = args.workspace ? String(args.workspace).trim() : '';

    if (!summary) {
      throw new Error('summary is required');
    }

    // Use system-injected backend (from AION_MCP_BACKEND env var) as the authoritative agent type.
    // Falls back to 'claude' only when the backend is unknown or not in the whitelist.
    const agentType = backend && TEAM_SUPPORTED_BACKENDS.has(backend) ? backend : 'claude';

    const teamName = name || summary.split(/\s+/).slice(0, 5).join(' ');
    const userId = 'system_default_user';

    const team = await this.teamSessionService.createTeam({
      userId,
      name: teamName,
      workspace,
      workspaceMode: 'shared',
      sessionMode: 'yolo',
      agents: [
        {
          slotId: '',
          conversationId: '',
          role: 'lead',
          agentType,
          agentName: 'Leader',
          conversationType: getConversationTypeForBackend(agentType),
          status: 'pending',
        },
      ],
    });

    const leadAgent = team.agents.find((a) => a.role === 'lead');
    const route = `/team/${team.id}`;

    // Notify frontend to refresh team list
    ipcBridge.team.listChanged.emit({ teamId: team.id, action: 'created' });

    // Fire-and-forget: start session and send message in background
    void (async () => {
      try {
        const session = await this.teamSessionService.getOrStartSession(team.id);
        if (leadAgent) {
          await session.sendMessageToAgent(leadAgent.slotId, summary);
        }
      } catch (err) {
        console.error('[AionMcpService] async session/message failed:', err);
      }
    })();

    return JSON.stringify({
      teamId: team.id,
      name: team.name,
      route,
      leadAgent: leadAgent ? { slotId: leadAgent.slotId, conversationId: leadAgent.conversationId } : null,
      status: 'team_created',
      next_step: `Tell the user the team has been created, then call aion_navigate with route "${route}" to take them to the team page.`,
    });
  }

  private handleNavigate(args: Record<string, unknown>): string {
    const route = String(args.route ?? '').trim();

    if (!isAllowedRoute(route)) {
      throw new Error(`route "${route}" is not allowed. Permitted patterns: /team/:id, /conversation/:id`);
    }

    ipcBridge.deepLink.received.emit({ action: 'navigate', params: { route } });
    return JSON.stringify({ success: true });
  }
}
