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
import type { TeamSessionService } from '@process/team/TeamSessionService';
import type { StdioMcpConfig } from '../team/TeamMcpServer';
import { isTeamCapableBackend } from '@/common/types/teamTypes';
import { ProcessConfig } from '@process/utils/initStorage';
import { getConversationTypeForBackend } from '@/common/utils/buildAgentConversationParams';
import { handleListModels } from '../modelListHandler';
import { getDatabase } from '@process/services/database';
import { writeTcpMessage, createTcpMessageReader, resolveMcpScriptDir } from '../tcpHelpers';

/**
 * Singleton in-process MCP server for Aion team management tools.
 * Uses TCP transport + a stdio bridge script, same as TeamMcpServer.
 * Call `start()` once on app boot; `stop()` on app quit.
 */
export class TeamGuideMcpServer {
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

        const toolName = request.tool ?? '';
        const args = request.args ?? {};

        try {
          const result = await this.handleToolCall(toolName, args, request.backend, request.conversation_id);
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
    toolName: string,
    args: Record<string, unknown>,
    backend?: string,
    callerConversationId?: string
  ): Promise<string> {
    switch (toolName) {
      case 'aion_create_team':
        return this.handleCreateTeam(args, backend, callerConversationId);
      case 'aion_list_models':
        return handleListModels(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
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
      const db = await getDatabase();
      const row = db.getConversation(callerConversationId);
      const callerWorkspace = (row?.data?.extra as Record<string, unknown> | undefined)?.workspace;
      if (callerWorkspace && typeof callerWorkspace === 'string') {
        workspace = callerWorkspace;
      }
    }

    // Use system-injected backend (from AION_MCP_BACKEND env var) as the authoritative agent type.
    // Falls back to 'claude' only when the backend is unknown or not in the whitelist.
    const cachedInitResults = await ProcessConfig.get('acp.cachedInitializeResult');
    const agentType = backend && isTeamCapableBackend(backend, cachedInitResults) ? backend : 'claude';

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
          conversationId: callerConversationId || '',
          role: 'leader',
          agentType,
          agentName: 'Leader',
          conversationType: getConversationTypeForBackend(agentType),
          status: 'pending',
        },
      ],
    });

    const leadAgent = team.agents.find((a) => a.role === 'leader');
    const route = `/team/${team.id}`;

    // Notify sidebar: the reused conversation now belongs to a team → filter it out.
    // TeamSessionService.createTeam calls conversationService.updateConversation directly
    // (bypassing the IPC bridge), so conversation.listChanged is never emitted automatically.
    if (callerConversationId) {
      ipcBridge.conversation.listChanged.emit({
        conversationId: callerConversationId,
        action: 'updated',
        source: 'aionui',
      });
    }

    // Notify frontend to refresh team list
    ipcBridge.team.listChanged.emit({ teamId: team.id, action: 'created' });

    // Navigate to team page immediately after creation.
    ipcBridge.deepLink.received.emit({ action: 'navigate', params: { route } });

    // Fire-and-forget: start session in background.
    // getOrStartSession rebuilds the leader's agent task with team MCP tools (skipCache).
    // Always send the summary to the leader so it can propose/spawn teammates.
    const leaderIsReused = Boolean(callerConversationId && leadAgent?.conversationId === callerConversationId);
    void (async () => {
      try {
        const session = await this.teamSessionService.getOrStartSession(team.id);
        if (leadAgent) {
          // When the leader is reused, skip the UI bubble — the conversation already
          // shows the full user context. The summary still reaches the agent via mailbox.
          await session.sendMessageToAgent(leadAgent.slotId, summary, { silent: leaderIsReused });
        }
      } catch (err) {
        console.error('[TeamGuideMcpServer] async session/message failed:', err);
      }
    })();

    return JSON.stringify({
      teamId: team.id,
      name: team.name,
      route,
      leadAgent: leadAgent ? { slotId: leadAgent.slotId, conversationId: leadAgent.conversationId } : null,
      status: 'team_created',
      next_step: 'The team page has been opened automatically. End your turn now — do not add extra commentary.',
    });
  }
}
