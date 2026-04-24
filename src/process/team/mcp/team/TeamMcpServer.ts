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
import type { Mailbox } from '../../Mailbox.ts';
import type { TaskManager } from '../../TaskManager.ts';
import type { TeamAgent } from '../../types.ts';
import { isTeamCapableBackend, getTeamCapableBackends } from '@/common/types/teamTypes.ts';
import { ProcessConfig } from '@process/utils/initStorage.ts';
import { agentRegistry } from '@process/agent/AgentRegistry';
import { ASSISTANT_PRESETS } from '@/common/config/presets/assistantPresets';
import { resolveLocaleKey } from '@/common/utils';
import { handleListModels } from '../modelListHandler.ts';
import { notifyMcpReady } from '../../mcpReadiness.ts';
import { writeTcpMessage, createTcpMessageReader, resolveMcpScriptDir } from '../tcpHelpers.ts';

type SpawnAgentFn = (
  agentName: string,
  agentType?: string,
  model?: string,
  customAgentId?: string
) => Promise<TeamAgent>;

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
      console.debug(`[TeamMcpServer] TCP connection received from ${socket.remoteAddress}:${socket.remotePort}`);
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
    const scriptPath = path.join(resolveMcpScriptDir(), 'team-mcp-stdio.js');

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

  /**
   * Fire-and-forget wake that logs failures instead of swallowing them.
   * wakeAgent() can legitimately reject (e.g. dead ACP process, mailbox DB error)
   * but the MCP tool call must still return to the caller, so we can't await it.
   * Without this guard the error vanishes silently and the would-be wake target
   * never runs — which is one of the ways "codex 空转" used to present.
   */
  private safeWake(slotId: string, context: string): void {
    this.params.wakeAgent(slotId).catch((err) => {
      console.error(`[TeamMcpServer] wake(${slotId}) failed during ${context}:`, err);
    });
  }

  // ── TCP connection handler ──────────────────────────────────────────────────

  private handleTcpConnection(socket: net.Socket): void {
    const reader = createTcpMessageReader(
      async (msg) => {
        const request = msg as {
          tool?: string;
          type?: string;
          args?: Record<string, unknown>;
          from_slot_id?: string;
          slot_id?: string;
          auth_token?: string;
        };

        // Reject requests that do not carry the correct auth token
        if (request.auth_token !== this.authToken) {
          writeTcpMessage(socket, { error: 'Unauthorized' });
          socket.end();
          return;
        }

        // Handle MCP readiness notification from stdio script (not a tool call)
        if (request.type === 'mcp_ready' && !request.tool) {
          const readySlotId = request.from_slot_id ?? request.slot_id;
          if (readySlotId) {
            console.log(`[TeamMcpServer] MCP ready from slot ${readySlotId}`);
            notifyMcpReady(readySlotId);
          }
          writeTcpMessage(socket, { result: 'ok' });
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
      },
      {
        // Drop the connection on framing corruption (e.g. an oversize length
        // prefix), otherwise the reader would buffer indefinitely waiting for
        // bytes that will never arrive.
        onError: (err) => {
          console.warn(`[TeamMcpServer] TCP framing error: ${err.message}`);
          socket.destroy();
        },
      }
    );

    socket.on('data', reader);
    socket.on('error', () => {
      // Connection errors are expected (e.g., client disconnect)
      socket.destroy();
    });
    // Hard idle deadline so a stuck handler cannot pin the socket (and the
    // pending request payload it references) in memory forever.
    socket.setTimeout(600_000);
    socket.on('timeout', () => {
      console.warn('[TeamMcpServer] TCP socket idle timeout, destroying');
      socket.destroy();
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
        if (caller && caller.role !== 'leader') {
          throw new Error(
            'Only the team leader can spawn new agents. Send a message to the leader via team_send_message and ask them to create the agent you need.'
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
      case 'team_describe_assistant':
        return this.handleDescribeAssistant(args);
      case 'team_list_models':
        return handleListModels(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // ── Tool handlers (logic preserved from original registerTools) ─────────────

  private async handleSendMessage(args: Record<string, unknown>, callerSlotId?: string): Promise<string> {
    const { teamId, getAgents, mailbox } = this.params;
    const to = String(args.to ?? '');
    const message = String(args.message ?? '');
    const summary = args.summary ? String(args.summary) : undefined;

    const agents = getAgents();
    // Use actual caller identity when available, fall back to leader
    const fromAgent =
      (callerSlotId && agents.find((a) => a.slotId === callerSlotId)) ??
      agents.find((a) => a.role === 'leader') ??
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
                this.safeWake(agent.slotId, 'broadcast message');
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
      const leadAgent = agents.find((a) => a.role === 'leader');
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
          this.safeWake(leadSlotId, 'shutdown_approved');
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
          this.safeWake(leadSlotId, 'shutdown_rejected');
        }
        return 'Refusal sent to the leader.';
      }
    }

    await mailbox.write({
      teamId,
      toAgentId: targetSlotId,
      fromAgentId: fromSlotId,
      content: message,
      summary,
    });
    this.safeWake(targetSlotId, `send_message to ${to}`);

    return `Message sent to ${to}'s inbox. They will process it shortly.`;
  }

  private async handleSpawnAgent(args: Record<string, unknown>, callerSlotId?: string): Promise<string> {
    const { teamId, getAgents, mailbox, spawnAgent } = this.params;
    const name = String(args.name ?? '');
    const customAgentId = args.custom_agent_id ? String(args.custom_agent_id) : undefined;
    const model = args.model ? String(args.model) : undefined;
    let agentType = args.agent_type ? String(args.agent_type) : undefined;

    // When a preset is requested, resolve its backend from config so the caller
    // does not need to specify agent_type separately.
    if (customAgentId) {
      const assistants = (await ProcessConfig.get('assistants')) ?? [];
      const preset = assistants.find((a) => a.id === customAgentId && a.isPreset);
      if (!preset) {
        const availableIds = assistants
          .filter((a) => a.isPreset && a.enabled !== false)
          .map((a) => a.id)
          .join(', ');
        throw new Error(
          `Preset assistant "${customAgentId}" not found.${
            availableIds ? ` Available: ${availableIds}.` : ' No preset assistants are currently enabled.'
          }`
        );
      }
      if (preset.enabled === false) {
        throw new Error(`Preset assistant "${customAgentId}" is disabled. Enable it before spawning.`);
      }
      const presetBackend = preset.presetAgentType || 'gemini';
      if (agentType && agentType !== presetBackend) {
        console.warn(
          `[TeamMcpServer] handleSpawnAgent: agent_type "${agentType}" overridden by preset "${customAgentId}" backend "${presetBackend}".`
        );
      }
      agentType = presetBackend;
    }

    // Team mode validation: only backends with confirmed ACP MCP stdio support
    if (agentType) {
      const cachedInitResults = await ProcessConfig.get('acp.cachedInitializeResult');
      if (!isTeamCapableBackend(agentType, cachedInitResults)) {
        const capable = getTeamCapableBackends(
          agentRegistry.getDetectedAgents().map((a) => a.backend),
          cachedInitResults
        );
        throw new Error(`Agent type "${agentType}" is not supported in team mode. Supported: ${capable.join(', ')}.`);
      }
    }

    if (model && agentType) {
      const cachedModels = await ProcessConfig.get('acp.cachedModels');
      const available = cachedModels?.[agentType]?.availableModels;
      if (available && available.length > 0 && !available.some((m: { id: string }) => m.id === model)) {
        console.warn(
          `[TeamMcpServer] handleSpawnAgent: model "${model}" not in available models for backend "${agentType}". ` +
            `Backend will use default model as fallback.`
        );
      }
    }

    if (!spawnAgent) {
      throw new Error('Agent spawning is not available for this team.');
    }

    const newAgent = await spawnAgent(name, agentType, model, customAgentId);
    const agents = getAgents();
    const fromAgent =
      (callerSlotId && agents.find((a) => a.slotId === callerSlotId)) ??
      agents.find((a) => a.role === 'leader') ??
      agents[0];
    const fromSlotId = fromAgent?.slotId ?? 'unknown';
    await mailbox.write({
      teamId,
      toAgentId: newAgent.slotId,
      fromAgentId: fromSlotId,
      content: `You have been spawned as "${name}" and added to the team. Check the task board and await instructions.`,
    });
    this.safeWake(newAgent.slotId, `spawn ${name}`);
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
    const lines = agents.map((a) => {
      const modelSuffix = a.model ? `, model: ${a.model}` : '';
      return `- ${a.agentName} (type: ${a.agentType}, role: ${a.role}, status: ${a.status}${modelSuffix})`;
    });
    return `## Team Members\n${lines.join('\n')}`;
  }

  private async handleShutdownAgent(args: Record<string, unknown>, callerSlotId?: string): Promise<string> {
    const { teamId, getAgents, mailbox } = this.params;
    const agentRef = String(args.agent ?? '');

    const resolvedSlotId = this.resolveSlotId(agentRef);
    if (!resolvedSlotId) {
      const agents = getAgents();
      throw new Error(`Agent "${agentRef}" not found. Available: ${agents.map((a) => a.agentName).join(', ')}`);
    }
    const agents = getAgents();
    const agent = agents.find((a) => a.slotId === resolvedSlotId);
    if (agent?.role === 'leader') {
      throw new Error('Cannot shut down the team leader.');
    }

    const fromSlotId = callerSlotId ?? agents.find((a) => a.role === 'leader')?.slotId ?? 'unknown';

    await mailbox.write({
      teamId,
      toAgentId: resolvedSlotId,
      fromAgentId: fromSlotId,
      type: 'shutdown_request',
      content:
        'The team leader has requested you to shut down. Reply "shutdown_approved" to confirm, or "shutdown_rejected: <reason>" to refuse.',
    });
    this.safeWake(resolvedSlotId, 'shutdown_request');

    return `Shutdown request sent to "${agent?.agentName ?? agentRef}". Waiting for their confirmation.`;
  }

  private async handleDescribeAssistant(args: Record<string, unknown>): Promise<string> {
    const customAgentId = args.custom_agent_id ? String(args.custom_agent_id) : '';
    if (!customAgentId) {
      throw new Error('custom_agent_id is required.');
    }

    const assistants = (await ProcessConfig.get('assistants')) ?? [];
    const assistant = assistants.find((a) => a.id === customAgentId && a.isPreset);
    if (!assistant) {
      const availableIds = assistants
        .filter((a) => a.isPreset && a.enabled !== false)
        .map((a) => a.id)
        .join(', ');
      throw new Error(
        `Preset assistant "${customAgentId}" not found.${availableIds ? ` Available: ${availableIds}.` : ''}`
      );
    }
    if (assistant.enabled === false) {
      throw new Error(`Preset assistant "${customAgentId}" is disabled.`);
    }

    // Resolve locale: explicit arg > user language > en-US fallback.
    const explicitLocale = args.locale ? String(args.locale) : undefined;
    const userLanguage = await ProcessConfig.get('language');
    const localeKey = resolveLocaleKey(explicitLocale || userLanguage || 'en-US');

    const pickLocalized = (source: Record<string, string> | undefined): string | undefined => {
      if (!source) return undefined;
      return source[localeKey] || source['en-US'] || Object.values(source)[0];
    };
    const pickLocalizedList = (source: Record<string, string[]> | undefined): string[] => {
      if (!source) return [];
      return source[localeKey] || source['en-US'] || Object.values(source)[0] || [];
    };

    // Built-in presets carry extra catalog data (example prompts, locale names)
    // that the stored assistant record does not. Merge both sources.
    const builtinId = customAgentId.startsWith('builtin-') ? customAgentId.replace('builtin-', '') : customAgentId;
    const builtin = ASSISTANT_PRESETS.find((p) => p.id === builtinId);

    const name = pickLocalized(builtin?.nameI18n) || assistant.name || customAgentId;
    const description = pickLocalized(builtin?.descriptionI18n) || assistant.description || '';
    const backend = assistant.presetAgentType || builtin?.presetAgentType || 'gemini';
    const skills = assistant.enabledSkills && assistant.enabledSkills.length > 0 ? assistant.enabledSkills : [];
    const examples = pickLocalizedList(builtin?.promptsI18n);

    const lines: string[] = [];
    lines.push(`# ${name} (${customAgentId})`);
    lines.push(`Backend: ${backend}`);
    lines.push('');
    if (description) {
      lines.push('## Description');
      lines.push(description);
      lines.push('');
    }
    lines.push('## Skills');
    if (skills.length > 0) {
      for (const s of skills) lines.push(`- ${s}`);
    } else {
      lines.push('(none enabled)');
    }
    lines.push('');
    lines.push('## Example tasks');
    if (examples.length > 0) {
      for (const ex of examples) lines.push(`- ${ex}`);
    } else {
      lines.push('(no example prompts registered)');
    }
    lines.push('');
    lines.push(
      `To spawn this preset as a teammate, call team_spawn_agent with custom_agent_id="${customAgentId}". ` +
        `Its full rules and skills will be injected into the spawned teammate's conversation automatically.`
    );

    return lines.join('\n');
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
