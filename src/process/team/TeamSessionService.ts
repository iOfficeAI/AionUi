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
import os from 'os';

export class TeamSessionService {
  private readonly sessions: Map<string, TeamSession> = new Map();

  constructor(
    private readonly repo: ITeamRepository,
    private readonly workerTaskManager: IWorkerTaskManager,
    private readonly conversationService: IConversationService
  ) {}

  /**
   * Ensure workspace is a non-empty string.
   * Falls back to user home directory when the caller provides an empty or missing value.
   */
  private resolveWorkspace(workspace: string | undefined): string {
    if (workspace && workspace.trim().length > 0) return workspace;
    return os.homedir();
  }

  async createTeam(params: {
    userId: string;
    name: string;
    workspace: string;
    workspaceMode: TTeam['workspaceMode'];
    agents: TeamAgent[];
  }): Promise<TTeam> {
    const now = Date.now();
    const teamId = uuid(36);
    const workspace = this.resolveWorkspace(params.workspace);

    // Create a real conversation for each agent
    const agentsWithConversations = await Promise.all(
      params.agents.map(async (agent) => {
        const convType = (agent.conversationType || this.resolveConversationType(agent.agentType)) as AgentType;
        const extra: Record<string, unknown> = {
          workspace,
          customWorkspace: true,
          backend: this.resolveBackend(agent.agentType, params.agents) as AcpBackendAll,
          agentName: agent.agentName,
          teamId,
        };
        if (agent.cliPath) extra.cliPath = agent.cliPath;

        const conversation = await this.conversationService.createConversation({
          type: convType,
          name: `${params.name} - ${agent.agentName}`,
          model: {} as TProviderWithModel,
          extra,
        });
        // Ensure teamId is in extra regardless of which factory function was used
        // (some factories like createCodexAgent/createGeminiAgent drop unknown extra fields)
        await this.conversationService.updateConversation(conversation.id, { extra: { teamId } } as any, true);
        return { ...agent, conversationId: conversation.id };
      })
    );

    const leadAgent = agentsWithConversations.find((a) => a.role === 'lead');
    if (!leadAgent) throw new Error('Team must have at least one lead agent');

    const team: TTeam = {
      id: teamId,
      userId: params.userId,
      name: params.name,
      workspace,
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
    await this.sessions.get(id)?.dispose();
    this.sessions.delete(id);

    // Delete conversations owned by this team's agents
    const team = await this.repo.findById(id);
    if (team) {
      for (const agent of team.agents) {
        if (agent.conversationId) {
          try {
            await this.conversationService.deleteConversation(agent.conversationId);
          } catch (err) {
            console.warn(`[TeamSessionService] Failed to delete conversation ${agent.conversationId}:`, err);
          }
        }
      }
    }

    await this.repo.deleteMailboxByTeam(id);
    await this.repo.deleteTasksByTeam(id);
    await this.repo.delete(id);
  }

  async addAgent(teamId: string, agent: Omit<TeamAgent, 'slotId'>): Promise<TeamAgent> {
    const team = await this.repo.findById(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);

    const workspace = this.resolveWorkspace(team.workspace);
    const convType = (agent.conversationType || this.resolveConversationType(agent.agentType)) as AgentType;
    // Inherit sessionMode from lead agent so spawned agents share the same permission level
    const leadAgent = team.agents.find((a) => a.role === 'lead');
    let inheritedSessionMode: string | undefined;
    if (leadAgent?.conversationId) {
      const leadConv = await this.conversationService.getConversation(leadAgent.conversationId);
      const leadExtra = leadConv?.extra as Record<string, unknown> | undefined;
      if (leadExtra?.sessionMode && typeof leadExtra.sessionMode === 'string') {
        inheritedSessionMode = leadExtra.sessionMode;
      }
    }

    const addExtra: Record<string, unknown> = {
      workspace,
      customWorkspace: true,
      backend: this.resolveBackend(agent.agentType, team.agents) as AcpBackendAll,
      agentName: agent.agentName,
      teamId,
    };
    if (agent.cliPath) addExtra.cliPath = agent.cliPath;
    if (inheritedSessionMode) addExtra.sessionMode = inheritedSessionMode;

    const conversation = await this.conversationService.createConversation({
      type: convType,
      name: `${team.name} - ${agent.agentName}`,
      model: {} as TProviderWithModel,
      extra: addExtra,
    });
    // Ensure teamId is in extra regardless of which factory function was used
    await this.conversationService.updateConversation(conversation.id, { extra: { teamId } } as any, true);

    const newAgent: TeamAgent = {
      ...agent,
      agentType: this.resolveBackend(agent.agentType, team.agents),
      slotId: `slot-${uuid(8)}`,
      conversationId: conversation.id,
    };
    const updatedAgents = [...team.agents, newAgent];
    await this.repo.update(teamId, { agents: updatedAgents, updatedAt: Date.now() });
    this.sessions.get(teamId)?.addAgent(newAgent);
    return newAgent;
  }

  private resolveBackend(agentType: string, agents: TeamAgent[]): string {
    if (agentType !== 'acp') return agentType;
    const lead = agents.find((a) => a.role === 'lead');
    return lead && lead.agentType !== 'acp' ? lead.agentType : 'claude';
  }

  private resolveConversationType(agentType: string): AgentType {
    if (agentType === 'gemini') return 'gemini';
    if (agentType === 'codex') return 'acp';
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
    const spawnAgent = async (agentName: string, agentType?: string) => {
      const newAgent = await this.addAgent(teamId, {
        conversationId: '',
        role: 'teammate',
        agentType: agentType || 'claude',
        agentName,
        status: 'pending',
        conversationType: this.resolveConversationType(agentType || 'claude') as 'acp',
      });
      // Inject team MCP stdio config into the new agent's conversation (with agent identity)
      const stdioConfig = session.getStdioConfig(newAgent.slotId);
      if (stdioConfig && newAgent.conversationId) {
        await this.conversationService.updateConversation(
          newAgent.conversationId,
          { extra: { teamMcpStdioConfig: stdioConfig } } as any,
          true
        );
      }
      return newAgent;
    };
    const session = new TeamSession(team, this.repo, this.workerTaskManager, spawnAgent);
    this.sessions.set(teamId, session);

    // Start MCP server and inject per-agent stdio config into all agent conversations
    await session.startMcpServer();
    await Promise.all(
      team.agents.map(async (agent) => {
        if (agent.conversationId) {
          const agentStdioConfig = session.getStdioConfig(agent.slotId);
          await this.conversationService.updateConversation(
            agent.conversationId,
            { extra: { teamMcpStdioConfig: agentStdioConfig } } as any,
            true
          );
        }
      })
    );

    return session;
  }

  async stopSession(teamId: string): Promise<void> {
    await this.sessions.get(teamId)?.dispose();
    this.sessions.delete(teamId);
  }

  async stopAllSessions(): Promise<void> {
    await Promise.all(Array.from(this.sessions.keys()).map((id) => this.stopSession(id)));
  }
}
