// src/process/team/TeamSession.ts
import { EventEmitter } from 'events';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { addMessage } from '@process/utils/message';
import type { ITeamRepository } from './repository/ITeamRepository';
import type { TTeam, TeamAgent } from './types';
import { Mailbox } from './Mailbox';
import { TaskManager } from './TaskManager';
import { TeammateManager } from './TeammateManager';
import { TeamMcpServer, type StdioMcpConfig } from './mcp/team/TeamMcpServer';

type SpawnAgentFn = (
  agent_name: string,
  agent_type?: string,
  model?: string,
  custom_agent_id?: string
) => Promise<TeamAgent>;

/**
 * Thin coordinator that owns Mailbox, TaskManager, TeammateManager, and MCP server.
 * All agent orchestration is delegated to TeammateManager.
 * The MCP server provides team coordination tools to ACP agents.
 */
export class TeamSession extends EventEmitter {
  readonly team_id: string;
  private readonly team: TTeam;
  private readonly repo: ITeamRepository;
  private readonly mailbox: Mailbox;
  private readonly taskManager: TaskManager;
  private readonly teammateManager: TeammateManager;
  private readonly workerTaskManager: IWorkerTaskManager;
  private readonly mcpServer: TeamMcpServer;
  private mcpStdioConfig: StdioMcpConfig | null = null;

  constructor(team: TTeam, repo: ITeamRepository, workerTaskManager: IWorkerTaskManager, spawnAgent?: SpawnAgentFn) {
    super();
    this.team = team;
    this.team_id = team.id;
    this.repo = repo;
    this.workerTaskManager = workerTaskManager;
    this.mailbox = new Mailbox(repo);
    this.taskManager = new TaskManager(repo);
    this.teammateManager = new TeammateManager({
      team_id: team.id,
      agents: team.agents,
      mailbox: this.mailbox,
      workerTaskManager,
      teamWorkspace: team.workspace || undefined,
      onAgentRemoved: (team_id, agents) => {
        void this.repo.update(team_id, { agents, updated_at: Date.now() });
      },
    });

    // Create MCP server for team coordination tools
    this.mcpServer = new TeamMcpServer({
      team_id: team.id,
      getAgents: () => this.teammateManager.getAgents(),
      mailbox: this.mailbox,
      taskManager: this.taskManager,
      spawnAgent,
      renameAgent: (slot_id: string, new_name: string) => {
        this.teammateManager.renameAgent(slot_id, new_name);
        void this.repo.update(team.id, { agents: this.teammateManager.getAgents(), updated_at: Date.now() });
      },
      removeAgent: (slot_id: string) => {
        // removeAgent already persists via onAgentRemoved callback
        this.teammateManager.removeAgent(slot_id);
      },
      wakeAgent: (slot_id: string) => this.teammateManager.wake(slot_id),
    });
  }

  /**
   * Start the MCP server and return its stdio config.
   * Must be called before sendMessage to ensure agents have access to team tools.
   */
  async startMcpServer(): Promise<StdioMcpConfig> {
    if (!this.mcpStdioConfig) {
      this.mcpStdioConfig = await this.mcpServer.start();
    }
    return this.mcpStdioConfig;
  }

  /** Get the MCP stdio config, optionally tagged with a specific agent's slot_id */
  getStdioConfig(agentSlotId?: string): StdioMcpConfig | null {
    if (!this.mcpStdioConfig) return null;
    if (!agentSlotId) return this.mcpStdioConfig;
    // Return a copy with the agent's slot_id in env
    return this.mcpServer.getStdioConfig(agentSlotId);
  }

