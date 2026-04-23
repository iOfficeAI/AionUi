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
      base_url: '',
      api_key: '',
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
      base_url: '',
      api_key: '',
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
      const enabledModel = geminiProvider.model.find((model) => geminiProvider.model_enabled?.[model] !== false);
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
      const enabledModel = fallbackProvider.model.find((model) => fallbackProvider.model_enabled?.[model] !== false);
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

    const enabledModel = provider.model?.find((m: string) => provider.model_enabled?.[m] !== false);
    return {
      ...provider,
      useModel: enabledModel || provider.model?.[0],
    } as TProviderWithModel;
  }

  private async resolveConversationModel(params: {
    backend: string;
    is_preset: boolean;
    presetAgentType?: string;
  }): Promise<TProviderWithModel> {
    const { backend, is_preset, presetAgentType } = params;
    const type = getConversationTypeForBackend(is_preset ? presetAgentType || backend : backend);

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

  private async resolvePreferredAcpModelId(agent_type: string): Promise<string | undefined> {
    const acpConfig = await ProcessConfig.get('acp.config');
    const preferredModelId = (acpConfig as Record<string, { preferredModelId?: string } | undefined> | undefined)?.[
      agent_type
    ]?.preferredModelId;
    if (typeof preferredModelId === 'string' && preferredModelId.trim().length > 0) {
      return preferredModelId;
    }

    const cachedModels = await ProcessConfig.get('acp.cachedModels');
    const cachedModelId = cachedModels?.[agent_type]?.current_model_id;
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
    const file_name = (targetLocale: string) =>
      resourceType === 'rules' ? `${assistantId}.${targetLocale}.md` : `${assistantId}-skills.${targetLocale}.md`;

    for (const currentLocale of locales) {
      try {
        return await fs.readFile(path.join(assistantsDir, file_name(currentLocale)), 'utf-8');
      } catch {
        // Try next locale
      }
    }

    const builtinDir = await this.findBuiltinResourceDir(resourceType);
    for (const currentLocale of locales) {
      try {
        return await fs.readFile(path.join(builtinDir, file_name(currentLocale)), 'utf-8');
      } catch {
        // Try next locale
      }
    }

    return '';
  }

  private async loadPresetResources(
    custom_agent_id: string
  ): Promise<{ rules?: string; enabled_skills?: string[]; excludeBuiltinSkills?: string[] }> {
    const language = await ProcessConfig.get('language');
    const localeKey = resolveLocaleKey(language || 'en-US');
    const deps: PresetAssistantResourceDeps = {
      readAssistantRule: ({ assistantId, locale }) => this.readAssistantResource('rules', assistantId, locale),
      readAssistantSkill: ({ assistantId, locale }) => this.readAssistantResource('skills', assistantId, locale),
      readBuiltinRule: async ({ file_name }) => {
        const builtinDir = await this.findBuiltinResourceDir('rules');
        return fs.readFile(path.join(builtinDir, path.basename(file_name)), 'utf-8');
      },
      readBuiltinSkill: async ({ file_name }) => {
        const builtinDir = await this.findBuiltinResourceDir('skills');
        return fs.readFile(path.join(builtinDir, path.basename(file_name)), 'utf-8');
      },
      getEnabledSkills: async (assistantId) => {
        const customAgents = await ProcessConfig.get('assistants');
        return customAgents?.find((agent) => agent.id === assistantId)?.enabled_skills;
      },
      getDisabledBuiltinSkills: async (assistantId) => {
        const customAgents = await ProcessConfig.get('assistants');
        return customAgents?.find((agent) => agent.id === assistantId)?.disabledBuiltinSkills;
      },
      warn: (message, error) => {
        console.warn(message, error);
      },
    };
    const resources = await loadPresetAssistantResources({ custom_agent_id, localeKey }, deps);

    return {
      rules: resources.rules,
      enabled_skills: resources.enabled_skills,
      excludeBuiltinSkills: resources.disabledBuiltinSkills,
    };
  }

  private async buildConversationParams(params: {
    team_id: string;
    teamName: string;
    workspace: string;
    agent: Omit<TeamAgent, 'slot_id'> | TeamAgent;
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
    const { team_id, teamName, workspace, agent, agents, inheritedSessionMode, isInheritedWorkspace } = params;
    const backend = this.resolveBackend(agent.agent_type, agents) as AgentBackend;
    // remote agents use custom_agent_id as remoteAgentId, not as a preset indicator
    const is_preset = Boolean(agent.custom_agent_id) && backend !== 'remote';
    const preferredModelId =
      agent.model ||
      (getConversationTypeForBackend(backend) === 'acp' ? await this.resolvePreferredAcpModelId(backend) : undefined);
    const presetResources =
      is_preset && agent.custom_agent_id ? await this.loadPresetResources(agent.custom_agent_id) : undefined;
    let model = await this.resolveConversationModel({
      backend,
      is_preset,
      presetAgentType: is_preset ? backend : undefined,
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
      name: `${teamName} - ${agent.agent_name}`,
      agent_name: agent.agent_name,
      workspace,
      custom_workspace: Boolean(workspace) && !isInheritedWorkspace,
      model,
      cli_path: agent.cli_path,
      custom_agent_id: agent.custom_agent_id,
      is_preset,
      presetAgentType: is_preset ? backend : undefined,
      presetResources,
      session_mode: inheritedSessionMode,
      current_model_id: preferredModelId,
      extra: {
        team_id,
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
    const extra = conversation.extra as { agent_name?: string } | undefined;
    const explicitName = extra?.agent_name?.trim();
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
      cli_path?: string;
      custom_agent_id?: string;
      preset_assistant_id?: string;
      gateway?: { cli_path?: string };
      teamMcpStdioConfig?: { env?: Array<{ name?: string; value?: string }> };
      current_model_id?: string;
    };
    const slot_id = this.extractRecoveredSlotId(extra);
    const agent_type = this.resolveRecoveredAgentType(conversation);
    if (!slot_id || !agent_type) return null;

    const isLeader = slot_id === team.leader_agent_id;
    return {
      slot_id,
      conversation_id: conversation.id,
      role: isLeader ? 'leader' : 'teammate',
      agent_type,
      agent_name: this.resolveRecoveredAgentName(team, conversation, isLeader),
      conversation_type: conversation.type,
      status: this.mapRecoveredStatus(conversation.status),
      cli_path: extra.cli_path || extra.gateway?.cli_path,
      custom_agent_id: extra.custom_agent_id || extra.preset_assistant_id,
      model: extra.current_model_id || (conversation as { model?: { useModel?: string } }).model?.useModel,
    };
  }

  private async repairTeamAgentsIfMissing(team: TTeam): Promise<TTeam> {
    if (team.agents.length > 0) return team;

    const conversations = await this.conversationService.listAllConversations();
    const linkedConversations = conversations
      .filter((conversation) => (conversation.extra as { team_id?: string } | undefined)?.team_id === team.id)
      .toSorted((left, right) => (right.modified_at ?? 0) - (left.modified_at ?? 0));

    if (linkedConversations.length === 0) return team;

    const recoveredBySlot = new Map<string, TeamAgent>();
    for (const conversation of linkedConversations) {
      const recovered = this.buildRecoveredAgent(team, conversation);
      if (recovered && !recoveredBySlot.has(recovered.slot_id)) {
        recoveredBySlot.set(recovered.slot_id, recovered);
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
      if (left.role === right.role) return left.agent_name.localeCompare(right.agent_name);
      return left.role === 'leader' ? -1 : 1;
    });

    const repairedLead = repairedAgents.find((agent) => agent.role === 'leader') ?? repairedAgents[0];
    const repairedTeam: TTeam = {
      ...team,
      leader_agent_id: repairedLead.slot_id,
      agents: repairedAgents,
      updated_at: Date.now(),
    };

    try {
      await this.repo.update(team.id, {
        agents: repairedTeam.agents,
        leader_agent_id: repairedTeam.leader_agent_id,
        updated_at: repairedTeam.updated_at,
      });
    } catch (error) {
      console.warn(`[TeamSessionService] Failed to persist repaired agents for team ${team.id}:`, error);
    }

    return repairedTeam;
  }

  async createTeam(params: {
    user_id: string;
    name: string;
    workspace: string;
    workspace_mode: TTeam['workspace_mode'];
    agents: TeamAgent[];
    session_mode?: string;
  }): Promise<TTeam> {
    const now = Date.now();
    const team_id = uuid(36);
    let workspace = this.resolveWorkspace(params.workspace);

    // Create a real conversation for each agent (or reuse an existing one for the leader)
    const agentsWithConversations = await Promise.all(
      params.agents.map(async (agent) => {
        const slot_id = agent.slot_id || `slot-${uuid(8)}`;

        // If the agent already has a conversation_id (e.g., leader reusing caller's conversation),
        // verify it exists and adopt it into the team instead of creating a new conversation.
        if (agent.conversation_id) {
          const existing = await this.conversationService.getConversation(agent.conversation_id);
          if (existing) {
            // Only include workspace in the update when it has a real value.
            // An empty string would overwrite the conversation's existing workspace
            // (e.g. the temp dir created during solo-chat init), causing mkdir('') failures.
            const extraUpdate: Record<string, unknown> = { team_id };
            if (workspace) {
              extraUpdate.workspace = workspace;
            }
            await this.conversationService.updateConversation(
              agent.conversation_id,
              { extra: extraUpdate } as any,
              true
            );
            return { ...agent, slot_id, conversation_id: agent.conversation_id };
          }
          // Fall through to create new if conversation was not found
        }

        const conversationParams = await this.buildConversationParams({
          team_id,
          teamName: params.name,
          workspace,
          agent,
          agents: params.agents,
          inheritedSessionMode: params.session_mode,
          isInheritedWorkspace: !params.workspace,
        });
        const conversation = await this.conversationService.createConversation(conversationParams);
        // Ensure team_id is in extra regardless of which factory function was used
        // (some factories like createCodexAgent/createGeminiAgent drop unknown extra fields)
        await this.conversationService.updateConversation(conversation.id, { extra: { team_id } } as any, true);
        return { ...agent, slot_id, conversation_id: conversation.id };
      })
    );

    const leadAgent = agentsWithConversations.find((a) => a.role === 'leader');

    // If workspace was not specified, back-fill from the leader agent's actual conversation workspace.
    // The conversation factory may auto-assign a workspace (stored in extra.workspace), and we need
    // TTeam.workspace to reflect that so all subsequent addAgent calls share the same directory.
    if (!workspace && leadAgent?.conversation_id) {
      const leadConv = await this.conversationService.getConversation(leadAgent.conversation_id);
      const leadExtra = leadConv?.extra as Record<string, unknown> | undefined;
      if (leadExtra?.workspace && typeof leadExtra.workspace === 'string') {
        workspace = leadExtra.workspace;
      }
    }
    if (!leadAgent) throw new Error('Team must have at least one leader agent');

    const team: TTeam = {
      id: team_id,
      user_id: params.user_id,
      name: params.name,
      workspace,
      workspace_mode: params.workspace_mode,
      leader_agent_id: leadAgent.slot_id,
      agents: agentsWithConversations,
      session_mode: params.session_mode,
      created_at: now,
      updated_at: now,
    };
    await this.repo.create(team);
    return team;
  }

  async getTeam(id: string): Promise<TTeam | null> {
    const team = await this.repo.findById(id);
    if (!team) return null;
    return this.repairTeamAgentsIfMissing(team);
  }

  async listTeams(user_id: string): Promise<TTeam[]> {
    return this.repo.findAll(user_id);
  }

  async deleteTeam(id: string): Promise<void> {
    // Kill all agent processes before disposing session and deleting data.
    // This prevents orphan processes that keep running after the team is deleted.
    const team = await this.repo.findById(id);
    if (team) {
      const killResults = await Promise.allSettled(
        team.agents
          .filter((agent) => agent.conversation_id)
          .map((agent) => {
            this.workerTaskManager.kill(agent.conversation_id, 'team_deleted');
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
          .filter((agent) => agent.conversation_id)
          .map((agent) => this.conversationService.deleteConversation(agent.conversation_id))
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

  async addAgent(team_id: string, agent: Omit<TeamAgent, 'slot_id'>): Promise<TeamAgent> {
    // Serialize per-team to prevent concurrent read-modify-write races on the agents array.
    // Without this lock, parallel team_spawn_agent calls read the same stale agents list,
    // and the last writer wins — silently dropping agents added by concurrent calls.
    const prev = this.addAgentLocks.get(team_id) ?? Promise.resolve();
    let resolve!: () => void;
    const lock = new Promise<void>((r) => {
      resolve = r;
    });
    this.addAgentLocks.set(team_id, lock);
    try {
      await prev;
      return await this.addAgentUnsafe(team_id, agent);
    } finally {
      resolve();
      // Clean up the lock entry when it's the last in the chain
      if (this.addAgentLocks.get(team_id) === lock) {
        this.addAgentLocks.delete(team_id);
      }
    }
  }

  private async addAgentUnsafe(team_id: string, agent: Omit<TeamAgent, 'slot_id'>): Promise<TeamAgent> {
    const team = await this.repo.findById(team_id);
    if (!team) throw new Error(`Team "${team_id}" not found`);

    const workspace = this.resolveWorkspace(team.workspace);
    // Inherit session_mode: prefer persisted team.session_mode, fallback to leader agent's conversation extra
    let inheritedSessionMode: string | undefined = team.session_mode;
    if (!inheritedSessionMode) {
      const leadAgent = team.agents.find((a) => a.role === 'leader');
      if (leadAgent?.conversation_id) {
        const leadConv = await this.conversationService.getConversation(leadAgent.conversation_id);
        const leadExtra = leadConv?.extra as Record<string, unknown> | undefined;
        if (leadExtra?.session_mode && typeof leadExtra.session_mode === 'string') {
          inheritedSessionMode = leadExtra.session_mode;
        }
      }
    }

    const conversationParams = await this.buildConversationParams({
      team_id,
      teamName: team.name,
      workspace,
      agent,
      agents: team.agents,
      inheritedSessionMode,
      isInheritedWorkspace: true,
    });
    const conversation = await this.conversationService.createConversation(conversationParams);
    // Ensure team_id is in extra regardless of which factory function was used
    await this.conversationService.updateConversation(conversation.id, { extra: { team_id } } as any, true);

    const newAgent: TeamAgent = {
      ...agent,
      agent_type: this.resolveBackend(agent.agent_type, team.agents),
      slot_id: `slot-${uuid(8)}`,
      conversation_id: conversation.id,
    };
    const updatedAgents = [...team.agents, newAgent];
    await this.repo.update(team_id, { agents: updatedAgents, updated_at: Date.now() });
    this.sessions.get(team_id)?.addAgent(newAgent);
    // Notify renderer so SWR caches (useTeamList, useSiderTeamBadges) revalidate
    ipcBridge.team.listChanged.emit({ team_id, action: 'agent_added' });
    return newAgent;
  }

  private resolveBackend(agent_type: string, agents: TeamAgent[]): string {
    if (agent_type !== 'acp') return agent_type;
    const leader = agents.find((a) => a.role === 'leader');
    return leader && leader.agent_type !== 'acp' ? leader.agent_type : 'claude';
  }

  private resolveConversationType(agent_type: string): AgentType {
    if (agent_type === 'gemini') return 'gemini';
    if (agent_type === 'aionrs') return 'aionrs';
    if (agent_type === 'codex') return 'acp';
    if (agent_type === 'openclaw-gateway') return 'openclaw-gateway';
    if (agent_type === 'nanobot') return 'nanobot';
    if (agent_type === 'remote') return 'remote';
    return 'acp';
  }

  async renameAgent(team_id: string, slot_id: string, new_name: string): Promise<void> {
    // Update in-memory session if running
    const session = this.sessions.get(team_id);
    if (session) {
      session.renameAgent(slot_id, new_name);
      return; // TeamSession.renameAgent already persists
    }
    // No active session — update DB directly
    const team = await this.repo.findById(team_id);
    if (!team) throw new Error(`Team "${team_id}" not found`);
    const updatedAgents = team.agents.map((a) => (a.slot_id === slot_id ? { ...a, agent_name: new_name.trim() } : a));
    await this.repo.update(team_id, { agents: updatedAgents, updated_at: Date.now() });
  }

  async renameTeam(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    await this.repo.update(id, { name: trimmed, updated_at: Date.now() });
  }

  async setSessionMode(team_id: string, session_mode: string): Promise<void> {
    await this.repo.update(team_id, { session_mode, updated_at: Date.now() });
  }

  async updateWorkspace(team_id: string, newWorkspace: string): Promise<void> {
    const team = await this.repo.findById(team_id);
    if (!team) throw new Error(`Team "${team_id}" not found`);

    const now = Date.now();
    await this.repo.update(team_id, { workspace: newWorkspace, updated_at: now });

    for (const agent of team.agents) {
      if (!agent.conversation_id) continue;
      await this.conversationService.updateConversation(
        agent.conversation_id,
        {
          extra: { workspace: newWorkspace, custom_workspace: true },
          modified_at: now,
        } as Partial<TChatConversation>,
        true
      );
    }
  }

  async removeAgent(team_id: string, slot_id: string): Promise<void> {
    const team = await this.repo.findById(team_id);
    if (!team) throw new Error(`Team "${team_id}" not found`);

    // removeAgent handles: kill process + clear in-memory state + persist via onAgentRemoved callback
    const session = this.sessions.get(team_id);
    if (session) {
      session.removeAgent(slot_id);
    } else {
      // No active session — update DB directly
      const updatedAgents = team.agents.filter((a) => a.slot_id !== slot_id);
      await this.repo.update(team_id, { agents: updatedAgents, updated_at: Date.now() });
    }
    // Notify renderer so SWR caches (useTeamList, useSiderTeamBadges) revalidate
    ipcBridge.team.listChanged.emit({ team_id, action: 'agent_removed' });
  }

  async getOrStartSession(team_id: string): Promise<TeamSession> {
    const existing = this.sessions.get(team_id);
    if (existing) return existing;
    const team = await this.getTeam(team_id);
    if (!team) throw new Error(`Team "${team_id}" not found`);
    let session!: TeamSession;
    const spawnAgent = async (agent_name: string, agent_type?: string, model?: string, custom_agent_id?: string) => {
      // Default to the leader's agent type instead of hardcoding 'claude'
      const leadAgent = team.agents.find((a) => a.role === 'leader');
      const resolvedType = agent_type || leadAgent?.agent_type || 'claude';
      const newAgent = await this.addAgent(team_id, {
        conversation_id: '',
        role: 'teammate',
        agent_type: resolvedType,
        agent_name,
        status: 'pending',
        conversation_type: this.resolveConversationType(resolvedType) as 'acp',
        model,
        custom_agent_id,
      });
      // Inject team MCP stdio config into the new agent's conversation (with agent identity)
      const stdioConfig = session?.getStdioConfig(newAgent.slot_id);
      if (stdioConfig && newAgent.conversation_id) {
        await this.conversationService.updateConversation(
          newAgent.conversation_id,
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
          if (agent.conversation_id) {
            const agentStdioConfig = session.getStdioConfig(agent.slot_id);
            try {
              await this.conversationService.updateConversation(
                agent.conversation_id,
                { extra: { teamMcpStdioConfig: agentStdioConfig } } as any,
                true
              );
              // Force-rebuild cached agent task so it reads the updated extra from DB
              await this.workerTaskManager.getOrBuildTask(agent.conversation_id, { skipCache: true });
            } catch (err) {
              const error = err instanceof Error ? err.message : String(err);
              console.error(`[TeamSessionService] Failed to write MCP config for agent ${agent.slot_id}:`, error);
              ipcBridge.team.mcpStatus.emit({
                team_id: team.id,
                slot_id: agent.slot_id,
                phase: 'config_write_failed',
                error,
              });
            }
          }
        })
      );
    } catch (err) {
      // MCP server failed to start — do not cache the broken session so next call can retry
      console.error(`[TeamSessionService] Failed to start session for team ${team_id}:`, err);
      throw err;
    }

    // Only register the session after full initialization so that getOrStartSession
    // always returns a session with a live MCP server and injected DB config.
    this.sessions.set(team_id, session);

    return session;
  }

  async stopSession(team_id: string): Promise<void> {
    await this.sessions.get(team_id)?.dispose();
    this.sessions.delete(team_id);
  }

  async stopAllSessions(): Promise<void> {
    await Promise.all(Array.from(this.sessions.keys()).map((id) => this.stopSession(id)));
  }
}
