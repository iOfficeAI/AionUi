// src/process/team/TeamSessionService.ts
import { uuid } from '@/common/utils';
import { GOOGLE_AUTH_PROVIDER_ID } from '@/common/config/constants';
import type { ITeamRepository } from './repository/ITeamRepository';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IConversationService } from '@process/services/IConversationService';
import type { AgentType } from '@process/task/agentTypes';
import type { AcpBackendAll } from '@/common/types/acpTypes';
import type { TProviderWithModel } from '@/common/config/storage';
import { ProcessConfig } from '@process/utils/initStorage';
import { TeamSession } from './TeamSession';
import type { TTeam, TeamAgent } from './types';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

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

  private async hasGeminiOauthCreds(): Promise<boolean> {
    try {
      const credsPath = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
      const content = await fs.readFile(credsPath, 'utf-8');
      const creds = JSON.parse(content) as { access_token?: string; refresh_token?: string };
      return Boolean(creds.access_token || creds.refresh_token);
    } catch {
      return false;
    }
  }

  private createGoogleAuthGeminiModel(useModel: string): TProviderWithModel {
    return {
      id: GOOGLE_AUTH_PROVIDER_ID,
      name: 'Gemini Google Auth',
      platform: 'gemini-with-google-auth',
      baseUrl: '',
      apiKey: '',
      model: [useModel],
      useModel,
      enabled: true,
    } as TProviderWithModel;
  }

  private async resolveDefaultModel(): Promise<TProviderWithModel> {
    const savedGeminiModel = await ProcessConfig.get('gemini.defaultModel');
    const configuredProviders = await ProcessConfig.get('model.config');
    const providers = Array.isArray(configuredProviders)
      ? configuredProviders.filter((provider) => provider.enabled !== false)
      : [];

    const buildProviderModel = (provider: (typeof providers)[number], useModel: string): TProviderWithModel => {
      return {
        ...provider,
        useModel,
      } as TProviderWithModel;
    };

    if (
      savedGeminiModel &&
      typeof savedGeminiModel === 'object' &&
      'id' in savedGeminiModel &&
      'useModel' in savedGeminiModel
    ) {
      if (savedGeminiModel.id === GOOGLE_AUTH_PROVIDER_ID && (await this.hasGeminiOauthCreds())) {
        return this.createGoogleAuthGeminiModel(savedGeminiModel.useModel);
      }

      const matchedProvider = providers.find(
        (provider) => provider.id === savedGeminiModel.id && provider.model?.includes(savedGeminiModel.useModel)
      );
      if (matchedProvider) {
        return buildProviderModel(matchedProvider, savedGeminiModel.useModel);
      }
    }

    if (typeof savedGeminiModel === 'string') {
      const matchedProvider = providers.find((provider) => provider.model?.includes(savedGeminiModel));
      if (matchedProvider) {
        return buildProviderModel(matchedProvider, savedGeminiModel);
      }
    }

    const geminiProvider = providers.find((provider) => provider.platform === 'gemini' && provider.model?.length);
    if (geminiProvider) {
      const enabledModel = geminiProvider.model.find((model) => geminiProvider.modelEnabled?.[model] !== false);
      return buildProviderModel(geminiProvider, enabledModel || geminiProvider.model[0]);
    }

    if (await this.hasGeminiOauthCreds()) {
      const oauthModel =
        typeof savedGeminiModel === 'object' && 'useModel' in savedGeminiModel
          ? savedGeminiModel.useModel
          : typeof savedGeminiModel === 'string'
            ? savedGeminiModel
            : 'gemini-2.0-flash';
      return this.createGoogleAuthGeminiModel(oauthModel);
    }

    const fallbackProvider = providers.find((provider) => provider.model?.length);
    if (fallbackProvider) {
      const enabledModel = fallbackProvider.model.find((model) => fallbackProvider.modelEnabled?.[model] !== false);
      return buildProviderModel(fallbackProvider, enabledModel || fallbackProvider.model[0]);
    }

    return this.createGoogleAuthGeminiModel('gemini-2.0-flash');
  }

  private async resolvePreferredAcpModelId(agentType: string): Promise<string | undefined> {
    const acpConfig = await ProcessConfig.get('acp.config');
    const preferredModelId = (acpConfig as Record<string, { preferredModelId?: string } | undefined> | undefined)?.[
      agentType
    ]?.preferredModelId;
    if (typeof preferredModelId === 'string' && preferredModelId.trim().length > 0) {
      return preferredModelId;
    }

    const cachedModels = await ProcessConfig.get('acp.cachedModels');
    const cachedModelId = cachedModels?.[agentType]?.currentModelId;
    if (typeof cachedModelId === 'string' && cachedModelId.trim().length > 0) {
      return cachedModelId;
    }

    return undefined;
  }

  private async buildConversationParams(params: {
    teamId: string;
    teamName: string;
    workspace: string;
    agent: Omit<TeamAgent, 'slotId'> | TeamAgent;
    agents: TeamAgent[];
    inheritedSessionMode?: string;
    inheritedModelId?: string;
  }): Promise<{
    type: AgentType;
    name: string;
    model: TProviderWithModel;
    extra: Record<string, unknown>;
  }> {
    const { teamId, teamName, workspace, agent, agents, inheritedSessionMode, inheritedModelId } = params;
    const convType = (agent.conversationType || this.resolveConversationType(agent.agentType)) as AgentType;
    const backend = this.resolveBackend(agent.agentType, agents) as AcpBackendAll;
    const model = await this.resolveDefaultModel();
    const extra: Record<string, unknown> = {
      workspace,
      customWorkspace: true,
      backend,
      agentName: agent.agentName,
      teamId,
    };

    if (agent.cliPath) extra.cliPath = agent.cliPath;
    if (agent.customAgentId) extra.presetAssistantId = agent.customAgentId;
    if (inheritedSessionMode) extra.sessionMode = inheritedSessionMode;

    if (convType === 'acp') {
      const preferredModelId = inheritedModelId || (await this.resolvePreferredAcpModelId(backend));
      if (preferredModelId) extra.currentModelId = preferredModelId;
    }

    return {
      type: convType,
      name: `${teamName} - ${agent.agentName}`,
      model,
      extra,
    };
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
        const conversationParams = await this.buildConversationParams({
          teamId,
          teamName: params.name,
          workspace,
          agent,
          agents: params.agents,
        });
        const conversation = await this.conversationService.createConversation(conversationParams);
        // Ensure teamId is in extra regardless of which factory function was used
        // (some factories like createCodexAgent/createGeminiAgent drop unknown extra fields)
        await this.conversationService.updateConversation(conversation.id, { extra: { teamId } } as any, true);
        const slotId = agent.slotId || `slot-${uuid(8)}`;
        return { ...agent, slotId, conversationId: conversation.id };
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
    // Inherit sessionMode from lead agent so spawned agents share the same permission level
    const leadAgent = team.agents.find((a) => a.role === 'lead');
    let inheritedSessionMode: string | undefined;
    let inheritedModelId: string | undefined;
    if (leadAgent?.conversationId) {
      const leadConv = await this.conversationService.getConversation(leadAgent.conversationId);
      const leadExtra = leadConv?.extra as Record<string, unknown> | undefined;
      if (leadExtra?.sessionMode && typeof leadExtra.sessionMode === 'string') {
        inheritedSessionMode = leadExtra.sessionMode;
      }
      const newMemberBackend = this.resolveBackend(agent.agentType, team.agents);
      const leadBackend = leadExtra?.backend as string | undefined;
      if (
        newMemberBackend === leadBackend &&
        leadExtra?.currentModelId &&
        typeof leadExtra.currentModelId === 'string'
      ) {
        inheritedModelId = leadExtra.currentModelId;
      }
    }

    const conversationParams = await this.buildConversationParams({
      teamId,
      teamName: team.name,
      workspace,
      agent,
      agents: team.agents,
      inheritedSessionMode,
      inheritedModelId,
    });
    const conversation = await this.conversationService.createConversation(conversationParams);
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

  async renameAgent(teamId: string, slotId: string, newName: string): Promise<void> {
    // Update in-memory session if running
    const session = this.sessions.get(teamId);
    if (session) {
      session.renameAgent(slotId, newName);
      return; // TeamSession.renameAgent already persists
    }
    // No active session — update DB directly
    const team = await this.repo.findById(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);
    const updatedAgents = team.agents.map((a) => (a.slotId === slotId ? { ...a, agentName: newName.trim() } : a));
    await this.repo.update(teamId, { agents: updatedAgents, updatedAt: Date.now() });
  }

  async removeAgent(teamId: string, slotId: string): Promise<void> {
    const team = await this.repo.findById(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);

    // If there's an active session, clean up in-memory state first
    const session = this.sessions.get(teamId);
    if (session) {
      session.removeAgent(slotId);
    }

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

    // Start MCP server and inject per-agent stdio config into all agent conversations.
    // After DB update, rebuild cached agent tasks so they pick up teamMcpStdioConfig.
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
          // Force-rebuild cached agent task so it reads the updated extra from DB
          await this.workerTaskManager.getOrBuildTask(agent.conversationId, { skipCache: true });
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
