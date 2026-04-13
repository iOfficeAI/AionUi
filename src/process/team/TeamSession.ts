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
import { TeamMcpServer, type StdioMcpConfig } from './TeamMcpServer';

type SpawnAgentFn = (agentName: string, agentType?: string) => Promise<TeamAgent>;

/**
 * Thin coordinator that owns Mailbox, TaskManager, TeammateManager, and MCP server.
 * All agent orchestration is delegated to TeammateManager.
 * The MCP server provides team coordination tools to ACP agents.
 */
export class TeamSession extends EventEmitter {
  readonly teamId: string;
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
    this.teamId = team.id;
    this.repo = repo;
    this.workerTaskManager = workerTaskManager;
    this.mailbox = new Mailbox(repo);
    this.taskManager = new TaskManager(repo);
    this.teammateManager = new TeammateManager({
      teamId: team.id,
      agents: team.agents,
      mailbox: this.mailbox,
      taskManager: this.taskManager,
      workerTaskManager,
      spawnAgent,
      teamWorkspace: team.workspace || undefined,
      onAgentRemoved: (teamId, agents) => {
        void this.repo.update(teamId, { agents, updatedAt: Date.now() });
      },
    });

    // Create MCP server for team coordination tools
    this.mcpServer = new TeamMcpServer({
      teamId: team.id,
      getAgents: () => this.teammateManager.getAgents(),
      mailbox: this.mailbox,
      taskManager: this.taskManager,
      spawnAgent,
      renameAgent: (slotId: string, newName: string) => {
        this.teammateManager.renameAgent(slotId, newName);
        void this.repo.update(team.id, { agents: this.teammateManager.getAgents(), updatedAt: Date.now() });
      },
      removeAgent: (slotId: string) => {
        // removeAgent already persists via onAgentRemoved callback
        this.teammateManager.removeAgent(slotId);
      },
      wakeAgent: (slotId: string) => this.teammateManager.wake(slotId),
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

  /** Get the MCP stdio config, optionally tagged with a specific agent's slotId */
  getStdioConfig(agentSlotId?: string): StdioMcpConfig | null {
    if (!this.mcpStdioConfig) return null;
    if (!agentSlotId) return this.mcpStdioConfig;
    // Return a copy with the agent's slotId in env
    return this.mcpServer.getStdioConfig(agentSlotId);
  }

  /**
   * Best-effort wake after a message has already been durably accepted into the
   * team mailbox. Wake failures must not be reported as send failures to the
   * renderer, otherwise the queue may re-enqueue an already-delivered message.
   */
  private async wakeAfterAcceptedDelivery(slotId: string, context: 'team' | 'agent'): Promise<void> {
    try {
      await this.teammateManager.wake(slotId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[TeamSession] Accepted ${context} message but failed to wake ${slotId}:`, message);
    }
  }

  /**
   * Send a user message to the team.
   * Ensures MCP server is started, then writes to the lead agent's mailbox and wakes the lead.
   */
  async sendMessage(content: string): Promise<void> {
    // Ensure MCP server is running before waking agents
    await this.startMcpServer();

    const leadSlotId = this.team.leadAgentId;
    const leadAgent = this.teammateManager.getAgents().find((a) => a.slotId === leadSlotId);

    await this.mailbox.write({
      teamId: this.teamId,
      toAgentId: leadSlotId,
      fromAgentId: 'user',
      content,
    });

    // Persist user message in lead's conversation so it appears as a user bubble in the chat UI
    if (leadAgent?.conversationId) {
      const msgId = crypto.randomUUID();
      const userMessage: TMessage = {
        id: msgId,
        msg_id: msgId,
        type: 'text',
        position: 'right',
        conversation_id: leadAgent.conversationId,
        content: { content },
        createdAt: Date.now(),
      };
      addMessage(leadAgent.conversationId, userMessage);
      ipcBridge.conversation.responseStream.emit({
        type: 'user_content',
        conversation_id: leadAgent.conversationId,
        msg_id: msgId,
        data: content,
      });
    }

    await this.wakeAfterAcceptedDelivery(leadSlotId, 'team');
  }

  /**
   * Send a user message directly to a specific agent (by slotId), bypassing the lead.
   * Ensures MCP server is running, writes to agent's mailbox, persists user bubble, then wakes the agent.
   */
  async sendMessageToAgent(slotId: string, content: string): Promise<void> {
    await this.startMcpServer();

    await this.mailbox.write({
      teamId: this.teamId,
      toAgentId: slotId,
      fromAgentId: 'user',
      content,
    });

    const agent = this.teammateManager.getAgents().find((a) => a.slotId === slotId);
    if (agent?.conversationId) {
      const msgId = crypto.randomUUID();
      const userMessage: TMessage = {
        id: msgId,
        msg_id: msgId,
        type: 'text',
        position: 'right',
        conversation_id: agent.conversationId,
        content: { content },
        createdAt: Date.now(),
      };
      addMessage(agent.conversationId, userMessage);
      ipcBridge.conversation.responseStream.emit({
        type: 'user_content',
        conversation_id: agent.conversationId,
        msg_id: msgId,
        data: content,
      });
    }

    await this.wakeAfterAcceptedDelivery(slotId, 'agent');
  }

  /** Rename an agent and persist to DB */
  renameAgent(slotId: string, newName: string): void {
    this.teammateManager.renameAgent(slotId, newName);
    void this.repo.update(this.teamId, { agents: this.teammateManager.getAgents(), updatedAt: Date.now() });
  }

  /** Add a new agent to the team at runtime */
  addAgent(agent: TeamAgent): void {
    this.teammateManager.addAgent(agent);
  }

  /** Remove an agent from the team at runtime and clean up its state */
  removeAgent(slotId: string): void {
    this.teammateManager.removeAgent(slotId);
  }

  /** Get current agent states */
  getAgents(): TeamAgent[] {
    return this.teammateManager.getAgents();
  }

  /** Clean up all IPC listeners, MCP server, kill agent processes, and EventEmitter handlers */
  async dispose(): Promise<void> {
    // Kill all agent processes before clearing listeners
    for (const agent of this.teammateManager.getAgents()) {
      if (agent.conversationId) {
        this.workerTaskManager.kill(agent.conversationId);
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
