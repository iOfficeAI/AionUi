// src/process/team/TeamSessionService.ts
import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import { GOOGLE_AUTH_PROVIDER_ID } from '@/common/config/constants';
import {
  buildAgentConversationParams,
  getConversationTypeForBackend,
} from '@/common/utils/buildAgentConversationParams';
import {
  loadPresetAssistantResources,
  type PresetAssistantResourceDeps,
} from '@/common/utils/presetAssistantResources';
import type { ITeamRepository } from './repository/ITeamRepository';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IConversationService } from '@process/services/IConversationService';
import type { AgentType } from '@process/task/agentTypes';
import type { AgentBackend } from '@/common/types/acpTypes';
import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { ProcessConfig } from '@process/utils/initStorage';
import { getAssistantsDir } from '@process/utils/initStorage';
import { TeamSession } from './TeamSession';
import type { TTeam, TeamAgent } from './types';
import fs from 'fs/promises';
import path from 'path';
import { resolveLocaleKey } from '@/common/utils';
import { hasGeminiOauthCreds } from './googleAuthCheck';

export class TeamSessionService {
  private readonly sessions: Map<string, TeamSession> = new Map();
  /** Per-team mutex to serialize addAgent calls, preventing read-modify-write race conditions */
  private readonly addAgentLocks: Map<string, Promise<unknown>> = new Map();

  constructor(
    private readonly repo: ITeamRepository,
    private readonly workerTaskManager: IWorkerTaskManager,
    private readonly conversationService: IConversationService
  ) {}

