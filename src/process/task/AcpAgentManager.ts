import { AcpAgent } from '@process/agent/acp';
import { channelEventBus } from '@process/channels/agent/ChannelEventBus';
import { teamEventBus } from '@process/team/teamEventBus';
import { ipcBridge } from '@/common';
import type { CronMessageMeta, TMessage } from '@/common/chat/chatLib';
import { isCodexAutoApproveMode } from '@/common/types/codex/codexModes';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import { transformMessage } from '@/common/chat/chatLib';
import type { IConfigStorageRefer } from '@/common/config/storage';
import { AIONUI_FILES_MARKER } from '@/common/config/constants';
import type {
  ConversationCompletionSource,
  ConversationTurnTimings,
  IResponseMessage,
} from '@/common/adapter/ipcBridge';
import { parseError, uuid } from '@/common/utils';
import type {
  AcpBackendAll,
  AcpModelInfo,
  AcpPermissionOption,
  AcpPermissionRequest,
  AcpPromptResponseUsage,
  AcpResult,
  AcpBackendConfig,
  AcpSessionConfigOption,
} from '@/common/types/acpTypes';
import { ACP_BACKENDS_ALL } from '@/common/types/acpTypes';
import { ExtensionRegistry } from '@process/extensions';
import { getDatabase, getDatabaseSync } from '@process/services/database';
import { ProcessConfig } from '@process/utils/initStorage';
import { addMessage, addOrUpdateMessage, nextTickToLocalFinish } from '@process/utils/message';
import { handlePreviewOpenEvent } from '@process/utils/previewUtils';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { ConversationTurnCompletionService } from '@process/services/ConversationTurnCompletionService';
import { skillSuggestWatcher } from '@process/services/cron/SkillSuggestWatcher';
import { getTeamGuidePrompt } from '@process/team/prompts/teamGuidePrompt.ts';
import {
  getCodexSandboxModeForSessionMode,
  writeCodexSandboxMode,
  type CodexSandboxMode,
} from '@process/utils/codexConfig';
import { mainWarn, mainError } from '@process/utils/mainLogger';
import { prepareFirstMessageWithSkillsIndex } from './agentUtils';
import { shouldInjectTeamGuideMcp } from '@process/team/prompts/teamGuideCapability.ts';
/** Enable ACP performance diagnostics via ACP_PERF=1 */
const ACP_PERF_LOG = process.env.ACP_PERF === '1';

import BaseAgentManager from './BaseAgentManager';
import { IpcAgentEventEmitter } from './IpcAgentEventEmitter';
import type { AgentKillReason } from './IAgentManager';
import { hasCronCommands } from './CronCommandDetector';
import { hasNativeSkillSupport, resolveBuiltinCliPath } from '@process/utils/initAgent';
import { extractTextFromMessage, processCronInMessage } from './MessageMiddleware';
import { stripThinkTags } from './ThinkTagDetector';

interface AcpAgentManagerData {
  workspace?: string;
  backend: AcpBackendAll;
  cliPath?: string;
  customWorkspace?: boolean;
  conversation_id: string;
  customAgentId?: string; // 用于标识特定自定义代理的 UUID / UUID for identifying specific custom agent
  /** Display name for the agent (from extension or custom config) / Agent 显示名称（来自扩展或自定义配置） */
  agentName?: string;
  presetContext?: string; // 智能助手的预设规则/提示词 / Preset context from smart assistant
  /** 启用的 skills 列表，用于过滤 SkillManager 加载的 skills / Enabled skills list for filtering SkillManager skills */
  enabledSkills?: string[];
  /** Force yolo mode (auto-approve) - used by CronService for scheduled tasks */
  yoloMode?: boolean;
  /** ACP session ID for resume support / ACP session ID 用于会话恢复 */
  acpSessionId?: string;
  /** Last update time of ACP session / ACP session 最后更新时间 */
  acpSessionUpdatedAt?: number;
  /** Persisted session mode for resume support / 持久化的会话模式，用于恢复 */
  sessionMode?: string;
  /** Persisted model ID for resume support / 持久化的模型 ID，用于恢复 */
  currentModelId?: string;
  /** Persisted ACP config option values for resume support / 持久化的 ACP 配置选项值，用于恢复 */
  configOptionValues?: Record<string, string>;
  sandboxMode?: CodexSandboxMode;
  /** Pending config option selections from Guid page (applied after session creation) */
  pendingConfigOptions?: Record<string, string>;
}

type BufferedStreamTextMessage = {
  conversationId: string;
  backend: AcpBackendAll;
  message: Extract<TMessage, { type: 'text' }>;
  timer: ReturnType<typeof setTimeout>;
};

type CustomAgentLaunchConfig = Pick<AcpBackendConfig, 'id' | 'name' | 'defaultCliPath' | 'acpArgs' | 'env'>;

class AcpAgentManager extends BaseAgentManager<AcpAgentManagerData, AcpPermissionOption> {
  workspace: string;
  agent: AcpAgent;
  private bootstrap: Promise<AcpAgent> | undefined;
  private bootstrapping: boolean = false;
  private isFirstMessage: boolean = true;
  options: AcpAgentManagerData;
  private currentMode: string = 'default';
  private persistedModelId: string | null = null;
  private persistedConfigOptionValues: Record<string, string>;
  private pendingPromptUsage: AcpPromptResponseUsage | null = null;
  private pendingContextUsage: { used: number; size: number; cost?: { amount: number; currency: string } } | null =
    null;
  // Track current message for cron detection (accumulated from streaming chunks)
  private currentMsgId: string | null = null;
  private currentMsgContent: string = '';
  private acpAvailableSlashCommands: SlashCommandItem[] = [];
  private acpAvailableSlashWaiters: Array<(commands: SlashCommandItem[]) => void> = [];
  private readonly streamDbFlushIntervalMs = 120;
  private readonly bufferedStreamTextMessages = new Map<string, BufferedStreamTextMessage>();
  private missingFinishFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private missingFinishFallbackTurnId: number | null = null;
  private nextTrackedTurnId: number = 0;
  private activeTrackedTurnId: number | null = null;
  private activeTrackedTurnHasRuntimeActivity: boolean = false;
  private activeTrackedTurnPromptResolved: boolean = false;
  private readonly completedTrackedTurnIds = new Set<number>();
  private readonly missingFinishFallbackDelayMs = 2000;
  private currentTurnTimings: ConversationTurnTimings = {};

  constructor(data: AcpAgentManagerData) {
    super('acp', data, new IpcAgentEventEmitter());
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;
    this.options = data;
    this.currentMode = data.sessionMode || 'default';
    this.persistedModelId = data.currentModelId || null;
    this.persistedConfigOptionValues = { ...data.configOptionValues };
    this.status = 'pending';
    // Sync yoloMode from sessionMode so addConfirmation auto-approves when Full Auto is selected
    this.yoloMode = this.yoloMode || this.isYoloMode(this.currentMode);
  }

  private resolveNativeSkillSupport(): boolean {
    if (hasNativeSkillSupport(this.options.backend)) {
      return true;
    }

    if (this.options.backend === 'custom' && this.options.customAgentId?.startsWith('ext:')) {
      try {
        const [, extensionName, ...idParts] = this.options.customAgentId.split(':');
        const adapterId = idParts.join(':');
        const adapter = ExtensionRegistry.getInstance()
          .getAcpAdapters()
          .find((item) => {
            const record = item as Record<string, unknown>;
            return record._extensionName === extensionName && record.id === adapterId;
          }) as Record<string, unknown> | undefined;

        if (adapter && Array.isArray(adapter.skillsDirs) && adapter.skillsDirs.length > 0) {
          return true;
        }
      } catch {
        // Ignore extension lookup failures and fall back to prompt injection.
      }
    }

    return false;
  }

  private makeStreamBufferKey(message: Extract<TMessage, { type: 'text' }>): string {
    return `${message.conversation_id}:${message.msg_id || message.id}`;
  }

