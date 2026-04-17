// src/process/acp/compat/AcpAgentV2.ts
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { IMessageAcpToolCall, TMessage } from '@/common/chat/chatLib';
import { NavigationInterceptor } from '@/common/chat/navigation';
import type { AcpModelInfo, AcpResult, AcpSessionConfigOption } from '@/common/types/acpTypes';
import { AcpErrorType, parseInitializeResult } from '@/common/types/acpTypes';
import { getFullAutoMode } from '@/common/types/agentModes';
import { LegacyConnectorFactory } from '@process/acp/compat/LegacyConnectorFactory';
import {
  loadAuthCredentials,
  mapAcpErrorCodeToType,
  toAcpConfigOptions,
  toAcpModelInfo,
  toAgentConfig,
  toResponseMessage,
  type OldAcpAgentConfig,
} from '@process/acp/compat/typeBridge';
import { AcpError as AcpSessionError } from '@process/acp/errors/AcpError';
import { AcpSession, type SessionOptions } from '@process/acp/session/AcpSession';
import { readClaudeModelInfoFromCcSwitch } from '@process/services/ccSwitchModelSource';
// TODO(ACP Discovery): Re-enable when acp_session persistence is restored.
// import type { IAcpSessionRepository } from '@process/services/database/IAcpSessionRepository';
import { getTeamGuideStdioConfig } from '@/process/team/mcp/guide/teamGuideSingleton';
import { waitForMcpReady } from '@/process/team/mcpReadiness';
import { shouldInjectTeamGuideMcp } from '@/process/team/prompts/teamGuideCapability';
import type { McpServer } from '@agentclientprotocol/sdk';
import type {
  AgentConfig,
  ConfigSnapshot,
  ContextUsage,
  ModelSnapshot,
  ModeSnapshot,
  SessionCallbacks,
  SessionStatus,
} from '@process/acp/types';
import { ProcessConfig } from '@process/utils/initStorage';
import { getEnhancedEnv } from '@process/utils/shellEnv';
import { spawn } from 'node:child_process';
import { McpConfig } from '../session/McpConfig';

/**
 * Temporary: backend-specific CLI login arguments.
 * Will be replaced by `authCommand + args` config in PR #2349.
 */
const BACKEND_LOGIN_ARGS: Record<string, string[] | undefined> = {
  claude: ['/login'],
  qwen: ['login'],
};

const LOGIN_TIMEOUT_MS = 70_000;

/**
 * Refresh backend credentials by running the backend CLI login command.
 * Will be replaced by `authCommand + args` config when Agent Hub lands (PR #2349).
 */
