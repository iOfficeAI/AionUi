// src/process/team/TeamSessionService.ts
import { uuid } from '@/common/utils';
import type { ITeamRepository } from './repository/ITeamRepository';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IConversationService } from '@process/services/IConversationService';
import { TeamSession } from './TeamSession';
import type { TTeam, TeamAgent } from './types';

export class TeamSessionService {
  private readonly sessions: Map<string, TeamSession> = new Map();

  constructor(
    private readonly repo: ITeamRepository,
    private readonly workerTaskManager: IWorkerTaskManager,
    private readonly conversationService: IConversationService
  ) {}

  async createTeam(params: {
    userId: string;
    name: string;
    workspace: string;
    workspaceMode: TTeam['workspaceMode'];
    agents: TeamAgent[];
  }): Promise<TTeam> {
    const now = Date.now();
    const team: TTeam = {
      id: uuid(36),
      userId: params.userId,
      name: params.name,
      workspace: params.workspace,
      workspaceMode: params.workspaceMode,
      agents: params.agents,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.create(team);
    return team;
  }

  async getTeam(id: string): Promise<TTeam | null> {
    return this.repo.findById(id);
  }

  async listTeams(userId: string): Promise<TTeam[]> {
    return this.repo.findAll(userId);
  }

  async deleteTeam(id: string): Promise<void> {
    this.sessions.get(id)?.dispose();
    this.sessions.delete(id);
    await this.repo.delete(id);
  }

  async addAgent(teamId: string, agent: Omit<TeamAgent, 'slotId'>): Promise<TeamAgent> {
    const team = await this.repo.findById(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);
    const newAgent: TeamAgent = { ...agent, slotId: `slot-${uuid(8)}` };
    const updatedAgents = [...team.agents, newAgent];
    await this.repo.update(teamId, { agents: updatedAgents, updatedAt: Date.now() });
    this.sessions.get(teamId)?.addAgent(newAgent);
    return newAgent;
  }

  async removeAgent(teamId: string, slotId: string): Promise<void> {
    const team = await this.repo.findById(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);
    const updatedAgents = team.agents.filter((a) => a.slotId !== slotId);
    await this.repo.update(teamId, { agents: updatedAgents, updatedAt: Date.now() });
  }

  async getOrStartSession(teamId: string): Promise<TeamSession> {
    const existing = this.sessions.get(teamId);
    if (existing) return existing;
    const team = await this.repo.findById(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);
    const session = new TeamSession(team, this.workerTaskManager, this.conversationService);
    this.sessions.set(teamId, session);
    return session;
  }

  stopSession(teamId: string): void {
    this.sessions.get(teamId)?.dispose();
    this.sessions.delete(teamId);
  }
}