  private queueBufferedStreamTextMessage(message: Extract<TMessage, { type: 'text' }>, backend: AcpBackendAll): void {
    const key = this.makeStreamBufferKey(message);
    const existing = this.bufferedStreamTextMessages.get(key);
    if (existing) {
      this.bufferedStreamTextMessages.set(key, {
        ...existing,
        message: {
          ...existing.message,
          content: {
            ...existing.message.content,
            content: existing.message.content.content + message.content.content,
          },
        },
      });
      return;
    }

    const bufferedMessage: Extract<TMessage, { type: 'text' }> = {
      ...message,
      content: { ...message.content },
    };
    const timer = setTimeout(() => {
      this.flushBufferedStreamTextMessage(key);
    }, this.streamDbFlushIntervalMs);

    this.bufferedStreamTextMessages.set(key, {
      conversationId: message.conversation_id,
      backend,
      message: bufferedMessage,
      timer,
    });
  }

  private flushBufferedStreamTextMessage(key: string): void {
    const buffered = this.bufferedStreamTextMessages.get(key);
    if (!buffered) return;

    clearTimeout(buffered.timer);
    this.bufferedStreamTextMessages.delete(key);
    addOrUpdateMessage(buffered.conversationId, buffered.message, buffered.backend);
  }

  private flushBufferedStreamTextMessages(): void {
    if (this.bufferedStreamTextMessages.size === 0) return;
    const keys = Array.from(this.bufferedStreamTextMessages.keys());
    for (const key of keys) {
      this.flushBufferedStreamTextMessage(key);
    }
  }

  private flushThinkingToDb(_msgId?: string, _status: 'thinking' | 'done' = 'done'): void {
    // ACP does not buffer thinking content into the DB the way text streaming is buffered,
    // so kill() only needs a no-op hook here to keep the shutdown path type-safe.
  }
  private beginTrackedTurn(): number {
    this.clearMissingFinishFallback();
    const turnId = this.nextTrackedTurnId + 1;
    this.nextTrackedTurnId = turnId;
    this.activeTrackedTurnId = turnId;
    this.activeTrackedTurnHasRuntimeActivity = false;
    this.activeTrackedTurnPromptResolved = false;
    this.currentTurnTimings = {
      startedAt: Date.now(),
    };
    return turnId;
  }

  private markTrackedTurnFinished(turnId: number): void {
    if (this.activeTrackedTurnId === turnId) {
      this.activeTrackedTurnId = null;
      this.activeTrackedTurnHasRuntimeActivity = false;
      this.clearMissingFinishFallback();
    }
    this.completedTrackedTurnIds.add(turnId);
  }

  private markActiveTurnFinished(): void {
    if (this.activeTrackedTurnId !== null) {
      this.markTrackedTurnFinished(this.activeTrackedTurnId);
    }
  }

  private consumeTrackedTurnFinished(turnId: number): boolean {
    const hasFinished = this.completedTrackedTurnIds.has(turnId);
    if (hasFinished) {
      if (this.activeTrackedTurnId === turnId) {
        this.activeTrackedTurnId = null;
      }
      this.completedTrackedTurnIds.delete(turnId);
    }
    return hasFinished;
  }

  private clearTrackedTurn(turnId: number): void {
    if (this.activeTrackedTurnId === turnId) {
      this.activeTrackedTurnId = null;
      this.activeTrackedTurnHasRuntimeActivity = false;
      this.activeTrackedTurnPromptResolved = false;
      this.clearMissingFinishFallback();
    }
    this.completedTrackedTurnIds.delete(turnId);
  }

  private markTrackedTurnRuntimeActivity(): void {
    this._lastActivityAt = Date.now();
    if (this.activeTrackedTurnId === null) {
      return;
    }

    this.activeTrackedTurnHasRuntimeActivity = true;
  }

  private markTrackedTurnFirstChunk(messageType: string): void {
    if (!['content', 'acp_tool_call', 'plan', 'thinking'].includes(messageType)) {
      return;
    }

    if (!this.currentTurnTimings.firstChunkAt) {
      this.currentTurnTimings.firstChunkAt = Date.now();
    }
  }

  private markTrackedTurnPromptResolved(turnId: number): void {
    if (this.activeTrackedTurnId !== turnId) {
      return;
    }

    this.activeTrackedTurnPromptResolved = true;
    if (!this.currentTurnTimings.promptResolvedAt) {
      this.currentTurnTimings.promptResolvedAt = Date.now();
    }
  }

  private resolveCompletionSource(signal: IResponseMessage): ConversationCompletionSource {
    if (signal.completionSource) {
      return signal.completionSource;
    }

    if (signal.data && typeof signal.data === 'object') {
      const finishData = signal.data as { agentCrash?: boolean; error?: string };
      if (finishData.agentCrash) {
        return 'disconnect';
      }
      if (typeof finishData.error === 'string' && finishData.error.trim()) {
        return 'error';
      }
    }

    return 'finish_signal';
  }

  private buildFinishSignal(
    signal: IResponseMessage,
    completionSource: ConversationCompletionSource
  ): IResponseMessage {
    const finishEmittedAt = Date.now();
    const turnTimings: ConversationTurnTimings = {
      ...this.currentTurnTimings,
      finishEmittedAt,
    };

    if (completionSource === 'end_turn') {
      turnTimings.endTurnAt = turnTimings.endTurnAt ?? finishEmittedAt;
      turnTimings.promptResolvedAt = turnTimings.promptResolvedAt ?? finishEmittedAt;
    }

    if (completionSource === 'synthetic') {
      turnTimings.syntheticFinishAt = turnTimings.syntheticFinishAt ?? finishEmittedAt;
    }

    this.currentTurnTimings = turnTimings;

    return {
      ...signal,
      turnPhase: 'finalizing',
      completionSource,
      turnTimings,
    };
  }

  private clearMissingFinishFallback(): void {
    if (this.missingFinishFallbackTimer) {
      clearTimeout(this.missingFinishFallbackTimer);
      this.missingFinishFallbackTimer = null;
    }
    this.missingFinishFallbackTurnId = null;
  }

  private scheduleMissingFinishFallback(): void {
    const turnId = this.activeTrackedTurnId;
    if (turnId === null) {
      return;
    }

    this.clearMissingFinishFallback();
    this.missingFinishFallbackTurnId = turnId;
    this.missingFinishFallbackTimer = setTimeout(() => {
      void this.handleMissingFinishFallback(turnId);
    }, this.missingFinishFallbackDelayMs);
  }

  private async handleMissingFinishFallback(turnId: number): Promise<void> {
    if (this.missingFinishFallbackTurnId !== turnId) {
      return;
    }

    this.clearMissingFinishFallback();
    if (this.activeTrackedTurnId !== turnId || this.completedTrackedTurnIds.has(turnId)) {
      return;
    }

    if (this.getConfirmations().length > 0) {
      return;
    }

    if (!this.activeTrackedTurnPromptResolved) {
      return;
    }

    this.markTrackedTurnFinished(turnId);
    mainWarn(
      '[AcpAgentManager]',
      `ACP prompt resolved without finish signal; synthesizing finish for ${this.conversation_id} (${this.options.backend})`
    );

    const shouldNotifyTurnCompleted = await this.handleFinishSignal(
      {
        type: 'finish',
        conversation_id: this.conversation_id,
        msg_id: uuid(),
        data: null,
        completionSource: 'synthetic',
      },
      this.options.backend,
      { trackActiveTurn: false }
    );

    if (shouldNotifyTurnCompleted) {
      void ConversationTurnCompletionService.getInstance().notifyPotentialCompletion(this.conversation_id);
    }
  }

