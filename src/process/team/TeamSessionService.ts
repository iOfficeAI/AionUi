// src/process/team/TeamSessionService.ts
import { uuid } from '@/common/utils';
import type { ITeamRepository } from './repository/ITeamRepository';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IConversationService } from '@process/services/IConversationService';
import type { AgentType } from '@process/task/agentTypes';
import type { AcpBackendAll } from '@/common/types/acpTypes';
import type { TProviderWithModel } from '@/common/config/storage';
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

    // Create a real conversation for each agent
    const agentsWithConversations = await Promise.all(
      params.agents.map(async (agent) => {
        const convType = agent.conversationType ?? this.resolveConversationType(agent.agentType);
        const conversation = await this.conversationService.createConversation({
          type: convType,
          name: `${params.name} - ${agent.agentName}`,
          model: {} as TProviderWithModel,
          extra: {
            workspace: params.workspace,
            customWorkspace: Boolean(params.workspace),
            backend: agent.agentType as AcpBackendAll,
            agentName: agent.agentName,
          },
        });
        return { ...agent, conversationId: conversation.id };
      })
    );

    const leadAgent = agentsWithConversations.find((a) => a.role === 'lead');
    if (!leadAgent) throw new Error('Team must have at least one lead agent');

    const team: TTeam = {
      id: uuid(36),
      userId: params.userId,
      name: params.name,
      workspace: params.workspace,
      workspaceMode: params.workspaceMode,
      leadAgentId: leadAgent.slotId,
      agents: agentsWithConversations,
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

    const convType = agent.conversationType ?? this.resolveConversationType(agent.agentType);
    const conversation = await this.conversationService.createConversation({
      type: convType,
      name: `${team.name} - ${agent.agentName}`,
      model: {} as TProviderWithModel,
      extra: {
        workspace: team.workspace,
        customWorkspace: Boolean(team.workspace),
        backend: agent.agentType as AcpBackendAll,
        agentName: agent.agentName,
      },
    });

    const newAgent: TeamAgent = {
      ...agent,
      slotId: `slot-${uuid(8)}`,
      conversationId: conversation.id,
    };
    const updatedAgents = [...team.agents, newAgent];
    await this.repo.update(teamId, { agents: updatedAgents, updatedAt: Date.now() });
    this.sessions.get(teamId)?.addAgent(newAgent);
    return newAgent;
  }

  private resolveConversationType(agentType: string): AgentType {
    if (agentType === 'gemini') return 'gemini';
    if (agentType === 'codex') return 'codex';
    if (agentType === 'openclaw-gateway') return 'openclaw-gateway';
    if (agentType === 'nanobot') return 'nanobot';
    if (agentType === 'remote') return 'remote';
    return 'acp';
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
    const session = new TeamSession(team, this.repo, this.workerTaskManager);
    this.sessions.set(teamId, session);
    return session;
  }

  stopSession(teamId: string): void {
    this.sessions.get(teamId)?.dispose();
    this.sessions.delete(teamId);
  }
}
