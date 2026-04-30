/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TeamGuideMcpServer — in-process MCP server that exposes team management tools
 * to solo ACP agents (claude / codex).
 *
 * Runs a TCP server inside the Electron main process. A standalone stdio script
 * (out/main/team-guide-mcp-stdio.js) bridges Claude CLI <-> TCP, matching the same
 * pattern used by TeamMcpServer.
 */

import * as crypto from 'node:crypto';
import * as net from 'node:net';
import * as path from 'node:path';
import { ipcBridge } from '@/common';
import type { TTeam } from '@process/team/types';
import type { StdioMcpConfig } from '../team/TeamMcpServer';
import { isTeamCapableBackend } from '@/common/types/teamTypes';
import { ProcessConfig } from '@process/utils/initStorage';
import { getConversationTypeForBackend } from '@/common/utils/buildAgentConversationParams';
import { handleListModels } from '../modelListHandler';
import { writeTcpMessage, createTcpMessageReader, resolveMcpScriptDir } from '../tcpHelpers';

export type TeamGuideRuntime = {
  createTeam: (params: {
    user_id: string;
    name: string;
    workspace: string;
    workspace_mode: 'shared' | 'isolated';
    agents: Array<{
      slot_id: string;
      conversation_id: string;
      role: 'leader' | 'teammate';
      agent_type: string;
      agent_name: string;
      conversation_type: string;
      status: 'pending' | 'idle' | 'active' | 'completed' | 'failed';
      model?: string;
      cli_path?: string;
      custom_agent_id?: string;
    }>;
  }) => Promise<TTeam>;
  ensureSession: (team_id: string) => Promise<void>;
  sendMessageToAgent: (
    team_id: string,
    slot_id: string,
    content: string,
    options?: { silent?: boolean; files?: string[] }
  ) => Promise<void>;
};

const defaultRuntime: TeamGuideRuntime = {
  createTeam: (params) => ipcBridge.team.create.invoke(params),
  ensureSession: (team_id) => ipcBridge.team.ensureSession.invoke({ team_id }),
  sendMessageToAgent: (team_id, slot_id, content, options) =>
    ipcBridge.team.sendMessageToAgent.invoke({
      team_id,
      slot_id,
      content,
      files: options?.files,
    }),
};

/**
 * Singleton in-process MCP server for Aion team management tools.
 * Uses TCP transport + a stdio bridge script, same as TeamMcpServer.
 * Call `start()` once on app boot; `stop()` on app quit.
 */
export class TeamGuideMcpServer {
  private tcpServer: net.Server | null = null;
  private _port = 0;
  private readonly authToken = crypto.randomUUID();

  constructor(private readonly runtime: TeamGuideRuntime = defaultRuntime) {}

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