async function runBackendLogin(backend: string, cliCommand?: string): Promise<void> {
  const env = getEnhancedEnv();
  const loginArgs = BACKEND_LOGIN_ARGS[backend];
  if (!loginArgs) return;

  const command = cliCommand ?? backend;
  console.log(`[AcpAgentV2] Running ${command} ${loginArgs.join(' ')}`);
  const child = spawn(command, loginArgs, {
    stdio: 'pipe',
    timeout: LOGIN_TIMEOUT_MS,
    env,
  });

  return new Promise<void>((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${backend} ${loginArgs.join(' ')} exited with code ${code}`));
    });
    child.on('error', (err) => {
      reject(new Error(`Failed to spawn ${backend}: ${err.message}`));
    });
  });
}

type PendingOp<T> = {
  resolve: (value: T) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * AcpAgentV2 — Compatibility adapter that presents the OLD AcpAgent interface
 * while internally delegating to the NEW AcpSession.
 *
 * This adapter:
 * - Converts OldAcpAgentConfig → AgentConfig + SessionCallbacks
 * - Routes new SessionCallbacks → old event format (onStreamEvent, onSignalEvent)
 * - Caches model/config state from callbacks for sync getters
 * - Bridges async old API ↔ void new API via pending promises
 */
export class AcpAgentV2 {
  private session: AcpSession | null = null;
  private readonly agentConfig: AgentConfig;
  private conversationId: string;
  private onStreamEvent: (data: IResponseMessage) => void;
  private onSignalEvent?: (data: IResponseMessage) => void;
  private onSessionIdUpdate?: (sessionId: string) => void;
  private onAvailableCommandsUpdate?: (commands: Array<{ name: string; description?: string; hint?: string }>) => void;

  // Cached state from callbacks
  private cachedModelInfo: AcpModelInfo | null = null;
  private cachedConfigOptions: AcpSessionConfigOption[] = [];
  private cachedModes: ModeSnapshot | null = null;
  private lastSessionId: string | null = null;
  private lastStatus: SessionStatus = 'idle';

  // Promise bridges for async methods (Tasks 4-6)
  private startOp: PendingOp<void> | null = null;
  private modelOp: PendingOp<AcpModelInfo | null> | null = null;
  private modeOp: PendingOp<{ success: boolean; error?: string }> | null = null;
  private configOp: PendingOp<AcpSessionConfigOption[]> | null = null;

  // Tool call merge state (compat concern — MessageTranslator is stateless)
  private activeToolCalls = new Map<string, IMessageAcpToolCall>();
  // Auth retry guard — prevent infinite auth loops
  private authRetryAttempted = false;
  // Serialize concurrent capability cache writes across backends
  private static cacheQueue: Promise<void> = Promise.resolve();
  // Claude: inject model identity notice into next prompt after setModel
  private pendingModelSwitchNotice: string | null = null;

  constructor(config: OldAcpAgentConfig) {
    this.conversationId = config.id;
    this.onStreamEvent = config.onStreamEvent as (data: IResponseMessage) => void;
    this.onSignalEvent = config.onSignalEvent as ((data: IResponseMessage) => void) | undefined;
    this.onSessionIdUpdate = config.onSessionIdUpdate;
    this.onAvailableCommandsUpdate = config.onAvailableCommandsUpdate;
    this.agentConfig = toAgentConfig(config);
  }

  /**
   * Create AcpSession (deferred from constructor so authCredentials
   * can be loaded asynchronously from the full shell environment).
   */
  private async ensureSession(): Promise<AcpSession> {
    if (this.session) return this.session;

    // Load credentials from full shell env (survives Gemini's delete process.env.*)
    const creds = await loadAuthCredentials(this.agentConfig.agentBackend, this.agentConfig.env);
    if (creds) {
      (this.agentConfig as { authCredentials?: Record<string, string> }).authCredentials = creds;
    }

    // Inject team-guide MCP server for solo agents (not in team mode) so the
    // agent has the aion_create_team tool available — mirrors AcpAgent.loadBuiltinSessionMcpServers().
    if (!this.agentConfig.teamMcpConfig) {
      if (await shouldInjectTeamGuideMcp(this.agentConfig.agentBackend)) {
        const aionStdioConfig = getTeamGuideStdioConfig();
        if (aionStdioConfig) {
          const guideServer: McpServer = {
            name: aionStdioConfig.name,
            command: aionStdioConfig.command,
            args: aionStdioConfig.args,
            env: [
              ...aionStdioConfig.env,
              { name: 'AION_MCP_BACKEND', value: this.agentConfig.agentBackend },
              { name: 'AION_MCP_CONVERSATION_ID', value: this.conversationId },
            ],
          };
          (this.agentConfig as { presetMcpServers?: McpServer[] }).presetMcpServers = [
            ...(this.agentConfig.presetMcpServers || []),
            guideServer,
          ];
        }
      }
    }

    // Load user-configured (builtin) MCP servers from settings, filtered by
    // cached agent MCP capabilities. Mirrors AcpAgent.loadBuiltinSessionMcpServers().

    const rawMcpServers = await ProcessConfig.get('mcp.config');
    if (Array.isArray(rawMcpServers) && rawMcpServers.length > 0) {
      const cachedInit = await ProcessConfig.get('acp.cachedInitializeResult');
      const caps = cachedInit?.[this.agentConfig.agentBackend]?.capabilities?.mcpCapabilities;
      const userServers = McpConfig.fromStorageConfig(rawMcpServers, caps);
      if (userServers.length > 0) {
        (this.agentConfig as { mcpServers?: McpServer[] }).mcpServers = [
          ...(this.agentConfig.mcpServers || []),
          ...userServers,
        ];
      }
    }

    const callbacks: SessionCallbacks = this.buildCallbacks();
    const clientFactory = new LegacyConnectorFactory();

    // Resolve prompt timeout: per-backend → global → default (300s)
    const acpConfig = (await ProcessConfig.get('acp.config')) as Record<string, { promptTimeout?: number }> | undefined;
    const backendTimeout = acpConfig?.[this.agentConfig.agentBackend]?.promptTimeout;
    const globalTimeout = await ProcessConfig.get('acp.promptTimeout');
    const timeoutSec = backendTimeout || globalTimeout || 300;
    const promptTimeoutMs = Math.max(30, timeoutSec) * 1000;

    const sessionOptions: SessionOptions = {
      promptTimeoutMs,
      maxStartRetries: 3,
      maxResumeRetries: 2,
      initialDesired: this.agentConfig.initialDesired,
    };

    this.session = new AcpSession(this.agentConfig, clientFactory, callbacks, sessionOptions);

    // Wait for team MCP tools to complete handshake before allowing messages.
    // The stdio script sends mcp_ready with TEAM_AGENT_SLOT_ID after server.connect().
    const teamMcp = this.agentConfig.teamMcpConfig;
    const teamSlotId =
      teamMcp && 'env' in teamMcp
        ? teamMcp.env.find((e: { name: string }) => e.name === 'TEAM_AGENT_SLOT_ID')?.value
        : undefined;
    if (teamSlotId) {
      await waitForMcpReady(teamSlotId, 30_000).catch(() => {
        console.warn('[AcpAgentV2] Team MCP readiness timeout, proceeding anyway');
      });
    }

    return this.session;
  }

  /**
   * Build SessionCallbacks that route new events → old event format
   */
  private buildCallbacks(): SessionCallbacks {
    return {
      onInitialize: (result: unknown) => {
        this.cacheInitializeResult(result).catch((err) => {
          console.warn('[AcpAgentV2] Failed to cache initialize result:', err);
        });
      },

      onMessage: (message: TMessage) => {
        // Merge tool call updates with their original tool_call before emitting
        const resolved =
          message.type === 'acp_tool_call' ? this.mergeToolCall(message as IMessageAcpToolCall) : message;

        const oldMsg = toResponseMessage(resolved, this.conversationId);
        // Skip empty messages (e.g., filtered available_commands)
        if (oldMsg.type) {
          this.onStreamEvent(oldMsg);
        }

        // Intercept navigation tools → emit preview_open for chrome-devtools preview
        if (message.type === 'acp_tool_call') {
          this.emitPreviewIfNavigation(message as IMessageAcpToolCall);
        }
      },

      onSessionId: (sessionId: string) => {
        this.lastSessionId = sessionId;
        if (this.onSessionIdUpdate) {
          this.onSessionIdUpdate(sessionId);
        }
      },

      onStatusChange: (status: SessionStatus) => {
        this.lastStatus = status;
        this.persistStatus(status);

        // Resolve startOp when reaching active/error
        if (status === 'active' && this.startOp) {
          this.resolveOp(this.startOp, undefined);
          this.startOp = null;
        } else if (status === 'error' && this.startOp) {
          this.rejectOp(this.startOp, new Error('Session failed to start'));
          this.startOp = null;
        }

        // Emit old-style agent_status event
        const oldStatusName = this.mapStatusToOldName(status);
        this.onStreamEvent({
          type: 'agent_status',
          conversation_id: this.conversationId,
          msg_id: `status_${Date.now()}`,
          data: { status: oldStatusName, backend: this.agentConfig.agentBackend },
        });
      },

      onModelUpdate: (model: ModelSnapshot) => {
        this.cachedModelInfo = toAcpModelInfo(model);

        // Resolve modelOp if pending
        if (this.modelOp) {
          this.resolveOp(this.modelOp, this.cachedModelInfo);
          this.modelOp = null;
        }

        // Emit to old stream event
        this.onStreamEvent({
          type: 'acp_model_info',
          conversation_id: this.conversationId,
          msg_id: `model_${Date.now()}`,
          data: this.cachedModelInfo,
        });

        this.persistSessionCapabilities();
      },

      onModeUpdate: (mode: ModeSnapshot) => {
        this.cachedModes = mode;

        // Resolve modeOp if pending
        if (this.modeOp) {
          this.resolveOp(this.modeOp, { success: true });
          this.modeOp = null;
        }

        this.persistSessionCapabilities();
      },

      onConfigUpdate: (config: ConfigSnapshot) => {
        this.cachedConfigOptions = toAcpConfigOptions(config.configOptions);

        // Resolve configOp if pending
        if (this.configOp) {
          this.resolveOp(this.configOp, this.cachedConfigOptions);
          this.configOp = null;
        }

        // Forward availableCommands to old callback
        if (this.onAvailableCommandsUpdate && config.availableCommands.length > 0) {
          this.onAvailableCommandsUpdate(config.availableCommands);
        }

        this.persistSessionCapabilities();
      },

      onContextUsage: (usage: ContextUsage) => {
        this.onStreamEvent({
          type: 'acp_context_usage',
          conversation_id: this.conversationId,
          msg_id: `usage_${Date.now()}`,
          data: { used: usage.used, size: usage.total, cost: usage.cost },
        });
      },

      onPermissionRequest: (data) => {
        if (this.onSignalEvent) {
          this.onSignalEvent({
            type: 'acp_permission',
            conversation_id: this.conversationId,
            msg_id: data.callId,
            data: {
              toolCall: {
                toolCallId: data.callId,
                title: data.title,
                kind: data.kind,
                rawInput: data.rawInput,
              },
              options: data.options.map((opt) => ({
                optionId: opt.optionId,
                name: opt.label,
              })),
            },
          });
        }
      },

      onSignal: (event) => {
        if (!this.onSignalEvent) return;

        switch (event.type) {
          case 'turn_finished':
            this.onSignalEvent({
              type: 'finish',
              conversation_id: this.conversationId,
              msg_id: `finish_${Date.now()}`,
              data: null,
            });
            break;

          case 'session_expired':
            this.onSignalEvent({
              type: 'error',
              conversation_id: this.conversationId,
              msg_id: `signal_${Date.now()}`,
              data: 'Session expired',
            });
            // Emit finish signal after session_expired
            this.onSignalEvent({
              type: 'finish',
              conversation_id: this.conversationId,
              msg_id: `finish_${Date.now()}`,
              data: null,
            });
            break;

          case 'auth_required':
            // Temporary: run backend-specific login command, then retry.
            // Will be replaced by authCommand + args when Agent Hub lands (PR #2349).
            void this.handleAuthRequired();
            break;

          case 'error':
            this.onSignalEvent({
              type: 'error',
              conversation_id: this.conversationId,
              msg_id: `signal_${Date.now()}`,
              data: event.message,
            });
            break;
        }
      },
    };
  }

  /**
   * Merge tool_call_update into existing tool_call to produce a complete message.
   * The renderer does full replacement by toolCallId, so we must preserve fields
   * (title, kind, etc.) that partial updates don't include.
   */
  private mergeToolCall(message: IMessageAcpToolCall): IMessageAcpToolCall {
    const toolCallId = message.content?.update?.toolCallId;
    if (!toolCallId) return message;

    const existing = this.activeToolCalls.get(toolCallId);
    if (!existing) {
      // First time seeing this toolCallId — store and pass through
      this.activeToolCalls.set(toolCallId, message);
      return message;
    }

    // Merge: new fields override, missing fields preserved from existing
    const merged: IMessageAcpToolCall = {
      ...existing,
      msg_id: toolCallId,
      status: message.status,
      content: {
        ...existing.content,
        update: {
          ...existing.content.update,
          ...message.content.update,
          // Only override non-fallback values
          title:
            message.content.update.title !== 'unknown' ? message.content.update.title : existing.content.update.title,
          kind: message.content.update.kind !== 'execute' ? message.content.update.kind : existing.content.update.kind,
          content: message.content.update.content ?? existing.content.update.content,
          rawInput: message.content.update.rawInput ?? existing.content.update.rawInput,
        },
      },
    };

    this.activeToolCalls.set(toolCallId, merged);

    // Clean up completed/failed tool calls after a delay
    if (message.content.update.status === 'completed' || message.content.update.status === 'failed') {
      setTimeout(() => this.activeToolCalls.delete(toolCallId), 60_000);
    }

    return merged;
  }

  /**
   * Map new 7-state FSM to old status names
   */
  /** Persist status: 7 in-memory states → 4 stable DB states. */
  private persistStatus(_status: SessionStatus): void {
    // TODO(ACP Discovery): Re-enable after fixing agent_id.
    // const stable = this.toStableStatus(status);
    // const suspendedAt = status === 'suspended' ? Date.now() : null;
    // this.acpSessionRepo?.updateStatus(this.conversationId, stable, suspendedAt);
  }

  private toStableStatus(status: SessionStatus): 'idle' | 'active' | 'suspended' | 'error' {
    switch (status) {
      case 'idle':
        return 'idle';
      case 'starting':
      case 'active':
      case 'prompting':
      case 'resuming':
        return 'active';
      case 'suspended':
        return 'suspended';
      case 'error':
        return 'error';
    }
  }

  private mapStatusToOldName(status: SessionStatus): string {
    switch (status) {
      case 'idle':
        return 'disconnected';
      case 'starting':
        return 'connecting';
      case 'active':
        return 'session_active';
      case 'prompting':
        return 'session_active';
      case 'suspended':
        return 'disconnected';
      case 'resuming':
        return 'connecting';
      case 'error':
        return 'error';
      default:
        return 'disconnected';
    }
  }

  // ─── Public Getters ─────────────────────────────────────────────

  get isConnected(): boolean {
    return this.lastStatus !== 'idle' && this.lastStatus !== 'error';
  }

  get hasActiveSession(): boolean {
    return this.lastStatus === 'active' || this.lastStatus === 'prompting';
  }

  get currentSessionId(): string | null {
    return this.lastSessionId;
  }

  // ─── Lifecycle Methods (Task 4) ────────────────────────────────

  async start(): Promise<void> {
    const session = await this.ensureSession();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.startOp = null;
        reject(new Error('Session start timed out'));
      }, 120_000); // 2-minute timeout
      this.startOp = { resolve, reject, timer };
      session.start();
    });
  }

  async kill(): Promise<void> {
    await this.session?.stop();
    this.activeToolCalls.clear();
  }

  cancelPrompt(): void {
    this.session?.cancelPrompt();
  }

  // ─── Messaging + Permission Methods (Task 5) ───────────

  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<AcpResult> {
    try {
      // Emit start event via stream channel so AcpAgentManager.handleStreamEvent
      // can emit request_trace (which checks message.type === 'start')
      if (this.onStreamEvent) {
        this.onStreamEvent({
          type: 'start',
          data: null,
          msg_id: data.msg_id ?? `start_${Date.now()}`,
          conversation_id: this.conversationId,
        });
      }

      // Claude: inject model switch notice so the AI knows its identity changed.
      // In terminal "/model X" outputs into conversation; ACP set_model is silent.
      let content = data.content;
      if (this.pendingModelSwitchNotice) {
        content =
          `<system-reminder>\n` +
          `Model switch: The active model has been changed to ${this.pendingModelSwitchNotice} via the /model command. ` +
          `You are now running as ${this.pendingModelSwitchNotice}. ` +
          `The ANTHROPIC_MODEL environment variable and the earlier "You are powered by" text in the system prompt are stale (cached from session start) and no longer reflect the actual model. ` +
          `When asked which model you are, answer ${this.pendingModelSwitchNotice}.\n` +
          `</system-reminder>\n\n` +
          content;
        this.pendingModelSwitchNotice = null;
      }

      await this.session!.sendMessage(content, data.files);
      return { success: true, data: null };
    } catch (err) {
      const errorType = err instanceof AcpSessionError ? mapAcpErrorCodeToType(err.code) : AcpErrorType.UNKNOWN;
      const retryable = err instanceof AcpSessionError ? err.retryable : false;
      return {
        success: false,
        error: {
          type: errorType,
          code: err instanceof AcpSessionError ? err.code : 'UNKNOWN',
          message: err instanceof Error ? err.message : String(err),
          retryable,
        },
      };
    }
  }

  async confirmMessage(data: { confirmKey: string; callId: string }): Promise<AcpResult> {
    try {
      this.session!.confirmPermission(data.callId, data.confirmKey);
      return { success: true, data: null };
    } catch (err) {
      return {
        success: false,
        error: {
          type: AcpErrorType.UNKNOWN,
          code: 'UNKNOWN',
          message: err instanceof Error ? err.message : String(err),
          retryable: false,
        },
      };
    }
  }

  // ─── Config/Model/Mode Methods (Task 6 — partial) ──────────────

  getModelInfo(): AcpModelInfo | null {
    // Claude: prefer cc-switch model source for accurate model names and slot mapping
    if (this.agentConfig.agentBackend === 'claude') {
      const ccSwitchInfo = readClaudeModelInfoFromCcSwitch();
      if (ccSwitchInfo) {
        // If user has overridden the model via setModel, apply it to cc-switch data
        const currentId = this.cachedModelInfo?.currentModelId;
        if (currentId && ccSwitchInfo.availableModels?.some((m) => m.id === currentId)) {
          const selected = ccSwitchInfo.availableModels.find((m) => m.id === currentId);
          return {
            ...ccSwitchInfo,
            currentModelId: currentId,
            currentModelLabel: selected?.label ?? currentId,
          };
        }
        return ccSwitchInfo;
      }
    }
    return this.cachedModelInfo;
  }

  getConfigOptions(): AcpSessionConfigOption[] {
    return this.cachedConfigOptions.filter((opt) => opt.category !== 'model' && opt.category !== 'mode');
  }

  async setModelByConfigOption(modelId: string): Promise<AcpModelInfo | null> {
    // Queue model switch notice for Claude (ACP set_model is silent, AI doesn't know)
    if (this.agentConfig.agentBackend === 'claude') {
      this.pendingModelSwitchNotice = modelId;
    }
    return new Promise<AcpModelInfo | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.modelOp = null;
        // Timeout fallback: return current cached info
        resolve(this.cachedModelInfo);
      }, 10_000);
      this.modelOp = { resolve, reject, timer };
      this.session!.setModel(modelId);
    });
  }

  async setMode(mode: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.modeOp = null;
        resolve({ success: true }); // Optimistic timeout
      }, 10_000);
      this.modeOp = { resolve, reject, timer };
      this.session!.setMode(mode);
    });
  }

  async setConfigOption(configId: string, value: string): Promise<AcpSessionConfigOption[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.configOp = null;
        resolve(this.cachedConfigOptions); // Fallback to cached
      }, 10_000);
      this.configOp = { resolve, reject, timer };
      this.session!.setConfigOption(configId, value);
    });
  }

  async enableYoloMode(): Promise<void> {
    await this.setMode(getFullAutoMode(this.agentConfig.agentBackend));
  }

  // ─── Helper Methods ─────────────────────────────────────────────

  /**
   * Check if an acp_tool_call is a navigation tool (chrome-devtools) and emit
   * a preview_open event so the URL shows in the preview panel.
   */
  private emitPreviewIfNavigation(message: IMessageAcpToolCall): void {
    const title = message.content?.update?.title;
    const rawInput = message.content?.update?.rawInput as Record<string, unknown> | undefined;
    if (!title) return;

    if (!NavigationInterceptor.isNavigationTool(title)) return;

    const url = NavigationInterceptor.extractUrl({ arguments: rawInput });
    if (!url) return;

    const previewMsg = NavigationInterceptor.createPreviewMessage(url, this.conversationId);
    this.onStreamEvent(previewMsg);
  }

  /**
   * Temporary auth recovery: run backend CLI login command, then retry session.
   *
   * Claude Code doesn't support ACP's authenticate() method — it requires
   * `claude /login` to refresh OAuth tokens. The non-official ACP bridge
   * (claude-agent-acp) can't do this itself.
   *
   * Will be replaced by `authCommand + args` config when Agent Hub lands (PR #2349).
   */
  private async handleAuthRequired(): Promise<void> {
    // Guard: only attempt login once to prevent infinite loops
    // (e.g., expired AWS SSO that can't be refreshed non-interactively)
    if (this.authRetryAttempted) {
      console.warn('[AcpAgentV2] Auth already retried once, giving up');
      this.onSignalEvent?.({
        type: 'error',
        conversation_id: this.conversationId,
        msg_id: `signal_${Date.now()}`,
        data: 'Authentication failed after retry. Please authenticate manually and restart.',
      });
      return;
    }
    this.authRetryAttempted = true;

    const backend = this.agentConfig.agentBackend;
    try {
      await runBackendLogin(backend, this.agentConfig.command);
      // Reload credentials from env after login refreshes tokens
      const creds = await loadAuthCredentials(backend, this.agentConfig.env);
      this.session?.retryAuth(creds ?? undefined);
    } catch (err) {
      console.warn(`[AcpAgentV2] ${backend} auth refresh failed:`, err);
      this.onSignalEvent?.({
        type: 'error',
        conversation_id: this.conversationId,
        msg_id: `signal_${Date.now()}`,
        data: `Authentication failed for ${backend}. Please authenticate manually and restart.`,
      });
    }
  }

  private resolveOp<T>(op: PendingOp<T>, value: T): void {
    clearTimeout(op.timer);
    op.resolve(value);
  }

  private rejectOp<T>(op: PendingOp<T>, err: Error): void {
    clearTimeout(op.timer);
    op.reject(err);
  }

  /**
   * Persist initialize result to disk so team MCP, MCP filtering, and other
   * consumers can read agent capabilities before an active session exists.
   */
  private async cacheInitializeResult(initResult: unknown): Promise<void> {
    const backend = this.agentConfig.agentBackend;
    const cached = (await ProcessConfig.get('acp.cachedInitializeResult')) || {};
    await ProcessConfig.set('acp.cachedInitializeResult', {
      ...cached,
      [backend]: parseInitializeResult(initResult),
    });
  }

  /**
   * Persist session capabilities to disk so Guid page / selectors can render
   * from cache before an active session exists. Uses a static queue to
   * serialize writes when multiple backends start concurrently.
   */
  private persistSessionCapabilities(): void {
    const backend = this.agentConfig.agentBackend;
    const modelInfo = this.cachedModelInfo;
    const configOptions = this.cachedConfigOptions;
    const modes = this.cachedModes;

    const job = AcpAgentV2.cacheQueue.then(async () => {
      if (modelInfo && modelInfo.availableModels && modelInfo.availableModels.length > 0) {
        const cached = (await ProcessConfig.get('acp.cachedModels')) || {};
        const existing = cached[backend];
        await ProcessConfig.set('acp.cachedModels', {
          ...cached,
          [backend]: {
            ...modelInfo,
            // Preserve the original default model from the first session
            currentModelId: existing?.currentModelId ?? modelInfo.currentModelId,
            currentModelLabel: existing?.currentModelLabel ?? modelInfo.currentModelLabel,
          },
        });
      }

      if (configOptions.length > 0) {
        const cached = (await ProcessConfig.get('acp.cachedConfigOptions')) || {};
        await ProcessConfig.set('acp.cachedConfigOptions', {
          ...cached,
          [backend]: configOptions,
        });
      }

      if (modes && modes.availableModes.length > 0) {
        const cached = (await ProcessConfig.get('acp.cachedModes')) || {};
        await ProcessConfig.set('acp.cachedModes', {
          ...cached,
          [backend]: {
            currentModeId: modes.currentModeId ?? undefined,
            availableModes: modes.availableModes.map((m) => ({
              id: m.id,
              name: m.name,
              description: m.description,
            })),
          },
        });
      }
    });
    AcpAgentV2.cacheQueue = job.catch(() => {});
  }
}
