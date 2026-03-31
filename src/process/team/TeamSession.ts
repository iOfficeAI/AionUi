// src/process/team/TeamSession.ts
import { EventEmitter } from 'events';
import { ipcBridge } from '@/common';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
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
  private readonly mailbox: Mailbox;
  private readonly taskManager: TaskManager;
  private readonly teammateManager: TeammateManager;
  private readonly mcpServer: TeamMcpServer;
  private mcpStdioConfig: StdioMcpConfig | null = null;

  constructor(team: TTeam, repo: ITeamRepository, workerTaskManager: IWorkerTaskManager, spawnAgent?: SpawnAgentFn) {
    super();
    this.team = team;
    this.teamId = team.id;
    this.mailbox = new Mailbox(repo);
    this.taskManager = new TaskManager(repo);
    this.teammateManager = new TeammateManager({
      teamId: team.id,
      agents: team.agents,
      mailbox: this.mailbox,
      taskManager: this.taskManager,
      workerTaskManager,
      spawnAgent,
    });

    // Create MCP server for team coordination tools
    this.mcpServer = new TeamMcpServer({
      teamId: team.id,
      getAgents: () => this.teammateManager.getAgents(),
      mailbox: this.mailbox,
      taskManager: this.taskManager,
      spawnAgent,
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
      this.teammateManager.setHasMcpTools(true);
    }
    return this.mcpStdioConfig;
  }

  /** Get the MCP stdio config (null if not started) */
  getStdioConfig(): StdioMcpConfig | null {
    return this.mcpStdioConfig;
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

    // Emit user message to lead's conversation so it appears as a user bubble in the chat UI
    if (leadAgent?.conversationId) {
      ipcBridge.conversation.responseStream.emit({
        type: 'user_content',
        conversation_id: leadAgent.conversationId,
        msg_id: crypto.randomUUID(),
        data: content,
      });
    }

    await this.teammateManager.wake(leadSlotId);
  }

  /** Add a new agent to the team at runtime */
  addAgent(agent: TeamAgent): void {
    this.teammateManager.addAgent(agent);
  }

  /** Get current agent states */
  getAgents(): TeamAgent[] {
    return this.teammateManager.getAgents();
  }

  /** Clean up all IPC listeners, MCP server, and EventEmitter handlers */
  async dispose(): Promise<void> {
    this.teammateManager.setHasMcpTools(false);
    this.teammateManager.dispose();
    await this.mcpServer.stop();
    this.mcpStdioConfig = null;
    this.removeAllListeners();
  }
}