  /**
   * Best-effort wake after a message has already been durably accepted into the
   * team mailbox. Wake failures must not be reported as send failures to the
   * renderer, otherwise the queue may re-enqueue an already-delivered message.
   */
  private async wakeAfterAcceptedDelivery(slot_id: string, context: 'team' | 'agent'): Promise<void> {
    try {
      await this.teammateManager.wake(slot_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[TeamSession] Accepted ${context} message but failed to wake ${slot_id}:`, message);
    }
  }

  /**
   * Send a user message to the team.
   * Ensures MCP server is started, then writes to the leader agent's mailbox and wakes the leader.
   */
  async sendMessage(content: string, files?: string[]): Promise<void> {
    // Ensure MCP server is running before waking agents
    await this.startMcpServer();

    const leadSlotId = this.team.leader_agent_id;
    const leadAgent = this.teammateManager.getAgents().find((a) => a.slot_id === leadSlotId);

    await this.mailbox.write({
      team_id: this.team_id,
      to_agent_id: leadSlotId,
      from_agent_id: 'user',
      content,
      files,
    });

    // Persist user message in leader's conversation so it appears as a user bubble in the chat UI
    if (leadAgent?.conversation_id) {
      const msgId = crypto.randomUUID();
      const userMessage: TMessage = {
        id: msgId,
        msg_id: msgId,
        type: 'text',
        position: 'right',
        conversation_id: leadAgent.conversation_id,
        content: { content },
        created_at: Date.now(),
      };
      addMessage(leadAgent.conversation_id, userMessage);
      ipcBridge.conversation.responseStream.emit({
        type: 'user_content',
        conversation_id: leadAgent.conversation_id,
        msg_id: msgId,
        data: content,
      });
    }

    await this.wakeAfterAcceptedDelivery(leadSlotId, 'team');
  }

  /**
   * Send a user message directly to a specific agent (by slot_id), bypassing the leader.
   * Ensures MCP server is running, writes to agent's mailbox, persists user bubble, then wakes the agent.
   */
  async sendMessageToAgent(
    slot_id: string,
    content: string,
    options?: { silent?: boolean; files?: string[] }
  ): Promise<void> {
    await this.startMcpServer();

    await this.mailbox.write({
      team_id: this.team_id,
      to_agent_id: slot_id,
      from_agent_id: 'user',
      content,
      files: options?.files,
    });

    // When silent, skip the user bubble — the content still reaches the agent
    // via mailbox → buildRolePrompt "Unread Messages". Used when the leader's
    // conversation is reused and already contains the full user context.
    const agent = this.teammateManager.getAgents().find((a) => a.slot_id === slot_id);
    if (agent?.conversation_id && !options?.silent) {
      const msgId = crypto.randomUUID();
      const userMessage: TMessage = {
        id: msgId,
        msg_id: msgId,
        type: 'text',
        position: 'right',
        conversation_id: agent.conversation_id,
        content: { content },
        created_at: Date.now(),
      };
      addMessage(agent.conversation_id, userMessage);
      ipcBridge.conversation.responseStream.emit({
        type: 'user_content',
        conversation_id: agent.conversation_id,
        msg_id: msgId,
        data: content,
      });
    }

    await this.wakeAfterAcceptedDelivery(slot_id, 'agent');
  }

  /** Rename an agent and persist to DB */
  renameAgent(slot_id: string, new_name: string): void {
    this.teammateManager.renameAgent(slot_id, new_name);
    void this.repo.update(this.team_id, { agents: this.teammateManager.getAgents(), updated_at: Date.now() });
  }

  /** Add a new agent to the team at runtime */
  addAgent(agent: TeamAgent): void {
    this.teammateManager.addAgent(agent);
  }

  /** Remove an agent from the team at runtime and clean up its state */
  removeAgent(slot_id: string): void {
    this.teammateManager.removeAgent(slot_id);
  }

  /** Get current agent states */
  getAgents(): TeamAgent[] {
    return this.teammateManager.getAgents();
  }

  /** Clean up all IPC listeners, MCP server, kill agent processes, and EventEmitter handlers */
  async dispose(): Promise<void> {
    // Kill all agent processes before clearing listeners
    for (const agent of this.teammateManager.getAgents()) {
      if (agent.conversation_id) {
        this.workerTaskManager.kill(agent.conversation_id);
      }
    }
    this.teammateManager.dispose();
    try {
      await this.mcpServer.stop();
    } finally {
      this.mcpStdioConfig = null;
      this.removeAllListeners();
    }
  }
}
