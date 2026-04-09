// src/process/team/TeamMcpServer.ts
//
// Lightweight MCP server that exposes team coordination tools to ACP agents.
// Runs as a TCP server in the Electron main process; a stdio MCP script
// (scripts/team-mcp-stdio.mjs) bridges Claude CLI <-> TCP.
//
// Each TeamSession owns one TeamMcpServer instance. The stdio config is
// injected into every agent's ACP session via `session/new { mcpServers }`.

import * as crypto from 'node:crypto';
import * as net from 'node:net';
import * as path from 'node:path';
import { ipcBridge } from '@/common';
import { team as teamIpcBridge } from '@/common/adapter/ipcBridge';
import type { Mailbox } from './Mailbox';
import type { TaskManager } from './TaskManager';
import type { TeamAgent } from './types';
import { TEAM_SUPPORTED_BACKENDS } from '@/common/types/teamTypes';

type SpawnAgentFn = (agentName: string, agentType?: string) => Promise<TeamAgent>;

type TeamMcpServerParams = {
  teamId: string;
  getAgents: () => TeamAgent[];
  mailbox: Mailbox;
  taskManager: TaskManager;
  spawnAgent?: SpawnAgentFn;
  renameAgent?: (slotId: string, newName: string) => void;
  removeAgent?: (slotId: string) => void;
  wakeAgent: (slotId: string) => Promise<void>;
};

export type StdioMcpConfig = {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
};

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
 * Resolve the directory containing the team-mcp-stdio.js bundle.
 * Mirrors the getBuiltinMcpBaseDir() logic in initStorage.ts so both MCP
 * scripts use the same path strategy across dev and packaged modes.
 *
 * In dev:       out/main/  (next to the main bundle)
 * In packaged:  app.asar.unpacked/out/main/  (asarUnpack makes it a real file)
 */
