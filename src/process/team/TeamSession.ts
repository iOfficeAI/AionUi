// src/process/team/TeamSession.ts
import { EventEmitter } from 'events';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { ITeamRepository } from './repository/ITeamRepository';
import type { TTeam, TeamAgent } from './types';
import { Mailbox } from './Mailbox';
import { TaskManager } from './TaskManager';
import { TeammateManager } from './TeammateManager';

type SpawnAgentFn = (agentName: string, agentType?: string) => Promise<TeamAgent>;

/**
 * Thin coordinator that owns Mailbox, TaskManager, and TeammateManager.
 * All agent orchestration is delegated to TeammateManager.
 */
export class TeamSession extends EventEmitter {
  readonly teamId: string;
  private readonly team: TTeam;
  private readonly mailbox: Mailbox;
  private readonly taskManager: TaskManager;
  private readonly teammateManager: TeammateManager;

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
  }

  /**
   * Send a user message to the team.
   * Writes to the lead agent's mailbox and wakes the lead.
   */
  async sendMessage(content: string): Promise<void> {
    const leadSlotId = this.team.leadAgentId;
    await this.mailbox.write({
      teamId: this.teamId,
      toAgentId: leadSlotId,
      fromAgentId: 'user',
      content,
    });
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

  /** Clean up all IPC listeners and EventEmitter handlers */
  dispose(): void {
    this.teammateManager.dispose();
    this.removeAllListeners();
  }
}