  private async sendAgentMessageWithFinishFallback(data: {
    content: string;
    files?: string[];
    msg_id?: string;
  }): Promise<AcpResult> {
    const turnId = this.beginTrackedTurn();

    try {
      const result = await this.agent.sendMessage(data);
      this.markTrackedTurnPromptResolved(turnId);
      if (this.consumeTrackedTurnFinished(turnId)) {
        return result;
      }

      if (this.activeTrackedTurnId === turnId && this.activeTrackedTurnHasRuntimeActivity) {
        this.scheduleMissingFinishFallback();
        return result;
      }

      this.clearTrackedTurn(turnId);
      mainWarn(
        '[AcpAgentManager]',
        `ACP turn resolved without runtime activity or finish signal; synthesizing finish for ${this.conversation_id} (${this.options.backend})`
      );
      const shouldNotifyTurnCompleted = await this.handleFinishSignal(
        {
          type: 'finish',
          conversation_id: this.conversation_id,
          msg_id: data.msg_id || uuid(),
          data: null,
          completionSource: 'synthetic',
        },
        this.options.backend,
        { trackActiveTurn: false }
      );
      if (shouldNotifyTurnCompleted) {
        void ConversationTurnCompletionService.getInstance().notifyPotentialCompletion(this.conversation_id);
      }
      return result;
    } catch (error) {
      this.clearTrackedTurn(turnId);
      throw error;
    }
  }