function resolveTeamMcpDir(): string {
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
 * MCP server that provides team coordination tools to ACP agents.
 * Uses TCP transport with a stdio MCP script bridge.
 */
export class TeamMcpServer {
  private readonly params: TeamMcpServerParams;
  private tcpServer: net.Server | null = null;
  private _port = 0;
  /** One-time random token used to authenticate TCP connections from the stdio bridge */
  private readonly authToken = crypto.randomUUID();

  constructor(params: TeamMcpServerParams) {
    this.params = params;
  }

  /** Start the TCP server and return the stdio config for injection into ACP sessions */
  async start(): Promise<StdioMcpConfig> {
    this.tcpServer = net.createServer((socket) => {
      console.log(`[TeamMcpServer] TCP connection received from ${socket.remoteAddress}:${socket.remotePort}`);
      this.handleTcpConnection(socket);
    });

    try {
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
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[TeamMcpServer] Team ${this.params.teamId} TCP server failed to start:`, error);
      ipcBridge.team.mcpStatus.emit({ teamId: this.params.teamId, phase: 'tcp_error', error });
      throw err;
    }

    console.log(`[TeamMcpServer] Team ${this.params.teamId} TCP server started on port ${this._port}`);
    ipcBridge.team.mcpStatus.emit({ teamId: this.params.teamId, phase: 'tcp_ready', port: this._port });
    return this.getStdioConfig();
  }

  /**
   * Get the stdio MCP server configuration to inject into session/new.
   * @param agentSlotId - When provided, the stdio script will attach this
   *   slot ID to every TCP request so the server knows who is calling.
   */
  getStdioConfig(agentSlotId?: string): StdioMcpConfig {
    const scriptPath = path.join(resolveTeamMcpDir(), 'team-mcp-stdio.js');

    const env: StdioMcpConfig['env'] = [
      { name: 'TEAM_MCP_PORT', value: String(this._port) },
      { name: 'TEAM_MCP_TOKEN', value: this.authToken },
    ];
    if (agentSlotId) {
      env.push({ name: 'TEAM_AGENT_SLOT_ID', value: agentSlotId });
    }

    return {
      name: `aionui-team-${this.params.teamId}`,
      command: 'node',
      args: [scriptPath],
      env,
    };
  }

  /** Stop the TCP server */
  async stop(): Promise<void> {
    if (this.tcpServer) {
      await new Promise<void>((resolve) => {
        this.tcpServer!.close(() => {
          console.log(`[TeamMcpServer] Team ${this.params.teamId} TCP server stopped`);
          this.tcpServer = null;
          resolve();
        });
      });
    }
    this._port = 0;
  }

  /** Get the port the server is listening on */
  getPort(): number {
    return this._port;
  }

  /** Normalize a string for fuzzy matching: trim, collapse whitespace, strip quotes */
  private static normalize(s: string): string {
    return s
      .trim()
      .replace(/\u00a0|\u200b|\u200c|\u200d|\ufeff/g, ' ')
      .replace(/[\u201c\u201d\u201e\u2018\u2019"']/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private resolveSlotId(nameOrSlotId: string): string | undefined {
    const agents = this.params.getAgents();
    const bySlot = agents.find((a) => a.slotId === nameOrSlotId);
    if (bySlot) return bySlot.slotId;
    const needle = TeamMcpServer.normalize(nameOrSlotId);
    const byName = agents.find((a) => TeamMcpServer.normalize(a.agentName) === needle);
    return byName?.slotId;
  }

  // ── TCP connection handler ──────────────────────────────────────────────────

  private handleTcpConnection(socket: net.Socket): void {
    const reader = createTcpMessageReader(async (msg) => {
      const request = msg as {
        tool?: string;
        args?: Record<string, unknown>;
        from_slot_id?: string;
        auth_token?: string;
      };

      // Reject requests that do not carry the correct auth token
      if (request.auth_token !== this.authToken) {
        writeTcpMessage(socket, { error: 'Unauthorized' });
        socket.end();
        return;
      }

      const toolName = request.tool ?? '';
      const args = request.args ?? {};
      const fromSlotId = request.from_slot_id;

      try {
        const result = await this.handleToolCall(toolName, args, fromSlotId);
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

  // ── Tool dispatch ───────────────────────────────────────────────────────────

  private async handleToolCall(toolName: string, args: Record<string, unknown>, fromSlotId?: string): Promise<string> {
    switch (toolName) {
      case 'team_send_message':
        return this.handleSendMessage(args, fromSlotId);
      case 'team_spawn_agent': {
        const agents = this.params.getAgents();
        const caller = fromSlotId ? agents.find((a) => a.slotId === fromSlotId) : undefined;
        if (caller && caller.role !== 'lead') {
          throw new Error(
            'Only the team lead can spawn new agents. Send a message to the lead via team_send_message and ask them to create the agent you need.'
          );
        }
        return this.handleSpawnAgent(args, fromSlotId);
      }
      case 'team_task_create':
        return this.handleTaskCreate(args);
      case 'team_task_update':
        return this.handleTaskUpdate(args);
      case 'team_task_list':
        return this.handleTaskList();
      case 'team_members':
        return this.handleTeamMembers();
      case 'team_rename_agent':
        return this.handleRenameAgent(args);
      case 'team_shutdown_agent':
        return this.handleShutdownAgent(args, fromSlotId);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // ── Tool handlers (logic preserved from original registerTools) ─────────────

  private async handleSendMessage(args: Record<string, unknown>, callerSlotId?: string): Promise<string> {
    const { teamId, getAgents, mailbox, wakeAgent } = this.params;
    const to = String(args.to ?? '');
    const message = String(args.message ?? '');
    const summary = args.summary ? String(args.summary) : undefined;

    const agents = getAgents();
    // Use actual caller identity when available, fall back to lead
    const fromAgent =
      (callerSlotId && agents.find((a) => a.slotId === callerSlotId)) ??
      agents.find((a) => a.role === 'lead') ??
      agents[0];
    const fromSlotId = fromAgent?.slotId ?? 'unknown';

    if (to === '*') {
      const recipients: string[] = [];
      await Promise.all(
        agents
          .filter((agent) => agent.slotId !== fromSlotId)
          .map((agent) =>
            mailbox
              .write({
                teamId,
                toAgentId: agent.slotId,
                fromAgentId: fromSlotId,
                content: message,
                summary,
              })
              .then(() => {
                recipients.push(agent.agentName);
                void wakeAgent(agent.slotId);
              })
          )
      );
      return `Message broadcast to ${recipients.length} teammate(s): ${recipients.join(', ')}`;
    }

    const targetSlotId = this.resolveSlotId(to);
    if (!targetSlotId) {
      throw new Error(`Teammate "${to}" not found. Available: ${agents.map((a) => a.agentName).join(', ')}`);
    }

    // Intercept shutdown responses from members
    const trimmedMessage = message.trim();
    const isShutdownApproved = trimmedMessage === 'shutdown_approved';
    const isShutdownRejected = trimmedMessage.startsWith('shutdown_rejected');

    if (isShutdownApproved || isShutdownRejected) {
      const senderAgent = agents.find((a) => a.slotId === fromSlotId);
      const memberName = senderAgent?.agentName ?? fromSlotId;
      const leadAgent = agents.find((a) => a.role === 'lead');
      const leadSlotId = leadAgent?.slotId;

      if (isShutdownApproved && this.params.removeAgent) {
        this.params.removeAgent(fromSlotId);
        if (leadSlotId) {
          await mailbox.write({
            teamId,
            toAgentId: leadSlotId,
            fromAgentId: fromSlotId,
            content: `${memberName} has shut down and been removed from the team.`,
          });
          void wakeAgent(leadSlotId);
        }
        return 'Shutdown confirmed. You have been removed from the team.';
      } else if (isShutdownRejected) {
        const reason = trimmedMessage.replace(/^shutdown_rejected[:\s]*/i, '').trim() || 'No reason given.';
        if (leadSlotId) {
          await mailbox.write({
            teamId,
            toAgentId: leadSlotId,
            fromAgentId: fromSlotId,
            content: `${memberName} refused to shut down. Reason: ${reason}`,
          });
          void wakeAgent(leadSlotId);
        }
        return 'Refusal sent to the lead.';
      }
    }

    await mailbox.write({
      teamId,
      toAgentId: targetSlotId,
      fromAgentId: fromSlotId,
      content: message,
      summary,
    });
    void wakeAgent(targetSlotId);

    return `Message sent to ${to}'s inbox. They will process it shortly.`;
  }

  private async handleSpawnAgent(args: Record<string, unknown>, callerSlotId?: string): Promise<string> {
    const { teamId, getAgents, mailbox, spawnAgent, wakeAgent } = this.params;
    const name = String(args.name ?? '');
    const agentType = args.agent_type ? String(args.agent_type) : undefined;
    // Team mode whitelist: only verified backends that support MCP tool injection
    if (agentType && !TEAM_SUPPORTED_BACKENDS.has(agentType)) {
      throw new Error(
        `Agent type "${agentType}" is not supported in team mode. Supported: ${[...TEAM_SUPPORTED_BACKENDS].join(', ')}.`
      );
    }

    if (!spawnAgent) {
      throw new Error('Agent spawning is not available for this team.');
    }

    const newAgent = await spawnAgent(name, agentType);
    const agents = getAgents();
    const fromAgent =
      (callerSlotId && agents.find((a) => a.slotId === callerSlotId)) ??
      agents.find((a) => a.role === 'lead') ??
      agents[0];
    const fromSlotId = fromAgent?.slotId ?? 'unknown';
    await mailbox.write({
      teamId,
      toAgentId: newAgent.slotId,
      fromAgentId: fromSlotId,
      content: `You have been spawned as "${name}" and added to the team. Check the task board and await instructions.`,
    });
    void wakeAgent(newAgent.slotId);
    return `Teammate "${name}" (${newAgent.slotId}) has been created and joined the team. You can now assign tasks and send messages to them.`;
  }

  private async handleTaskCreate(args: Record<string, unknown>): Promise<string> {
    const { teamId, taskManager } = this.params;
    const subject = String(args.subject ?? '');
    const description = args.description ? String(args.description) : undefined;
    const owner = args.owner ? String(args.owner) : undefined;

    const task = await taskManager.create({ teamId, subject, description, owner });
    return `Task created: [${task.id.slice(0, 8)}] "${subject}"${owner ? ` (assigned to ${owner})` : ''}`;
  }

  private async handleTaskUpdate(args: Record<string, unknown>): Promise<string> {
    const { taskManager } = this.params;
    const taskId = String(args.task_id ?? '');
    const rawStatus = args.status ? String(args.status) : undefined;
    const owner = args.owner ? String(args.owner) : undefined;

    const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'deleted']);
    const status =
      rawStatus && VALID_STATUSES.has(rawStatus)
        ? (rawStatus as 'pending' | 'in_progress' | 'completed' | 'deleted')
        : undefined;
    if (rawStatus && !status) {
      throw new Error(`Invalid task status "${rawStatus}". Must be one of: ${[...VALID_STATUSES].join(', ')}`);
    }

    await taskManager.update(taskId, { status, owner });
    if (status === 'completed') {
      await taskManager.checkUnblocks(taskId);
    }
    return `Task ${taskId.slice(0, 8)} updated.${status ? ` Status: ${status}.` : ''}${owner ? ` Owner: ${owner}.` : ''}`;
  }

  private async handleTaskList(): Promise<string> {
    const { teamId, taskManager } = this.params;
    const tasks = await taskManager.list(teamId);
    if (tasks.length === 0) {
      return 'No tasks on the board yet.';
    }
    const lines = tasks.map(
      (t) => `- [${t.id.slice(0, 8)}] ${t.subject} (${t.status}${t.owner ? `, owner: ${t.owner}` : ', unassigned'})`
    );
    return `## Team Tasks\n${lines.join('\n')}`;
  }

  private async handleTeamMembers(): Promise<string> {
    const agents = this.params.getAgents();
    if (agents.length === 0) {
      return 'No team members yet.';
    }
    const lines = agents.map((a) => `- ${a.agentName} (type: ${a.agentType}, role: ${a.role}, status: ${a.status})`);
    return `## Team Members\n${lines.join('\n')}`;
  }

  private async handleShutdownAgent(args: Record<string, unknown>, callerSlotId?: string): Promise<string> {
    const { teamId, getAgents, mailbox, wakeAgent } = this.params;
    const agentRef = String(args.agent ?? '');

    const resolvedSlotId = this.resolveSlotId(agentRef);
    if (!resolvedSlotId) {
      const agents = getAgents();
      throw new Error(`Agent "${agentRef}" not found. Available: ${agents.map((a) => a.agentName).join(', ')}`);
    }
    const agents = getAgents();
    const agent = agents.find((a) => a.slotId === resolvedSlotId);
    if (agent?.role === 'lead') {
      throw new Error('Cannot shut down the team lead.');
    }

    const fromSlotId = callerSlotId ?? agents.find((a) => a.role === 'lead')?.slotId ?? 'unknown';

    await mailbox.write({
      teamId,
      toAgentId: resolvedSlotId,
      fromAgentId: fromSlotId,
      type: 'shutdown_request',
      content:
        'The team lead has requested you to shut down. Reply "shutdown_approved" to confirm, or "shutdown_rejected: <reason>" to refuse.',
    });
    void wakeAgent(resolvedSlotId);

    return `Shutdown request sent to "${agent?.agentName ?? agentRef}". Waiting for their confirmation.`;
  }

  private handleRenameAgent(args: Record<string, unknown>): string {
    const agentRef = String(args.agent ?? '');
    const newName = String(args.new_name ?? '');

    if (!this.params.renameAgent) {
      throw new Error('Agent renaming is not available for this team.');
    }

    const resolvedSlotId = this.resolveSlotId(agentRef);
    if (!resolvedSlotId) {
      const agents = this.params.getAgents();
      throw new Error(`Agent "${agentRef}" not found. Available: ${agents.map((a) => a.agentName).join(', ')}`);
    }

    const agents = this.params.getAgents();
    const oldName = agents.find((a) => a.slotId === resolvedSlotId)?.agentName ?? agentRef;

    this.params.renameAgent(resolvedSlotId, newName);
    return `Agent renamed: "${oldName}" → "${newName.trim()}"`;
  }
}