  /**
   * Returns the workspace path as-is, or empty string when not specified.
   * An empty workspace tells the downstream agent factory (initAgent.ts) to
   * create a temporary workspace (e.g. `gemini-temp-<timestamp>`), matching
   * the single-agent conversation behavior.
   */
  private resolveWorkspace(workspace: string | undefined): string {
    if (workspace && workspace.trim().length > 0) return workspace;
    return '';
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

  private createGeminiPlaceholderModel(): TProviderWithModel {
    return {
      id: 'gemini-placeholder',
      name: 'Gemini',
      useModel: 'default',
      platform: 'gemini-with-google-auth',
      baseUrl: '',
      apiKey: '',
    } as TProviderWithModel;
  }

  private async resolveDefaultGeminiModel(): Promise<TProviderWithModel> {
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
      if (savedGeminiModel.id === GOOGLE_AUTH_PROVIDER_ID && (await hasGeminiOauthCreds())) {
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

    if (await hasGeminiOauthCreds()) {
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

  private async resolveDefaultAionrsModel(): Promise<TProviderWithModel> {
    const configuredProviders = await ProcessConfig.get('model.config');
    const providers = Array.isArray(configuredProviders) ? configuredProviders.filter((p) => p.enabled !== false) : [];

    const provider = providers[0];
    if (!provider) {
      throw new Error('No enabled model provider for Aion CLI');
    }

    const enabledModel = provider.model?.find((m: string) => provider.modelEnabled?.[m] !== false);
    return {
      ...provider,
      useModel: enabledModel || provider.model?.[0],
    } as TProviderWithModel;
  }

  private async resolveConversationModel(params: {
    backend: string;
    isPreset: boolean;
    presetAgentType?: string;
  }): Promise<TProviderWithModel> {
    const { backend, isPreset, presetAgentType } = params;
    const type = getConversationTypeForBackend(isPreset ? presetAgentType || backend : backend);

    if (type === 'gemini') {
      try {
        return await this.resolveDefaultGeminiModel();
      } catch {
        return this.createGeminiPlaceholderModel();
      }
    }

    if (type === 'aionrs') {
      return this.resolveDefaultAionrsModel();
    }

    return {} as TProviderWithModel;
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

  private async findBuiltinResourceDir(resourceType: 'rules' | 'skills'): Promise<string> {
    const base = process.cwd();
    const devDir = resourceType === 'skills' ? 'src/process/resources/skills' : resourceType;
    const candidates = [path.join(base, devDir), path.join(base, '..', devDir), path.join(base, resourceType)];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try next candidate
      }
    }

    return candidates[0];
  }

  private async readAssistantResource(
    resourceType: 'rules' | 'skills',
    assistantId: string,
    locale: string
  ): Promise<string> {
    const assistantsDir = getAssistantsDir();
    const locales = [locale, 'en-US', 'zh-CN'].filter((value, index, values) => values.indexOf(value) === index);
    const fileName = (targetLocale: string) =>
      resourceType === 'rules' ? `${assistantId}.${targetLocale}.md` : `${assistantId}-skills.${targetLocale}.md`;

    for (const currentLocale of locales) {
      try {
        return await fs.readFile(path.join(assistantsDir, fileName(currentLocale)), 'utf-8');
      } catch {
        // Try next locale
      }
    }

    const builtinDir = await this.findBuiltinResourceDir(resourceType);
    for (const currentLocale of locales) {
      try {
        return await fs.readFile(path.join(builtinDir, fileName(currentLocale)), 'utf-8');
      } catch {
        // Try next locale
      }
    }

    return '';
  }

  private async loadPresetResources(
    customAgentId: string
  ): Promise<{ rules?: string; enabledSkills?: string[]; excludeBuiltinSkills?: string[] }> {
    const language = await ProcessConfig.get('language');
    const localeKey = resolveLocaleKey(language || 'en-US');
    const deps: PresetAssistantResourceDeps = {
      readAssistantRule: ({ assistantId, locale }) => this.readAssistantResource('rules', assistantId, locale),
      readAssistantSkill: ({ assistantId, locale }) => this.readAssistantResource('skills', assistantId, locale),
      readBuiltinRule: async ({ fileName }) => {
        const builtinDir = await this.findBuiltinResourceDir('rules');
        return fs.readFile(path.join(builtinDir, path.basename(fileName)), 'utf-8');
      },
      readBuiltinSkill: async ({ fileName }) => {
        const builtinDir = await this.findBuiltinResourceDir('skills');
        return fs.readFile(path.join(builtinDir, path.basename(fileName)), 'utf-8');
      },
      getEnabledSkills: async (assistantId) => {
        const customAgents = await ProcessConfig.get('assistants');
        return customAgents?.find((agent) => agent.id === assistantId)?.enabledSkills;
      },
      getDisabledBuiltinSkills: async (assistantId) => {
        const customAgents = await ProcessConfig.get('assistants');
        return customAgents?.find((agent) => agent.id === assistantId)?.disabledBuiltinSkills;
      },
      warn: (message, error) => {
        console.warn(message, error);
      },
    };
    const resources = await loadPresetAssistantResources({ customAgentId, localeKey }, deps);

    return {
      rules: resources.rules,
      enabledSkills: resources.enabledSkills,
      excludeBuiltinSkills: resources.disabledBuiltinSkills,
    };
  }

  private async buildConversationParams(params: {
    teamId: string;
    teamName: string;
    workspace: string;
    agent: Omit<TeamAgent, 'slotId'> | TeamAgent;
    agents: TeamAgent[];
    inheritedSessionMode?: string;
    /** When true, workspace was inherited (not user-specified) — setupAssistantWorkspace should still run */
    isInheritedWorkspace?: boolean;
  }): Promise<{
    type: AgentType;
    name: string;
    model: TProviderWithModel;
    extra: Record<string, unknown>;
  }> {
    const { teamId, teamName, workspace, agent, agents, inheritedSessionMode, isInheritedWorkspace } = params;
    const backend = this.resolveBackend(agent.agentType, agents) as AgentBackend;
    // remote agents use customAgentId as remoteAgentId, not as a preset indicator
    const isPreset = Boolean(agent.customAgentId) && backend !== 'remote';
    const preferredModelId =
      agent.model ||
      (getConversationTypeForBackend(backend) === 'acp' ? await this.resolvePreferredAcpModelId(backend) : undefined);
    const presetResources =
      isPreset && agent.customAgentId ? await this.loadPresetResources(agent.customAgentId) : undefined;
    let model = await this.resolveConversationModel({
      backend,
      isPreset,
      presetAgentType: isPreset ? backend : undefined,
    });

    // Override useModel for Gemini/Aionrs when agent has an explicit model
    if (agent.model) {
      const type = getConversationTypeForBackend(backend);
      if (type === 'gemini' || type === 'aionrs') {
        model = { ...model, useModel: agent.model };
      }
    }

    return buildAgentConversationParams({
      backend,
      name: `${teamName} - ${agent.agentName}`,
      agentName: agent.agentName,
      workspace,
      customWorkspace: Boolean(workspace) && !isInheritedWorkspace,
      model,
      cliPath: agent.cliPath,
      customAgentId: agent.customAgentId,
      isPreset,
      presetAgentType: isPreset ? backend : undefined,
      presetResources,
      sessionMode: inheritedSessionMode,
      currentModelId: preferredModelId,
      extra: {
        teamId,
      },
    }) as {
      type: AgentType;
      name: string;
      model: TProviderWithModel;
      extra: Record<string, unknown>;
    };
  }

  private extractRecoveredSlotId(
    extra: { teamMcpStdioConfig?: { env?: Array<{ name?: string; value?: string }> } } | undefined
  ): string | undefined {
    return extra?.teamMcpStdioConfig?.env?.find((entry) => entry.name === 'TEAM_AGENT_SLOT_ID')?.value;
  }

  private resolveRecoveredAgentType(conversation: TChatConversation): string | undefined {
    switch (conversation.type) {
      case 'gemini':
        return 'gemini';
      case 'aionrs':
        return 'aionrs';
      case 'remote':
        return 'remote';
      case 'nanobot':
        return 'nanobot';
      case 'openclaw-gateway':
        return (conversation.extra as { backend?: string } | undefined)?.backend || 'openclaw-gateway';
      case 'acp':
        return (conversation.extra as { backend?: string } | undefined)?.backend;
      default:
        return undefined;
    }
  }

  private resolveRecoveredAgentName(team: TTeam, conversation: TChatConversation, isLead: boolean): string {
    const extra = conversation.extra as { agentName?: string } | undefined;
    const explicitName = extra?.agentName?.trim();
    if (explicitName) return explicitName;

    const prefix = `${team.name} - `;
    if (conversation.name.startsWith(prefix)) {
      const derivedName = conversation.name.slice(prefix.length).trim();
      if (derivedName) return derivedName;
    }

    return isLead ? 'Leader' : 'Teammate';
  }

  private mapRecoveredStatus(status: TChatConversation['status']): TeamAgent['status'] {
    switch (status) {
      case 'running':
        return 'active';
      case 'finished':
        return 'idle';
      default:
        return 'pending';
    }
  }

  private buildRecoveredAgent(team: TTeam, conversation: TChatConversation): TeamAgent | null {
    const extra = conversation.extra as {
      cliPath?: string;
      customAgentId?: string;
      presetAssistantId?: string;
      gateway?: { cliPath?: string };
      teamMcpStdioConfig?: { env?: Array<{ name?: string; value?: string }> };
      currentModelId?: string;
    };
    const slotId = this.extractRecoveredSlotId(extra);
    const agentType = this.resolveRecoveredAgentType(conversation);
    if (!slotId || !agentType) return null;

    const isLeader = slotId === team.leaderAgentId;
    return {
      slotId,
      conversationId: conversation.id,
      role: isLeader ? 'leader' : 'teammate',
      agentType,
      agentName: this.resolveRecoveredAgentName(team, conversation, isLeader),
      conversationType: conversation.type,
      status: this.mapRecoveredStatus(conversation.status),
      cliPath: extra.cliPath || extra.gateway?.cliPath,
      customAgentId: extra.customAgentId || extra.presetAssistantId,
      model: extra.currentModelId || (conversation as { model?: { useModel?: string } }).model?.useModel,
    };
  }

  private async repairTeamAgentsIfMissing(team: TTeam): Promise<TTeam> {
    if (team.agents.length > 0) return team;

    const conversations = await this.conversationService.listAllConversations();
    const linkedConversations = conversations
      .filter((conversation) => (conversation.extra as { teamId?: string } | undefined)?.teamId === team.id)
      .toSorted((left, right) => (right.modifyTime ?? 0) - (left.modifyTime ?? 0));

    if (linkedConversations.length === 0) return team;

    const recoveredBySlot = new Map<string, TeamAgent>();
    for (const conversation of linkedConversations) {
      const recovered = this.buildRecoveredAgent(team, conversation);
      if (recovered && !recoveredBySlot.has(recovered.slotId)) {
        recoveredBySlot.set(recovered.slotId, recovered);
      }
    }

    const recoveredAgents = [...recoveredBySlot.values()];
    if (recoveredAgents.length === 0) return team;

    let repairedAgents = recoveredAgents;
    if (!repairedAgents.some((agent) => agent.role === 'leader')) {
      repairedAgents = repairedAgents.map((agent, index) => ({
        ...agent,
        role: index === 0 ? 'leader' : 'teammate',
      }));
    }

    repairedAgents = repairedAgents.toSorted((left, right) => {
      if (left.role === right.role) return left.agentName.localeCompare(right.agentName);
      return left.role === 'leader' ? -1 : 1;
    });

    const repairedLead = repairedAgents.find((agent) => agent.role === 'leader') ?? repairedAgents[0];
    const repairedTeam: TTeam = {
      ...team,
      leaderAgentId: repairedLead.slotId,
      agents: repairedAgents,
      updatedAt: Date.now(),
    };

    try {
      await this.repo.update(team.id, {
        agents: repairedTeam.agents,
        leaderAgentId: repairedTeam.leaderAgentId,
        updatedAt: repairedTeam.updatedAt,
      });
    } catch (error) {
      console.warn(`[TeamSessionService] Failed to persist repaired agents for team ${team.id}:`, error);
    }

    return repairedTeam;
  }

  async createTeam(params: {
    userId: string;
    name: string;
    workspace: string;
    workspaceMode: TTeam['workspaceMode'];
    agents: TeamAgent[];
    sessionMode?: string;
  }): Promise<TTeam> {
    const now = Date.now();
    const teamId = uuid(36);
    let workspace = this.resolveWorkspace(params.workspace);

    // Create a real conversation for each agent (or reuse an existing one for the leader)
    const agentsWithConversations = await Promise.all(
      params.agents.map(async (agent) => {
        const slotId = agent.slotId || `slot-${uuid(8)}`;

        // If the agent already has a conversationId (e.g., leader reusing caller's conversation),
        // verify it exists and adopt it into the team instead of creating a new conversation.
        if (agent.conversationId) {
          const existing = await this.conversationService.getConversation(agent.conversationId);
          if (existing) {
            // Only include workspace in the update when it has a real value.
            // An empty string would overwrite the conversation's existing workspace
            // (e.g. the temp dir created during solo-chat init), causing mkdir('') failures.
            const extraUpdate: Record<string, unknown> = { teamId };
            if (workspace) {
              extraUpdate.workspace = workspace;
            }
            await this.conversationService.updateConversation(
              agent.conversationId,
              { extra: extraUpdate } as any,
              true
            );
            return { ...agent, slotId, conversationId: agent.conversationId };
          }
          // Fall through to create new if conversation was not found
        }

        const conversationParams = await this.buildConversationParams({
          teamId,
          teamName: params.name,
          workspace,
          agent,
          agents: params.agents,
          inheritedSessionMode: params.sessionMode,
          isInheritedWorkspace: !params.workspace,
        });
        const conversation = await this.conversationService.createConversation(conversationParams);
        // Ensure teamId is in extra regardless of which factory function was used
        // (some factories like createCodexAgent/createGeminiAgent drop unknown extra fields)
        await this.conversationService.updateConversation(conversation.id, { extra: { teamId } } as any, true);
        return { ...agent, slotId, conversationId: conversation.id };
      })
    );

    const leadAgent = agentsWithConversations.find((a) => a.role === 'leader');

    // If workspace was not specified, back-fill from the leader agent's actual conversation workspace.
    // The conversation factory may auto-assign a workspace (stored in extra.workspace), and we need
    // TTeam.workspace to reflect that so all subsequent addAgent calls share the same directory.
    if (!workspace && leadAgent?.conversationId) {
      const leadConv = await this.conversationService.getConversation(leadAgent.conversationId);
      const leadExtra = leadConv?.extra as Record<string, unknown> | undefined;
      if (leadExtra?.workspace && typeof leadExtra.workspace === 'string') {
        workspace = leadExtra.workspace;
      }
    }
    if (!leadAgent) throw new Error('Team must have at least one leader agent');

    const team: TTeam = {
      id: teamId,
      userId: params.userId,
      name: params.name,
      workspace,
      workspaceMode: params.workspaceMode,
      leaderAgentId: leadAgent.slotId,
      agents: agentsWithConversations,
      sessionMode: params.sessionMode,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.create(team);
    return team;
  }

  async getTeam(id: string): Promise<TTeam | null> {
    const team = await this.repo.findById(id);
    if (!team) return null;
    return this.repairTeamAgentsIfMissing(team);
  }

  async listTeams(userId: string): Promise<TTeam[]> {
    return this.repo.findAll(userId);
  }

  async deleteTeam(id: string): Promise<void> {
    // Kill all agent processes before disposing session and deleting data.
    // This prevents orphan processes that keep running after the team is deleted.
    const team = await this.repo.findById(id);
    if (team) {
      const killResults = await Promise.allSettled(
        team.agents
          .filter((agent) => agent.conversationId)
          .map((agent) => {
            this.workerTaskManager.kill(agent.conversationId, 'team_deleted');
            return Promise.resolve();
          })
      );
      killResults.forEach((r) => {
        if (r.status === 'rejected') {
          console.warn(`[TeamSessionService] Failed to kill agent process:`, r.reason);
        }
      });
    }

    await this.sessions.get(id)?.dispose();
    this.sessions.delete(id);

    // Delete conversations owned by this team's agents
    if (team) {
      const results = await Promise.allSettled(
        team.agents
          .filter((agent) => agent.conversationId)
          .map((agent) => this.conversationService.deleteConversation(agent.conversationId))
      );
      results.forEach((r) => {
        if (r.status === 'rejected') {
          console.warn(`[TeamSessionService] Failed to delete conversation:`, r.reason);
        }
      });
    }

    await this.repo.deleteMailboxByTeam(id);
    await this.repo.deleteTasksByTeam(id);
    await this.repo.delete(id);
  }

  async addAgent(teamId: string, agent: Omit<TeamAgent, 'slotId'>): Promise<TeamAgent> {
    // Serialize per-team to prevent concurrent read-modify-write races on the agents array.
    // Without this lock, parallel team_spawn_agent calls read the same stale agents list,
    // and the last writer wins — silently dropping agents added by concurrent calls.
    const prev = this.addAgentLocks.get(teamId) ?? Promise.resolve();
    let resolve!: () => void;
    const lock = new Promise<void>((r) => {
      resolve = r;
    });
    this.addAgentLocks.set(teamId, lock);
    try {
      await prev;
      return await this.addAgentUnsafe(teamId, agent);
    } finally {
      resolve();
      // Clean up the lock entry when it's the last in the chain
      if (this.addAgentLocks.get(teamId) === lock) {
        this.addAgentLocks.delete(teamId);
      }
    }
  }

  private async addAgentUnsafe(teamId: string, agent: Omit<TeamAgent, 'slotId'>): Promise<TeamAgent> {
    const team = await this.repo.findById(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);

    const workspace = this.resolveWorkspace(team.workspace);
    // Inherit sessionMode: prefer persisted team.sessionMode, fallback to leader agent's conversation extra
    let inheritedSessionMode: string | undefined = team.sessionMode;
    if (!inheritedSessionMode) {
      const leadAgent = team.agents.find((a) => a.role === 'leader');
      if (leadAgent?.conversationId) {
        const leadConv = await this.conversationService.getConversation(leadAgent.conversationId);
        const leadExtra = leadConv?.extra as Record<string, unknown> | undefined;
        if (leadExtra?.sessionMode && typeof leadExtra.sessionMode === 'string') {
          inheritedSessionMode = leadExtra.sessionMode;
        }
      }
    }

    const conversationParams = await this.buildConversationParams({
      teamId,
      teamName: team.name,
      workspace,
      agent,
      agents: team.agents,
      inheritedSessionMode,
      isInheritedWorkspace: true,
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
    // Notify renderer so SWR caches (useTeamList, useSiderTeamBadges) revalidate
    ipcBridge.team.listChanged.emit({ teamId, action: 'agent_added' });
    return newAgent;
  }

  private resolveBackend(agentType: string, agents: TeamAgent[]): string {
    if (agentType !== 'acp') return agentType;
    const leader = agents.find((a) => a.role === 'leader');
    return leader && leader.agentType !== 'acp' ? leader.agentType : 'claude';
  }

  private resolveConversationType(agentType: string): AgentType {
    if (agentType === 'gemini') return 'gemini';
    if (agentType === 'aionrs') return 'aionrs';
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

  async renameTeam(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    await this.repo.update(id, { name: trimmed, updatedAt: Date.now() });
  }

  async setSessionMode(teamId: string, sessionMode: string): Promise<void> {
    await this.repo.update(teamId, { sessionMode, updatedAt: Date.now() });
  }

  async updateWorkspace(teamId: string, newWorkspace: string): Promise<void> {
    const team = await this.repo.findById(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);

    const now = Date.now();
    await this.repo.update(teamId, { workspace: newWorkspace, updatedAt: now });

    for (const agent of team.agents) {
      if (!agent.conversationId) continue;
      await this.conversationService.updateConversation(
        agent.conversationId,
        {
          extra: { workspace: newWorkspace, customWorkspace: true },
          modifyTime: now,
        } as Partial<TChatConversation>,
        true
      );
    }
  }

  async removeAgent(teamId: string, slotId: string): Promise<void> {
    const team = await this.repo.findById(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);

    // removeAgent handles: kill process + clear in-memory state + persist via onAgentRemoved callback
    const session = this.sessions.get(teamId);
    if (session) {
      session.removeAgent(slotId);
    } else {
      // No active session — update DB directly
      const updatedAgents = team.agents.filter((a) => a.slotId !== slotId);
      await this.repo.update(teamId, { agents: updatedAgents, updatedAt: Date.now() });
    }
    // Notify renderer so SWR caches (useTeamList, useSiderTeamBadges) revalidate
    ipcBridge.team.listChanged.emit({ teamId, action: 'agent_removed' });
  }

  async getOrStartSession(teamId: string): Promise<TeamSession> {
    const existing = this.sessions.get(teamId);
    if (existing) return existing;
    const team = await this.getTeam(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);
    let session!: TeamSession;
    const spawnAgent = async (agentName: string, agentType?: string, model?: string, customAgentId?: string) => {
      // Default to the leader's agent type instead of hardcoding 'claude'
      const leadAgent = team.agents.find((a) => a.role === 'leader');
      const resolvedType = agentType || leadAgent?.agentType || 'claude';
      const newAgent = await this.addAgent(teamId, {
        conversationId: '',
        role: 'teammate',
        agentType: resolvedType,
        agentName,
        status: 'pending',
        conversationType: this.resolveConversationType(resolvedType) as 'acp',
        model,
        customAgentId,
      });
      // Inject team MCP stdio config into the new agent's conversation (with agent identity)
      const stdioConfig = session?.getStdioConfig(newAgent.slotId);
      if (stdioConfig && newAgent.conversationId) {
        await this.conversationService.updateConversation(
          newAgent.conversationId,
          { extra: { teamMcpStdioConfig: stdioConfig } } as any,
          true
        );
      }
      return newAgent;
    };
    session = new TeamSession(team, this.repo, this.workerTaskManager, spawnAgent);
    // Do NOT add to sessions map yet — only add after MCP server is running and
    // teamMcpStdioConfig is written to DB. If we add early and then fail, a
    // subsequent getOrStartSession call would return a broken session (no MCP config).

    try {
      // Start MCP server and inject per-agent stdio config into all agent conversations.
      // After DB update, rebuild cached agent tasks so they pick up teamMcpStdioConfig.
      await session.startMcpServer();
      await Promise.all(
        team.agents.map(async (agent) => {
          if (agent.conversationId) {
            const agentStdioConfig = session.getStdioConfig(agent.slotId);
            try {
              await this.conversationService.updateConversation(
                agent.conversationId,
                { extra: { teamMcpStdioConfig: agentStdioConfig } } as any,
                true
              );
              // Force-rebuild cached agent task so it reads the updated extra from DB
              await this.workerTaskManager.getOrBuildTask(agent.conversationId, { skipCache: true });
            } catch (err) {
              const error = err instanceof Error ? err.message : String(err);
              console.error(`[TeamSessionService] Failed to write MCP config for agent ${agent.slotId}:`, error);
              ipcBridge.team.mcpStatus.emit({
                teamId: team.id,
                slotId: agent.slotId,
                phase: 'config_write_failed',
                error,
              });
            }
          }
        })
      );
    } catch (err) {
      // MCP server failed to start — do not cache the broken session so next call can retry
      console.error(`[TeamSessionService] Failed to start session for team ${teamId}:`, err);
      throw err;
    }

    // Only register the session after full initialization so that getOrStartSession
    // always returns a session with a live MCP server and injected DB config.
    this.sessions.set(teamId, session);

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