  initAgent(data: AcpAgentManagerData = this.options) {
    if (this.bootstrap) return this.bootstrap;
    this.bootstrapping = true;
    this.bootstrap = (async () => {
      let cliPath = data.cliPath;
      let customArgs: string[] | undefined;
      let customEnv: Record<string, string> | undefined;
      let yoloMode: boolean | undefined;

      // 处理自定义后端：优先读 acp.customAgents；若未命中则尝试扩展贡献的 adapter
      // Handle custom backend: prefer acp.customAgents; fallback to extension-contributed adapters
      if (data.backend === 'custom' && data.customAgentId) {
        const customAgents = await ProcessConfig.get('acp.customAgents');
        // 通过 UUID 查找对应的自定义代理配置 / Find custom agent config by UUID
        let customAgentConfig: CustomAgentLaunchConfig | undefined = customAgents?.find(
          (agent) => agent.id === data.customAgentId
        );

        // Fallback: extension adapter (customAgentId format: ext:{extensionName}:{adapterId})
        if (!customAgentConfig && data.customAgentId.startsWith('ext:')) {
          const [, extensionName, ...idParts] = data.customAgentId.split(':');
          const adapterId = idParts.join(':');
          const adapter = ExtensionRegistry.getInstance()
            .getAcpAdapters()
            .find((item) => {
              const record = item as Record<string, unknown>;
              return record._extensionName === extensionName && record.id === adapterId;
            }) as Record<string, unknown> | undefined;

          if (adapter) {
            customAgentConfig = {
              id: data.customAgentId,
              name: typeof adapter.name === 'string' ? adapter.name : data.customAgentId,
              defaultCliPath: typeof adapter.defaultCliPath === 'string' ? adapter.defaultCliPath : undefined,
              acpArgs: Array.isArray(adapter.acpArgs)
                ? adapter.acpArgs.filter((v): v is string => typeof v === 'string')
                : undefined,
              env: typeof adapter.env === 'object' && adapter.env ? (adapter.env as Record<string, string>) : undefined,
            };
          }
        }

        if (customAgentConfig?.defaultCliPath) {
          // Pass the full defaultCliPath to createGenericSpawnConfig which handles
          // command parsing (npx detection, Windows shell quoting, etc.).
          // Previously we split here which broke paths with spaces on Windows
          // and lost npx package arguments when acpArgs was also set.
          cliPath = customAgentConfig.defaultCliPath.trim();
          customArgs = customAgentConfig.acpArgs;
          customEnv = customAgentConfig.env;
        }
      } else if (data.backend !== 'custom') {
        // Handle built-in backends: read from acp.config
        const config = await ProcessConfig.get('acp.config');
        const codexConfig = data.backend === 'codex' ? await ProcessConfig.get('codex.config') : undefined;
        cliPath = await resolveBuiltinCliPath(data.backend, cliPath);
        // yoloMode priority: data.yoloMode (from CronService) > config setting
        // yoloMode 优先级：data.yoloMode（来自 CronService）> 配置设置
        const legacyYoloMode = data.yoloMode ?? config?.[data.backend]?.yoloMode;

        // Migrate legacy yoloMode config (from SecurityModalContent) to currentMode.
        // Maps to each backend's native yolo mode value for correct protocol behavior.
        // Skip when sessionMode was explicitly provided (user made a choice on Guid page).
        if (legacyYoloMode && this.currentMode === 'default' && !data.sessionMode) {
          const yoloModeValues: Record<string, string> = {
            claude: 'bypassPermissions',
            qwen: 'yolo',
            iflow: 'yolo',
            codex: 'yolo',
          };
          this.currentMode = yoloModeValues[data.backend] || 'yolo';
          this.yoloMode = true;
        }

        // When legacy config has yoloMode=true but user explicitly chose a non-yolo mode
        // on the Guid page, clear the legacy config so it won't re-activate next time.
        if (legacyYoloMode && data.sessionMode && !this.isYoloMode(data.sessionMode)) {
          void this.clearLegacyYoloConfig();
        }

        // Derive effective yoloMode from currentMode so that the agent respects
        // the user's explicit mode choice. data.yoloMode (cron jobs) always takes priority.
        yoloMode = data.yoloMode ?? this.isYoloMode(this.currentMode);

        // Get acpArgs from backend config (for goose, auggie, opencode, etc.)
        const backendConfig = ACP_BACKENDS_ALL[data.backend];
        if (backendConfig?.acpArgs) {
          customArgs = backendConfig.acpArgs;
        }

        // 如果没有配置 cliPath，使用 ACP_BACKENDS_ALL 中的默认 cliCommand
        // If cliPath is not configured, fallback to default cliCommand from ACP_BACKENDS_ALL
        if (!cliPath && backendConfig?.cliCommand) {
          cliPath = backendConfig.cliCommand;
        }

        if (data.backend === 'codex') {
          const sandboxMode = getCodexSandboxModeForSessionMode(
            data.sessionMode || this.currentMode,
            data.sandboxMode || codexConfig?.sandboxMode || 'workspace-write'
          ) as CodexSandboxMode;
          await writeCodexSandboxMode(sandboxMode);
          data.sandboxMode = sandboxMode;
        }
      } else {
        // backend === 'custom' but no customAgentId - this is an invalid state
        // 自定义后端但缺少 customAgentId - 这是无效状态
        mainWarn('[AcpAgentManager]', 'Custom backend specified but customAgentId is missing');
      }

      this.agent = new AcpAgent({
        id: data.conversation_id,
        backend: data.backend,
        cliPath: cliPath,
        workingDir: data.workspace,
        customArgs: customArgs,
        customEnv: customEnv,
        extra: {
          workspace: data.workspace,
          backend: data.backend,
          cliPath: cliPath,
          customWorkspace: data.customWorkspace,
          customArgs: customArgs,
          customEnv: customEnv,
          yoloMode: yoloMode,
          agentName: data.agentName,
          acpSessionId: data.acpSessionId,
          acpSessionUpdatedAt: data.acpSessionUpdatedAt,
          currentModelId: this.persistedModelId ?? undefined,
          sessionMode: this.currentMode,
          pendingConfigOptions: data.pendingConfigOptions,
          // Forward team MCP stdio config so AcpAgent.loadBuiltinSessionMcpServers() can inject it
          teamMcpStdioConfig: (data as unknown as Record<string, unknown>).teamMcpStdioConfig as
            | { name: string; command: string; args: string[]; env: Array<{ name: string; value: string }> }
            | undefined,
        },
        onSessionIdUpdate: (sessionId: string) => {
          // Save ACP session ID to database for resume support
          // 保存 ACP session ID 到数据库以支持会话恢复
          this.saveAcpSessionId(sessionId);
        },
        onAvailableCommandsUpdate: (commands) => {
          const nextCommands: SlashCommandItem[] = [];
          const seen = new Set<string>();
          for (const command of commands) {
            const name = command.name.trim();
            if (!name || seen.has(name)) continue;
            seen.add(name);
            nextCommands.push({
              name,
              description: command.description || name,
              hint: command.hint,
              kind: 'template',
              source: 'acp',
            });
          }
          this.acpAvailableSlashCommands = nextCommands;
          ipcBridge.acpConversation.responseStream.emit({
            type: 'slash_commands_updated',
            conversation_id: this.conversation_id,
            msg_id: '',
            data: null,
          });
          const waiters = this.acpAvailableSlashWaiters.splice(0, this.acpAvailableSlashWaiters.length);
          for (const resolve of waiters) {
            resolve(this.getAcpSlashCommands());
          }
        },
        onStreamEvent: (message) => {
          // During bootstrap (warmup), suppress UI stream events to avoid
          // triggering sidebar loading spinner before user sends a message.
          if (this.bootstrapping) {
            return;
          }

          const pipelineStart = Date.now();
          cronBusyGuard.touchActivity(this.conversation_id);
          this.markTrackedTurnRuntimeActivity();
          this.markTrackedTurnFirstChunk(message.type);

          // Reduce status noise: show full lifecycle only for the first turn.
          // After first turn, only keep failure statuses to avoid reconnect chatter.
          if (message.type === 'agent_status') {
            const status = (message.data as { status?: string } | null)?.status;
            const shouldDisplayStatus = this.isFirstMessage || status === 'error' || status === 'disconnected';
            if (!shouldDisplayStatus) {
              return;
            }
          }

          // Handle preview_open event (chrome-devtools navigation interception)
          // 处理 preview_open 事件（chrome-devtools 导航拦截）
          if (handlePreviewOpenEvent(message)) {
            return; // Don't process further / 不需要继续处理
          }

          // Emit request trace on each model generation start
          if (message.type === 'start') {
            this.resetCurrentTurnTracking();
            const modelInfo = this.agent?.getModelInfo();
            const traceData = {
              agentType: 'acp' as const,
              backend: data.backend,
              modelId: modelInfo?.currentModelId || this.persistedModelId || 'unknown',
              cliPath: this.options?.cliPath,
              sessionMode: this.currentMode,
              timestamp: Date.now(),
            };
            ipcBridge.acpConversation.responseStream.emit({
              type: 'request_trace',
              conversation_id: this.conversation_id,
              msg_id: uuid(),
              data: traceData,
            });
          }

          // Persist config options to DB so AcpConfigSelector can render from cache
          if (message.type === 'acp_model_info') {
            const configOptions = this.getConfigOptions();
            if (configOptions.length > 0) {
              void this.saveConfigOptions(configOptions);
            }
          }

          // Persist context usage to conversation extra for restore on page switch
          if (message.type === 'acp_context_usage') {
            const usageData = message.data as {
              used: number;
              size: number;
              cost?: { amount: number; currency: string };
            };
            this.pendingContextUsage = usageData;
            this.saveContextUsage(usageData);
          }

          if (message.type !== 'thought' && message.type !== 'acp_model_info' && message.type !== 'acp_context_usage') {
            const transformStart = Date.now();
            const tMessage = transformMessage(message as IResponseMessage);
            const transformDuration = Date.now() - transformStart;

            if (tMessage) {
              const dbStart = Date.now();
              const isStreamTextChunk = tMessage.type === 'text' && message.type === 'content';
              if (isStreamTextChunk) {
                this.queueBufferedStreamTextMessage(tMessage, data.backend);
              } else {
                this.flushBufferedStreamTextMessages();
                addOrUpdateMessage(message.conversation_id, tMessage, data.backend);
              }
              const dbDuration = Date.now() - dbStart;

              if (transformDuration > 5 || dbDuration > 5) {
                if (ACP_PERF_LOG)
                  console.log(
                    `[ACP-PERF] stream: transform ${transformDuration}ms, db ${dbDuration}ms type=${message.type}`
                  );
              }

              // Track streaming content for cron detection when turn ends
              // ACP sends content in chunks, we accumulate here for later detection
              if (isStreamTextChunk) {
                const textContent = extractTextFromMessage(tMessage);
                if (tMessage.msg_id !== this.currentMsgId) {
                  // New message, reset accumulator
                  this.currentMsgId = tMessage.msg_id || null;
                  this.currentMsgContent = textContent;
                } else {
                  // Same message, accumulate content
                  this.currentMsgContent += textContent;
                }
              }
            }
          }

          // Filter think tags from streaming content before emitting to UI
          // 在发送到 UI 之前过滤流式内容中的 think 标签
          const filterStart = Date.now();
          const filteredMessage = this.filterThinkTagsFromMessage(message as IResponseMessage);
          const filterDuration = Date.now() - filterStart;

          const emitStart = Date.now();
          ipcBridge.acpConversation.responseStream.emit(filteredMessage);
          teamEventBus.emit('responseStream', {
            ...filteredMessage,
            conversation_id: this.conversation_id,
          });
          const emitDuration = Date.now() - emitStart;

          // Also emit to Channel global event bus (Telegram/Lark streaming)
          // 同时发送到 Channel 全局事件总线（用于 Telegram/Lark 等外部平台）
          channelEventBus.emitAgentMessage(this.conversation_id, {
            ...filteredMessage,
            conversation_id: this.conversation_id,
          });

          const totalDuration = Date.now() - pipelineStart;
          if (totalDuration > 10) {
            if (ACP_PERF_LOG)
              console.log(
                `[ACP-PERF] stream: onStreamEvent pipeline ${totalDuration}ms (filter=${filterDuration}ms, emit=${emitDuration}ms) type=${message.type}`
              );
          }
        },
        onSignalEvent: async (v) => {
          if (v.type === 'finish') {
            const shouldNotifyTurnCompleted = await this.handleFinishSignal(v, data.backend);
            if (shouldNotifyTurnCompleted) {
              void ConversationTurnCompletionService.getInstance().notifyPotentialCompletion(this.conversation_id);
            }
            return;
          }

          cronBusyGuard.touchActivity(this.conversation_id);
          this.markTrackedTurnRuntimeActivity();
          // Flush buffered text chunks before handling turn-level signals
          this.flushBufferedStreamTextMessages();

          // 仅发送信号到前端，不更新消息列表
          if (v.type === 'acp_permission') {
            this.clearMissingFinishFallback();
            const { toolCall, options } = v.data as AcpPermissionRequest;
            const toolTitle = toolCall.title || '';
            if ((this.isYoloMode(this.currentMode) || toolTitle.includes('aionui-team')) && options.length > 0) {
              const autoOption = options[0];
              setTimeout(() => {
                void this.confirm(v.msg_id, toolCall.toolCallId || v.msg_id, autoOption);
              }, 50);
              return;
            }
            this.addConfirmation({
              title: toolCall.title || 'messages.permissionRequest',
              action: 'messages.command',
              id: v.msg_id,
              description: toolCall.rawInput?.description || 'messages.agentRequestingPermission',
              callId: toolCall.toolCallId || v.msg_id,
              options: options.map((option) => ({
                label: option.name,
                value: option,
              })),
            });

            // Channels (Telegram/Lark) currently don't have interactive permission UX.
            // Emit a readable error to avoid "silent hang" in external platforms.
            channelEventBus.emitAgentMessage(this.conversation_id, {
              type: 'error',
              conversation_id: this.conversation_id,
              msg_id: v.msg_id,
              data: 'Permission required. Please open AionUi and confirm the pending request in the conversation panel.',
            });
            return;
          }

          ipcBridge.acpConversation.responseStream.emit(v);
          teamEventBus.emit('responseStream', {
            ...v,
            conversation_id: this.conversation_id,
          });

          // Forward signals (finish/error/etc.) to Channel global event bus
          const forwardedSignal = {
            ...(v as IResponseMessage),
            conversation_id: this.conversation_id,
          };
          channelEventBus.emitAgentMessage(this.conversation_id, forwardedSignal);
        },
      });
      const agentConnection = (
        this.agent as unknown as {
          connection?: {
            onPromptUsage?: (usage: AcpPromptResponseUsage) => void;
          };
        }
      ).connection;
      if (agentConnection?.onPromptUsage) {
        const previousOnPromptUsage = agentConnection.onPromptUsage;
        agentConnection.onPromptUsage = (usage: AcpPromptResponseUsage) => {
          this.pendingPromptUsage = usage;
          previousOnPromptUsage(usage);
        };
      }
      return this.agent.start().then(async () => {
        // Re-apply persisted mode after session start/resume
        // 在会话启动/恢复后重新应用持久化的模式
        // Codex bridge does not implement ACP session/set_mode.
        // Its approval behavior is applied locally before session start.
        if (this.options.backend !== 'codex' && this.currentMode && this.currentMode !== 'default') {
          try {
            await this.agent.setMode(this.currentMode);
          } catch (error) {
            mainWarn('[AcpAgentManager]', `Failed to re-apply mode ${this.currentMode}`, error);
          }
        }
        // Re-apply persisted model if current model differs from persisted one
        // 如果当前模型与持久化模型不同，重新应用持久化的模型
        if (this.persistedModelId) {
          const currentInfo = this.agent.getModelInfo();
          // Validate persisted model exists in current available models before re-applying.
          // Stale cache may reference models that no longer exist (e.g., gpt-5.3-codex).
          const isModelAvailable = currentInfo?.availableModels?.some((m) => m.id === this.persistedModelId);
          if (!isModelAvailable) {
            mainWarn(
              '[AcpAgentManager]',
              `Persisted model ${this.persistedModelId} is not in available models, clearing`
            );
            this.persistedModelId = null;
          } else if (currentInfo?.currentModelId !== this.persistedModelId) {
            try {
              await this.agent.setModelByConfigOption(this.persistedModelId);
            } catch (error) {
              const errMsg = error instanceof Error ? error.message : String(error);
              mainWarn('[AcpAgentManager]', `Failed to re-apply model ${this.persistedModelId}`, error);
              // Emit visible error for relay/proxy compatibility issues
              if (errMsg.includes('model_not_found') || errMsg.includes('无可用渠道')) {
                ipcBridge.acpConversation.responseStream.emit({
                  type: 'error',
                  conversation_id: this.conversation_id,
                  msg_id: `model_error_${Date.now()}`,
                  data:
                    `Model "${this.persistedModelId}" is not available on your API relay service. ` +
                    `Please add this model to your relay's channel configuration. Falling back to the default model.`,
                });
              }
              this.persistedModelId = null;
            }
          }
        }
        const configOptions = this.agent.getConfigOptions();
        if (configOptions.length > 0) {
          for (const option of configOptions) {
            const nextValue = this.persistedConfigOptionValues[option.id];
            if (!nextValue) continue;

            const isValueAvailable = option.options?.some((choice) => choice.value === nextValue) ?? true;
            if (!isValueAvailable) {
              mainWarn(
                '[AcpAgentManager]',
                `Persisted config option ${option.id}=${nextValue} is not available, clearing`
              );
              delete this.persistedConfigOptionValues[option.id];
              continue;
            }

            const currentValue = option.currentValue || option.selectedValue || '';
            if (currentValue === nextValue) {
              continue;
            }

            try {
              await this.agent.setConfigOption(option.id, nextValue);
            } catch (error) {
              mainWarn('[AcpAgentManager]', `Failed to re-apply config option ${option.id}=${nextValue}`, error);
              delete this.persistedConfigOptionValues[option.id];
            }
          }
        }
        const readyConfigOptions = this.agent.getConfigOptions();
        if (readyConfigOptions.length > 0) {
          // Warmup suppresses acp_model_info events, so persist the ready-state
          // options here and let the renderer render from cache immediately.
          void this.saveConfigOptions(readyConfigOptions);
          void this.cacheConfigOptions(readyConfigOptions);
        }
        // Cache model list for Guid page pre-selection after agent starts
        const modelInfo = this.agent.getModelInfo();
        if (modelInfo && modelInfo.availableModels?.length > 0) {
          void this.cacheModelList(modelInfo);
        }
        this.bootstrapping = false;
        if (modelInfo) {
          // Re-emit once warmup completes so model/config selectors refresh
          // without requiring the user to switch tabs or remount the view.
          ipcBridge.acpConversation.responseStream.emit({
            type: 'acp_model_info',
            conversation_id: this.conversation_id,
            msg_id: uuid(),
            data: modelInfo,
          });
        }
        return this.agent;
      });
    })();
    return this.bootstrap;
  }