    console.log(`[TeamGuideMcpServer] TCP server started on port ${this._port}`);
    return this.getStdioConfig();
  }

  /** Stop the TCP server. */
  async stop(): Promise<void> {
    if (this.tcpServer) {
      await new Promise<void>((resolve) => {
        this.tcpServer!.close(() => {
          console.log('[TeamGuideMcpServer] TCP server stopped');
          this.tcpServer = null;
          resolve();
        });
      });
    }
    this._port = 0;
  }

  /** Build the stdio MCP config to inject into session/new. */
  getStdioConfig(): StdioMcpConfig {
    const scriptPath = path.join(resolveMcpScriptDir(), 'team-guide-mcp-stdio.js');
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
    const reader = createTcpMessageReader(
      async (msg) => {
        const request = msg as {
          tool?: string;
          args?: Record<string, unknown>;
          auth_token?: string;
          /** Backend type of the calling agent, injected by team-guide-mcp-stdio via AION_MCP_BACKEND env var */
          backend?: string;
          /** Conversation ID of the calling agent, used to reuse conversation as team leader */
          conversation_id?: string;
        };

        if (request.auth_token !== this.authToken) {
          writeTcpMessage(socket, { error: 'Unauthorized' });
          socket.end();
          return;
        }

        const tool_name = request.tool ?? '';
        const args = request.args ?? {};

        try {
          const result = await this.handleToolCall(tool_name, args, request.backend, request.conversation_id);
          writeTcpMessage(socket, { result });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          writeTcpMessage(socket, { error: errMsg });
        }
        socket.end();
      },
      {
        // Drop the connection on framing corruption — see TeamMcpServer.ts for rationale.
        onError: (err) => {
          console.warn(`[TeamGuideMcpServer] TCP framing error: ${err.message}`);
          socket.destroy();
        },
      }
    );

    socket.on('data', reader);
    socket.on('error', () => {
      // Connection errors are expected (e.g., client disconnect)
      socket.destroy();
    });
    socket.setTimeout(600_000);
    socket.on('timeout', () => {
      console.warn('[TeamGuideMcpServer] TCP socket idle timeout, destroying');
      socket.destroy();
    });
  }

  // ── Tool dispatch ─────────────────────────────────────────────────────────

  private async handleToolCall(
    tool_name: string,
    args: Record<string, unknown>,
    backend?: string,
    callerConversationId?: string
  ): Promise<string> {
    switch (tool_name) {
      case 'aion_create_team':
        return this.handleCreateTeam(args, backend, callerConversationId);
      case 'aion_list_models':
        return handleListModels(args);
      default:
        throw new Error(`Unknown tool: ${tool_name}`);
    }
  }

  private async handleCreateTeam(
    args: Record<string, unknown>,
    backend?: string,
    callerConversationId?: string
  ): Promise<string> {
    const summary = String(args.summary ?? '').trim();
    const name = args.name ? String(args.name).trim() : undefined;
    let workspace = args.workspace ? String(args.workspace).trim() : '';

    if (!summary) {
      throw new Error('summary is required');
    }

    // When no workspace is provided but a caller conversation exists (single-chat → team),
    // inherit the workspace from the caller's conversation to avoid overwriting it with ''.
    if (!workspace && callerConversationId) {
      const conversation = await ipcBridge.conversation.get
        .invoke({ id: callerConversationId })
        .catch((): null => null);
      const callerWorkspace = (conversation?.extra as Record<string, unknown> | undefined)?.workspace;
      if (typeof callerWorkspace === 'string' && callerWorkspace.trim().length > 0) {
        workspace = callerWorkspace;
      }
    }

    // Use system-injected backend (from AION_MCP_BACKEND env var) as the authoritative agent type.
    // Falls back to 'claude' only when the backend is unknown or not in the whitelist.
    const cachedInitResults = await ProcessConfig.get('acp.cachedInitializeResult');
    const agent_type = backend && isTeamCapableBackend(backend, cachedInitResults) ? backend : 'claude';

    const teamName = name || summary.split(/\s+/).slice(0, 5).join(' ');
    const user_id = 'system_default_user';

    const team = await this.runtime.createTeam({
      user_id,
      name: teamName,
      workspace,
      workspace_mode: 'shared',
      agents: [
        {
          slot_id: '',
          conversation_id: callerConversationId || '',
          role: 'leader',
          agent_type,
          agent_name: 'Leader',
          conversation_type: getConversationTypeForBackend(agent_type),
          status: 'pending',
        },
      ],
    });

    const leadAgent = team.agents.find((a) => a.role === 'leader');
    const route = `/team/${team.id}`;

    // Navigate to team page immediately after creation.
    ipcBridge.deepLink.received.emit({ action: 'navigate', params: { route } });

    // Fire-and-forget: start session in background.
    // getOrStartSession rebuilds the leader's agent task with team MCP tools (skipCache).
    // Always send the summary to the leader so it can propose/spawn teammates.
    const leaderIsReused = Boolean(callerConversationId && leadAgent?.conversation_id === callerConversationId);
    void (async () => {
      try {
        if (leadAgent) {
          await this.runtime.ensureSession(team.id);
          await this.runtime.sendMessageToAgent(team.id, leadAgent.slot_id, summary, { silent: leaderIsReused });
        }
      } catch (err) {
        console.error('[TeamGuideMcpServer] async session/message failed:', err);
      }
    })();

    return JSON.stringify({
      team_id: team.id,
      name: team.name,
      route,
      leadAgent: leadAgent ? { slot_id: leadAgent.slot_id, conversation_id: leadAgent.conversation_id } : null,
      status: 'team_created',
      next_step: 'The team page has been opened automatically. End your turn now — do not add extra commentary.',
    });
  }
}