  async sendMessage(data: {
    content: string;
    files?: string[];
    msg_id?: string;
    cronMeta?: CronMessageMeta;
    hidden?: boolean;
    silent?: boolean;
  }): Promise<{
    success: boolean;
    msg?: string;
    message?: string;
  }> {
    // Allow stream events through once user actually sends a message,
    // so initAgent progress (agent_status) is visible during the wait.
    this.bootstrapping = false;
    this._lastActivityAt = Date.now();

    const managerSendStart = Date.now();
    // Mark conversation as busy to prevent cron jobs from running
    cronBusyGuard.setProcessing(this.conversation_id, true);
    // Set status to running when message is being processed
    this.status = 'running';
    try {
      // Emit/persist user message immediately so UI can refresh without waiting
      // for ACP connection/auth/session initialization.
      if (data.msg_id && data.content && !data.silent) {
        const userMessage: TMessage = {
          id: data.msg_id,
          msg_id: data.msg_id,
          type: 'text',
          position: 'right',
          conversation_id: this.conversation_id,
          content: {
            content: data.content,
            ...(data.cronMeta && { cronMeta: data.cronMeta }),
          },
          createdAt: Date.now(),
          ...(data.hidden && { hidden: true }),
        };
        addMessage(this.conversation_id, userMessage);
        // Ensure conversation list sorting updates immediately after user sends.
        try {
          (await getDatabase()).updateConversation(this.conversation_id, {});
        } catch {
          // Conversation might not exist in DB yet
        }
        const userResponseMessage: IResponseMessage = {
          type: 'user_content',
          conversation_id: this.conversation_id,
          msg_id: data.msg_id,
          data: data.cronMeta
            ? { content: userMessage.content.content, cronMeta: data.cronMeta }
            : userMessage.content.content,
        };
        ipcBridge.acpConversation.responseStream.emit(userResponseMessage);
      }

      await this.initAgent(this.options);

      if (data.msg_id && data.content) {
        let contentToSend = data.content;
        if (contentToSend.includes(AIONUI_FILES_MARKER)) {
          contentToSend = contentToSend.split(AIONUI_FILES_MARKER)[0].trimEnd();
        }

        // 首条消息时注入预设规则和 skills
        // Inject preset rules and skills on first message
        //
        // Symlinks 仅在临时工作空间创建；自定义工作空间跳过 symlink 以避免污染用户目录。
        // Symlinks are only created for temp workspaces; custom workspaces skip symlinks.
        // 因此自定义工作空间或不支持原生 skill 发现的 backend 都需要通过 prompt 注入 skills。
        // So custom workspaces or backends without native skill discovery need prompt injection.
        if (this.isFirstMessage) {
          const isInTeam = Boolean((this.options as unknown as Record<string, unknown>).teamMcpStdioConfig);
          const useNativeSkills = this.resolveNativeSkillSupport() && !this.options.customWorkspace;
          if (useNativeSkills) {
            // Native skill discovery via workspace symlinks — only inject preset rules
            const parts: string[] = [];
            if (this.options.presetContext) {
              parts.push(this.options.presetContext);
            }
            if (!isInTeam && (await shouldInjectTeamGuideMcp(this.options.backend))) {
              parts.push(getTeamGuidePrompt(this.options.backend));
            }
            if (parts.length > 0) {
              contentToSend = `[Assistant Rules - You MUST follow these instructions]\n${parts.join(
                '\n\n'
              )}\n\n[User Request]\n${contentToSend}`;
            }
          } else {
            // Custom workspace or no native support — inject rules + skills via prompt
            const prepared = await prepareFirstMessageWithSkillsIndex(contentToSend, {
              presetContext: this.options.presetContext,
              enabledSkills: this.options.enabledSkills,
              enableTeamGuide: !isInTeam && (await shouldInjectTeamGuideMcp(this.options.backend)),
              backend: this.options.backend,
            });
            contentToSend = prepared.content;
          }
        }

        const result = await this.sendAgentMessageWithFinishFallback({
          ...data,
          content: contentToSend,
        });
        // 首条消息发送后标记，无论是否有 presetContext
        if (this.isFirstMessage) {
          this.isFirstMessage = false;
        }
        // Note: cronBusyGuard.setProcessing(false) is not called here
        // because the response streaming is still in progress.
        // It will be cleared when the conversation ends or on error.
        return result;
      }
      const agentSendStart = Date.now();
      const result = await this.sendAgentMessageWithFinishFallback(data);
      if (ACP_PERF_LOG)
        console.log(
          `[ACP-PERF] manager: agent.sendMessage completed ${Date.now() - agentSendStart}ms (total manager.sendMessage: ${Date.now() - managerSendStart}ms)`
        );
      if (!result.success) {
        this.clearMissingFinishFallback();
        this.flushBufferedStreamTextMessages();
        cronBusyGuard.setProcessing(this.conversation_id, false);
        this.status = 'finished';
      }
      return result;
    } catch (e) {
      this.clearMissingFinishFallback();
      this.flushBufferedStreamTextMessages();
      cronBusyGuard.setProcessing(this.conversation_id, false);
      this.status = 'finished';
      const message: IResponseMessage = {
        type: 'error',
        conversation_id: this.conversation_id,
        msg_id: data.msg_id || uuid(),
        data: parseError(e),
      };

      // Backend handles persistence before emitting to frontend
      const tMessage = transformMessage(message);
      if (tMessage) {
        addOrUpdateMessage(this.conversation_id, tMessage);
      }

      // Emit to frontend for UI display only
      ipcBridge.acpConversation.responseStream.emit(message);

      // Emit finish signal so the frontend resets loading state
      // (mirrors AcpAgent.handleDisconnect pattern)
      const finishMessage: IResponseMessage = {
        type: 'finish',
        conversation_id: this.conversation_id,
        msg_id: uuid(),
        data: null,
        turnPhase: 'finalizing',
        completionSource: 'error',
        turnTimings: {
          ...this.currentTurnTimings,
          finishEmittedAt: Date.now(),
        },
      };
      ipcBridge.acpConversation.responseStream.emit(finishMessage);
      void ConversationTurnCompletionService.getInstance().notifyPotentialCompletion(this.conversation_id);

      return new Promise((_, reject) => {
        nextTickToLocalFinish(() => {
          reject(e);
        });
      });
    }
  }

  getAcpSlashCommands(): SlashCommandItem[] {
    return this.acpAvailableSlashCommands.map((item) => ({ ...item }));
  }

  async loadAcpSlashCommands(timeoutMs: number = 6000): Promise<SlashCommandItem[]> {
    // Return cached commands immediately if available
    if (this.acpAvailableSlashCommands.length > 0) {
      return this.getAcpSlashCommands();
    }

    // Don't start agent process just to load slash commands.
    // The frontend (useSlashCommands) re-fetches when agentStatus changes,
    // so commands will be loaded once the agent is naturally initialized.
    if (!this.bootstrap) {
      return [];
    }

    // Wait for ongoing initialization to complete
    try {
      await this.bootstrap;
    } catch (error) {
      console.warn('[AcpAgentManager] Agent initialization failed while loading ACP slash commands:', error);
      return this.getAcpSlashCommands();
    }

    if (this.acpAvailableSlashCommands.length > 0) {
      return this.getAcpSlashCommands();
    }

    return await new Promise<SlashCommandItem[]>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const wrappedResolve = (commands: SlashCommandItem[]) => {
        if (timer) {
          clearTimeout(timer);
        }
        resolve(commands);
      };
      timer = setTimeout(() => {
        this.acpAvailableSlashWaiters = this.acpAvailableSlashWaiters.filter((waiter) => waiter !== wrappedResolve);
        resolve(this.getAcpSlashCommands());
      }, timeoutMs);

      this.acpAvailableSlashWaiters.push(wrappedResolve);
    });
  }

  async confirm(id: string, callId: string, data: AcpPermissionOption) {
    super.confirm(id, callId, data);
    await this.bootstrap;
    void this.agent.confirmMessage({
      confirmKey: data.optionId,
      // msg_id: dat;
      callId: callId,
    });
  }

  /**
   * Filter think tags from message content during streaming
   * This ensures users don't see internal reasoning tags in real-time
   *
   * @param message - The streaming message to filter
   * @returns Message with think tags removed from content
   */
  private filterThinkTagsFromMessage(message: IResponseMessage): IResponseMessage {
    // Only filter content messages
    if (message.type !== 'content' || typeof message.data !== 'string') {
      return message;
    }

    const content = message.data;
    // Quick check to avoid unnecessary processing
    // Match both opening and closing tags (including orphaned </think> from MiniMax-style models)
    if (!/<\s*\/?\s*think(?:ing)?\s*>/i.test(content)) {
      return message;
    }

    // Strip think tags from content
    const cleanedContent = stripThinkTags(content);

    // Return new message object with cleaned content
    return {
      ...message,
      data: cleanedContent,
    };
  }

  private async handleFinishSignal(
    signal: IResponseMessage,
    backend: AcpBackendAll,
    options: { trackActiveTurn?: boolean } = {}
  ): Promise<boolean> {
    let shouldNotifyTurnCompleted = true;
    const completionSource = this.resolveCompletionSource(signal);
    const finishSignal = this.buildFinishSignal(signal, completionSource);
    this.clearMissingFinishFallback();
    if (options.trackActiveTurn !== false) {
      this.markActiveTurnFinished();
    }

    // Flush buffered text chunks before handling turn-level signals
    this.flushBufferedStreamTextMessages();
    this.status = 'finished';
    this.persistCurrentTurnTokenUsage();
    cronBusyGuard.setProcessing(this.conversation_id, false);
    skillSuggestWatcher.onFinish(this.conversation_id);

    // ACP streams content in chunks, so we check the accumulated content here
    if (this.currentMsgContent && hasCronCommands(this.currentMsgContent)) {
      const message: TMessage = {
        id: this.currentMsgId || uuid(),
        msg_id: this.currentMsgId || uuid(),
        type: 'text',
        position: 'left',
        conversation_id: this.conversation_id,
        content: { content: this.currentMsgContent },
        status: 'finish',
        createdAt: Date.now(),
      };
      const collectedResponses: string[] = [];
      await processCronInMessage(this.conversation_id, backend, message, (sysMsg) => {
        collectedResponses.push(sysMsg);
        const systemMessage: IResponseMessage = {
          type: 'system',
          conversation_id: this.conversation_id,
          msg_id: uuid(),
          data: sysMsg,
        };
        ipcBridge.acpConversation.responseStream.emit(systemMessage);
      });
      if (collectedResponses.length > 0 && this.agent) {
        shouldNotifyTurnCompleted = false;
        const feedbackMessage = `[System Response]\n${collectedResponses.join('\n')}`;
        await this.sendAgentMessageWithFinishFallback({ content: feedbackMessage });
      }
      this.currentMsgId = null;
      this.currentMsgContent = '';
    }

    ipcBridge.acpConversation.responseStream.emit(finishSignal);
    teamEventBus.emit('responseStream', {
      ...(finishSignal as IResponseMessage),
      conversation_id: this.conversation_id,
    });

    channelEventBus.emitAgentMessage(this.conversation_id, {
      ...finishSignal,
      conversation_id: this.conversation_id,
    });

    return shouldNotifyTurnCompleted;
  }

  /**
   * Ensure yoloMode is enabled for cron job reuse.
   * If already enabled, returns true immediately.
   * If not, enables yoloMode on the active ACP session dynamically.
   */
  async ensureYoloMode(): Promise<boolean> {
    if (this.options.yoloMode) {
      return true;
    }
    this.options.yoloMode = true;
    if (this.agent?.isConnected && this.agent?.hasActiveSession) {
      try {
        await this.agent.enableYoloMode();
        return true;
      } catch (error) {
        mainError('[AcpAgentManager]', 'Failed to enable yoloMode dynamically', error);
        return false;
      }
    }
    // Agent not connected yet - yoloMode will be applied on next start()
    return true;
  }

  /**
   * Override stop() to cancel the current prompt without killing the backend process.
   * Uses ACP session/cancel so the connection stays alive for subsequent messages.
   */
  async stop() {
    this.clearMissingFinishFallback();
    if (this.agent) {
      this.agent.cancelPrompt();
    }
  }

  /**
   * Get the current session mode for this agent.
   * 获取此代理的当前会话模式。
   *
   * @returns Object with current mode and whether agent is initialized
   */
  getMode(): { mode: string; initialized: boolean } {
    return { mode: this.currentMode, initialized: !!this.agent };
  }

  /**
   * Get model info from the underlying ACP agent.
   * If agent is not initialized but a model ID was persisted, return read-only info.
   */
  getModelInfo(): AcpModelInfo | null {
    if (!this.agent) {
      // Return persisted model info when agent is not yet initialized
      if (this.persistedModelId) {
        return {
          source: 'models',
          sourceDetail: 'persisted-model',
          currentModelId: this.persistedModelId,
          currentModelLabel: this.persistedModelId,
          canSwitch: false,
          availableModels: [],
        };
      }
      return null;
    }
    return this.agent.getModelInfo();
  }

  /**
   * Switch model for the underlying ACP agent.
   * Persists the model ID to database for resume support.
   */
  async setModel(modelId: string): Promise<AcpModelInfo | null> {
    if (!this.agent) {
      try {
        await this.initAgent(this.options);
      } catch {
        return null;
      }
    }
    if (!this.agent) return null;
    const result = await this.agent.setModelByConfigOption(modelId);
    if (result) {
      this.persistedModelId = result.currentModelId;
      this.saveModelId(result.currentModelId);
      // Update cached models so Guid page defaults to the newly selected model
      if (result.availableModels?.length > 0) {
        void this.cacheModelList(result);
      }
    }
    return result;
  }

  /**
   * Get non-model config options from the underlying ACP agent.
   * Returns options like reasoning effort, output format, etc.
   */
  getConfigOptions(): AcpSessionConfigOption[] {
    if (!this.agent) return [];
    return this.agent.getConfigOptions();
  }

  /**
   * Set a config option value on the underlying ACP agent.
   * Used for reasoning effort and other non-model config options.
   */
  async setConfigOption(configId: string, value: string): Promise<AcpSessionConfigOption[]> {
    if (!this.agent) {
      try {
        await this.initAgent(this.options);
      } catch {
        return [];
      }
    }
    if (!this.agent) return [];
    const configOptions = await this.agent.setConfigOption(configId, value);
    this.persistedConfigOptionValues[configId] = value;
    this.saveConfigOptionValues();
    if (configOptions.length > 0) {
      void this.saveConfigOptions(configOptions);
      void this.cacheConfigOptions(configOptions);
    }
    return configOptions;
  }

  /**
   * Set the session mode for this agent (e.g., plan, default, bypassPermissions, yolo).
   * 设置此代理的会话模式（如 plan、default、bypassPermissions、yolo）。
   *
   * Note: Agent must be initialized (user must have sent at least one message)
   * before mode switching is possible, as we need an active ACP session.
   *
   * @param mode - The mode ID to set
   * @returns Promise that resolves with success status and current mode
   */
  async setMode(mode: string): Promise<{ success: boolean; msg?: string; data?: { mode: string } }> {
    // Codex (via codex-acp bridge) does not support ACP session/set_mode — it uses MCP
    // and manages approval at the Manager layer. Update local state only to avoid
    // "Invalid params" JSON-RPC error from the bridge.
    if (this.options.backend === 'codex') {
      const prev = this.currentMode;
      this.currentMode = mode;
      this.yoloMode = this.isYoloMode(mode);
      const sandboxMode = getCodexSandboxModeForSessionMode(mode, this.options.sandboxMode);
      this.options.sandboxMode = sandboxMode;
      await writeCodexSandboxMode(sandboxMode);
      this.saveSessionMode(mode);

      if (this.isYoloMode(prev) && !this.isYoloMode(mode)) {
        void this.clearLegacyYoloConfig();
      }
      return { success: true, data: { mode: this.currentMode } };
    }

    // Snow CLI does not support ACP session/set_mode — it returns "Method not found".
    // Like Codex, manage mode at the Manager layer only.
    if (this.options.backend === 'snow') {
      const prev = this.currentMode;
      this.currentMode = mode;
      this.yoloMode = this.isYoloMode(mode);
      this.saveSessionMode(mode);

      if (this.isYoloMode(prev) && !this.isYoloMode(mode)) {
        void this.clearLegacyYoloConfig();
      }
      return { success: true, data: { mode: this.currentMode } };
    }

    // If agent is not initialized, try to initialize it first
    // 如果 agent 未初始化，先尝试初始化
    if (!this.agent) {
      try {
        await this.initAgent(this.options);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          msg: `Agent initialization failed: ${errorMsg}`,
        };
      }
    }

    // Check again after initialization attempt
    if (!this.agent) {
      return { success: false, msg: 'Agent not initialized' };
    }

    const result = await this.agent.setMode(mode);
    if (result.success) {
      const prev = this.currentMode;
      this.currentMode = mode;
      this.yoloMode = this.isYoloMode(mode);
      this.saveSessionMode(mode);

      // Sync legacy yoloMode config: when leaving yolo mode, clear the old
      // SecurityModalContent setting to prevent it from re-activating on next session.
      if (this.isYoloMode(prev) && !this.isYoloMode(mode)) {
        void this.clearLegacyYoloConfig();
      }
    }
    return {
      success: result.success,
      msg: result.error,
      data: { mode: this.currentMode },
    };
  }

  /** Check if a mode value represents YOLO mode for any backend */
  private isYoloMode(mode: string): boolean {
    return mode === 'bypassPermissions' || mode === 'yolo' || isCodexAutoApproveMode(mode);
  }

  /**
   * Clear legacy yoloMode in acp.config for the current backend.
   * This syncs back to the old SecurityModalContent config key so that
   * switching away from YOLO mode persists across new sessions.
   */
  private async clearLegacyYoloConfig(): Promise<void> {
    try {
      const config = await ProcessConfig.get('acp.config');
      const backendConfig = config?.[this.options.backend];
      if (backendConfig?.yoloMode) {
        await ProcessConfig.set('acp.config', {
          ...config,
          [this.options.backend]: { ...backendConfig, yoloMode: false },
        } as IConfigStorageRefer['acp.config']);
      }
    } catch (error) {
      mainError('[AcpAgentManager]', 'Failed to clear legacy yoloMode config', error);
    }
  }

  /**
   * Save model ID to database for resume support.
   * 保存模型 ID 到数据库以支持恢复。
   */
  private async saveModelId(modelId: string): Promise<void> {
    try {
      const db = await getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (result.success && result.data && result.data.type === 'acp') {
        const conversation = result.data;
        const updatedExtra = {
          ...conversation.extra,
          currentModelId: modelId,
        };
        db.updateConversation(this.conversation_id, {
          extra: updatedExtra,
        } as Partial<typeof conversation>);
      }
    } catch (error) {
      mainWarn('[AcpAgentManager]', 'Failed to save model ID', error);
    }
  }

  /**
   * Save context usage to database for restore on page switch.
   * 保存上下文使用量到数据库，以便在页面切换时恢复。
   */
  private resetCurrentTurnTracking(): void {
    this.pendingPromptUsage = null;
    this.pendingContextUsage = null;
    this.currentMsgId = null;
    this.currentMsgContent = '';
  }

  private persistCurrentTurnTokenUsage(): void {
    if (!this.pendingPromptUsage && !this.pendingContextUsage) {
      return;
    }

    const promptUsage = this.pendingPromptUsage;
    const contextUsage = this.pendingContextUsage;
    const totalTokens = promptUsage?.totalTokens ?? contextUsage?.used ?? 0;

    if (totalTokens <= 0) {
      this.pendingPromptUsage = null;
      this.pendingContextUsage = null;
      return;
    }

    const db = getDatabaseSync();
    const result = db.recordConversationTokenUsage({
      conversationId: this.conversation_id,
      backend: this.options.backend,
      assistantMessageId: this.currentMsgId ?? undefined,
      inputTokens: promptUsage?.inputTokens ?? 0,
      outputTokens: promptUsage?.outputTokens ?? 0,
      cachedReadTokens: promptUsage?.cachedReadTokens ?? 0,
      cachedWriteTokens: promptUsage?.cachedWriteTokens ?? 0,
      thoughtTokens: promptUsage?.thoughtTokens ?? 0,
      totalTokens,
      contextUsed: contextUsage?.used,
      contextSize: contextUsage && contextUsage.size > 0 ? contextUsage.size : undefined,
      sessionCostAmount: contextUsage?.cost?.amount,
      sessionCostCurrency: contextUsage?.cost?.currency,
    });

    if (!result.success) {
      mainWarn('[AcpAgentManager]', 'Failed to persist conversation token usage', result.error);
    }

    this.pendingPromptUsage = null;
    this.pendingContextUsage = null;
    this.currentMsgId = null;
  }

  private async saveContextUsage(usage: { used: number; size: number }): Promise<void> {
    try {
      const db = await getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (result.success && result.data && result.data.type === 'acp') {
        const conversation = result.data;
        const updatedExtra = {
          ...conversation.extra,
          lastTokenUsage: { totalTokens: usage.used },
          lastContextLimit: usage.size,
        };
        db.updateConversation(this.conversation_id, {
          extra: updatedExtra,
        } as Partial<typeof conversation>);
      }
    } catch {
      // Non-critical metadata, silently ignore errors
    }
  }

  /**
   * Save session mode to database for resume support.
   * 保存会话模式到数据库以支持恢复。
   */
  private async saveSessionMode(mode: string): Promise<void> {
    try {
      const db = await getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (result.success && result.data && result.data.type === 'acp') {
        const conversation = result.data;
        const updatedExtra = {
          ...conversation.extra,
          sessionMode: mode,
        };
        db.updateConversation(this.conversation_id, {
          extra: updatedExtra,
        } as Partial<typeof conversation>);
      }
    } catch (error) {
      mainError('[AcpAgentManager]', 'Failed to save session mode', error);
    }
  }

  private saveConfigOptionValues(): void {
    try {
      const db = getDatabaseSync();
      const result = db.getConversation(this.conversation_id);
      if (result.success && result.data && result.data.type === 'acp') {
        const conversation = result.data;
        const updatedExtra = {
          ...conversation.extra,
          configOptionValues: { ...this.persistedConfigOptionValues },
        };
        db.updateConversation(this.conversation_id, { extra: updatedExtra } as Partial<typeof conversation>);
      }
    } catch (error) {
      mainWarn('[AcpAgentManager]', 'Failed to save config option values', error);
    }
  }

  /**
   * Save non-model/mode config options to database for resume support.
   * Allows AcpConfigSelector to render immediately from cached data
   * even when the ACP session has expired.
   */
  private async saveConfigOptions(configOptions: AcpSessionConfigOption[]): Promise<void> {
    try {
      const db = await getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (result.success && result.data && result.data.type === 'acp') {
        const conversation = result.data;
        db.updateConversation(this.conversation_id, {
          extra: { ...conversation.extra, cachedConfigOptions: configOptions },
        } as Partial<typeof conversation>);
      }
    } catch (error) {
      mainError('[AcpAgentManager]', 'Failed to save config options', error);
    }
  }

  /**
   * Override kill() to ensure ACP CLI process is terminated.
   *
   * Problem: AcpAgentManager spawns CLI agents (claude, codex, etc.) as child
   * processes via AcpConnection. The default kill() from the base class only
   * kills the immediate worker, leaving the CLI process running as an orphan.
   *
   * Solution: Call agent.kill() first, which triggers AcpConnection.disconnect()
   * → ChildProcess.kill(). We add a grace period for the process to exit
   * cleanly before calling super.kill() to tear down the worker.
   *
   * A hard timeout ensures we don't hang forever if agent.kill() gets stuck.
   * An idempotent doKill() guard prevents double super.kill() when the hard
   * timeout and graceful path race against each other.
   */
  kill(_reason?: AgentKillReason) {
    this.clearMissingFinishFallback();
    this.flushBufferedStreamTextMessages();
    this.flushThinkingToDb(undefined, 'done');

    let killed = false;
    const GRACE_PERIOD_MS = 500; // Allow child process time to exit cleanly
    const HARD_TIMEOUT_MS = 1500; // Force kill if agent.kill() hangs

    // Clear pending slash command waiters to prevent memory leaks
    // 清除待处理的斜杠命令等待者，防止内存泄漏
    const waiters = this.acpAvailableSlashWaiters.splice(0, this.acpAvailableSlashWaiters.length);
    for (const resolve of waiters) {
      resolve([]);
    }
    this.acpAvailableSlashCommands = [];

    const doKill = () => {
      if (killed) return;
      killed = true;
      clearTimeout(hardTimer);
      super.kill();
    };

    // Hard fallback: force kill after timeout regardless
    const hardTimer = setTimeout(doKill, HARD_TIMEOUT_MS);

    // Graceful path: agent.kill → grace period → super.kill
    void (this.agent?.kill?.() || Promise.resolve())
      .catch((err) => {
        mainWarn('[AcpAgentManager]', 'agent.kill() failed during kill', err);
      })
      .then(() => new Promise<void>((r) => setTimeout(r, GRACE_PERIOD_MS)))
      .finally(doKill);
  }

  private async cacheConfigOptions(configOptions: AcpSessionConfigOption[]): Promise<void> {
    const nextCachedOptions = configOptions.filter(
      (option) => option.category !== 'model' && option.category !== 'mode'
    );
    if (nextCachedOptions.length === 0) {
      return;
    }

    try {
      const cached = (await ProcessConfig.get('acp.cachedConfigOptions')) || {};
      await ProcessConfig.set('acp.cachedConfigOptions', {
        ...cached,
        [this.options.backend]: nextCachedOptions,
      });
    } catch (error) {
      mainWarn('[AcpAgentManager]', 'Failed to cache config options', error);
    }
  }

  /**
   * Cache model list to storage for Guid page pre-selection.
   * Keyed by backend name (e.g., 'claude', 'qwen').
   */
  private async cacheModelList(modelInfo: AcpModelInfo): Promise<void> {
    try {
      const cached = (await ProcessConfig.get('acp.cachedModels')) || {};
      const nextCachedInfo = {
        ...modelInfo,
        // Keep the original default from initial session, not from user switches
        currentModelId: cached[this.options.backend]?.currentModelId ?? modelInfo.currentModelId,
        currentModelLabel: cached[this.options.backend]?.currentModelLabel ?? modelInfo.currentModelLabel,
      };
      // Cache the available model list only. Don't overwrite currentModelId from
      // session-level switches — that should not affect the Guid page default.
      // The Guid page default is managed separately via acp.config[backend].preferredModelId.
      await ProcessConfig.set('acp.cachedModels', {
        ...cached,
        [this.options.backend]: nextCachedInfo,
      });
    } catch (error) {
      mainWarn('[AcpAgentManager]', 'Failed to cache model list', error);
    }
  }

  /**
   * Save ACP session ID to database for resume support.
   * 保存 ACP session ID 到数据库以支持会话恢复。
   */
  private async saveAcpSessionId(sessionId: string): Promise<void> {
    try {
      const db = await getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (result.success && result.data && result.data.type === 'acp') {
        const conversation = result.data;
        const updatedExtra = {
          ...conversation.extra,
          acpSessionId: sessionId,
          acpSessionUpdatedAt: Date.now(),
        };
        db.updateConversation(this.conversation_id, {
          extra: updatedExtra,
        } as Partial<typeof conversation>);
      }
    } catch (error) {
      mainError('[AcpAgentManager]', 'Failed to save ACP session ID', error);
    }
  }
}

export default AcpAgentManager;
