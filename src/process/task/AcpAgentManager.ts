import type { AcpAgent } from '@process/agent/acp';
import { AcpAgentV2 } from '@process/acp/compat';
import { channelEventBus } from '@process/channels/agent/ChannelEventBus';
import { teamEventBus } from '@process/team/teamEventBus';
import { ipcBridge } from '@/common';
import type { CronMessageMeta, TMessage } from '@/common/chat/chatLib';
import { isCodexAutoApproveMode } from '@/common/types/codex/codexModes';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import { transformMessage } from '@/common/chat/chatLib';
import type { IConfigStorageRefer } from '@/common/config/storage';
import { AIONUI_FILES_MARKER } from '@/common/config/constants';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { parseError, uuid } from '@/common/utils';
import type {
  AcpBackend,
  AcpModelInfo,
  AcpPermissionOption,
  AcpPermissionRequest,
  AcpResult,
  AcpBackendConfig,
  AcpSessionConfigOption,
} from '@/common/types/acpTypes';
import { ACP_BACKENDS_ALL } from '@/common/types/acpTypes';
import { ExtensionRegistry } from '@process/extensions';
import { getDatabase } from '@process/services/database';
import { ProcessConfig } from '@process/utils/initStorage';
import { addMessage, addOrUpdateMessage, nextTickToLocalFinish } from '@process/utils/message';
import { handlePreviewOpenEvent } from '@process/utils/previewUtils';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { mainWarn, mainError } from '@process/utils/mainLogger';
import {
  getCodexSandboxModeForSessionMode,
  type CodexSandboxMode,
  writeCodexSandboxMode,
} from '@process/task/codexConfig';
import BaseAgentManager from './BaseAgentManager';
import { IpcAgentEventEmitter } from './IpcAgentEventEmitter';
import { hasCronCommands } from './CronCommandDetector';
import { skillSuggestWatcher } from '@process/services/cron/SkillSuggestWatcher';
import { extractAndStripThinkTags } from './ThinkTagDetector';
import type { AgentKillReason } from './IAgentManager';
import { hasNativeSkillSupport } from '@/common/types/acpTypes';
import { prepareFirstMessageWithSkillsIndex } from '@process/task/agentUtils';
import { shouldInjectTeamGuideMcp } from '@process/team/prompts/teamGuideCapability.ts';
import { extractTextFromMessage, processCronInMessage } from './MessageMiddleware';
import { ConversationTurnCompletionService } from './ConversationTurnCompletionService';

interface AcpAgentManagerData {
  workspace?: string;
  backend: AcpBackend;
  cliPath?: string;
  customWorkspace?: boolean;
  conversation_id: string;
  customAgentId?: string; // 用于标识特定自定义代理的 UUID / UUID for identifying specific custom agent
  /** Display name for the agent (from extension or custom config) / Agent 显示名称（来自扩展或自定义配置） */
  agentName?: string;
  presetContext?: string; // 智能助手的预设规则/提示词 / Preset context from smart assistant
  /** 启用的 skills 列表，用于过滤 SkillManager 加载的 skills / Enabled skills list for filtering SkillManager skills */
  enabledSkills?: string[];
  /** 排除的内置自动注入 skills / Builtin auto-injected skills to exclude */
  excludeBuiltinSkills?: string[];
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
  sandboxMode?: CodexSandboxMode;
  /** Pending config option selections from Guid page (applied after session creation) */
  pendingConfigOptions?: Record<string, string>;
}

type BufferedStreamTextMessage = {
  conversationId: string;
  backend: AcpBackend;
  message: Extract<TMessage, { type: 'text' }>;
  timer: ReturnType<typeof setTimeout>;
};

type CustomAgentLaunchConfig = Pick<AcpBackendConfig, 'id' | 'name' | 'defaultCliPath' | 'acpArgs' | 'env'>;

class AcpAgentManager extends BaseAgentManager<AcpAgentManagerData, AcpPermissionOption> {
  workspace: string;
  agent: AcpAgentV2;
  private bootstrap: Promise<AcpAgentV2> | undefined;
  private bootstrapping: boolean = false;
  private isFirstMessage: boolean = true;
  options: AcpAgentManagerData;
  private currentMode: string = 'default';
  private persistedModelId: string | null = null;
  // Track current message for cron detection (accumulated from streaming chunks)
  private currentMsgId: string | null = null;
  private currentMsgContent: string = '';
  /** Current turn's thinking message msg_id for accumulating content */
  private thinkingMsgId: string | null = null;
  /** Timestamp when thinking started for duration calculation */
  private thinkingStartTime: number | null = null;
  /** Accumulated thinking content for persistence */
  private thinkingContent: string = '';
  private thinkingDbFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private acpAvailableSlashCommands: SlashCommandItem[] = [];
  private acpAvailableSlashWaiters: Array<(commands: SlashCommandItem[]) => void> = [];
  private readonly streamDbFlushIntervalMs = 120;
  private readonly bufferedStreamTextMessages = new Map<string, BufferedStreamTextMessage>();
  private nextTrackedTurnId: number = 0;
  private activeTrackedTurnId: number | null = null;
  private activeTrackedTurnHasRuntimeActivity: boolean = false;
  private readonly completedTrackedTurnIds = new Set<number>();
  private missingFinishFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private missingFinishFallbackTurnId: number | null = null;
  private readonly missingFinishFallbackDelayMs = 15000;

  constructor(data: AcpAgentManagerData) {
    super('acp', data, new IpcAgentEventEmitter(), false);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;
    this.options = data;
    this.currentMode = data.sessionMode || 'default';
    this.persistedModelId = data.currentModelId || null;
    this.status = 'pending';
    // Sync yoloMode from sessionMode so addConfirmation auto-approves when Full Auto is selected
    this.yoloMode = this.yoloMode || this.isYoloMode(this.currentMode);
  }

  private makeStreamBufferKey(message: Extract<TMessage, { type: 'text' }>): string {
    return `${message.conversation_id}:${message.msg_id || message.id}`;
  }

  private queueBufferedStreamTextMessage(message: Extract<TMessage, { type: 'text' }>, backend: AcpBackend): void {
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

  private beginTrackedTurn(): number {
    this.clearMissingFinishFallback();
    const turnId = this.nextTrackedTurnId + 1;
    this.nextTrackedTurnId = turnId;
    this.activeTrackedTurnId = turnId;
    this.activeTrackedTurnHasRuntimeActivity = false;
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
    this.scheduleMissingFinishFallback();
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

    this.markTrackedTurnFinished(turnId);
    mainWarn(
      '[AcpAgentManager]',
      `ACP turn became idle without finish signal; synthesizing finish for ${this.conversation_id} (${this.options.backend})`
    );

    await this.handleFinishSignal(
      {
        type: 'finish',
        conversation_id: this.conversation_id,
        msg_id: uuid(),
        data: null,
      },
      this.options.backend,
      { trackActiveTurn: false }
    );
  }

  private async handleFinishSignal(
    message: IResponseMessage,
    backend: AcpBackend,
    options: { trackActiveTurn?: boolean } = {}
  ): Promise<void> {
    if (options.trackActiveTurn !== false) {
      this.markActiveTurnFinished();
    }
    this.clearMissingFinishFallback();
    this.flushBufferedStreamTextMessages();

    cronBusyGuard.setProcessing(this.conversation_id, false);
    this.status = 'finished';

    if (this.thinkingMsgId) {
      this.emitThinkingMessage('', 'done');
      this.thinkingMsgId = null;
      this.thinkingStartTime = null;
      this.thinkingContent = '';
    }

    skillSuggestWatcher.onFinish(this.conversation_id);

    if (this.currentMsgContent && hasCronCommands(this.currentMsgContent)) {
      const cronMessage: TMessage = {
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
      await processCronInMessage(this.conversation_id, backend, cronMessage, (sysMsg) => {
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
        const feedbackMessage = `[System Response]
${collectedResponses.join('\n')}`;
        await this.agent.sendMessage({ content: feedbackMessage });
      }
    }

    this.currentMsgId = null;
    this.currentMsgContent = '';

    const finishMessage: IResponseMessage = {
      ...(message as IResponseMessage),
      conversation_id: this.conversation_id,
    };
    ipcBridge.acpConversation.responseStream.emit(finishMessage);
    teamEventBus.emit('responseStream', finishMessage);
    channelEventBus.emitAgentMessage(this.conversation_id, finishMessage);

    void ConversationTurnCompletionService.getInstance().notifyPotentialCompletion(this.conversation_id, {
      status: this.status ?? 'finished',
      workspace: this.workspace,
      backend: this.options.backend,
      pendingConfirmations: this.getConfirmations().length,
      modelId: this.persistedModelId ?? this.agent?.getModelInfo?.()?.currentModelId ?? undefined,
    });
  }

  private async sendAgentMessageWithFinishFallback(
    data: Parameters<AcpAgent['sendMessage']>[0] & Record<string, unknown>
  ): Promise<AcpResult> {
    const turnId = this.beginTrackedTurn();

    try {
      const result = await this.agent.sendMessage(data);
      if (this.consumeTrackedTurnFinished(turnId)) {
        return result;
      }

      if (this.activeTrackedTurnId === turnId && this.activeTrackedTurnHasRuntimeActivity) {
        return result;
      }

      this.clearTrackedTurn(turnId);
      mainWarn(
        '[AcpAgentManager]',
        `ACP turn resolved without runtime activity or finish signal; synthesizing finish for ${this.conversation_id} (${this.options.backend})`
      );
      await this.handleFinishSignal(
        {
          type: 'finish',
          conversation_id: this.conversation_id,
          msg_id: (data as { msg_id?: string }).msg_id || uuid(),
          data: null,
        },
        this.options.backend,
        { trackActiveTurn: false }
      );
      return result;
    } catch (error) {
      this.clearTrackedTurn(turnId);
      throw error;
    }
  }

  /**
   * Check native skill support: for builtin backends, consult ACP_BACKENDS_ALL;
   * for extension agents, check the adapter's skillsDirs from the manifest.
   */
  private resolveNativeSkillSupport(): boolean {
    if (hasNativeSkillSupport(this.options.backend)) return true;

    // For extension agents (backend: 'custom'), check the adapter's skillsDirs
    if (this.options.backend === 'custom' && this.options.customAgentId?.startsWith('ext:')) {
      try {
        const [, extensionName, ...idParts] = this.options.customAgentId.split(':');
        const adapterId = idParts.join(':');
        const adapter = ExtensionRegistry.getInstance()
          .getAcpAdapters()
          .find((item) => {
            const r = item as Record<string, unknown>;
            return r._extensionName === extensionName && r.id === adapterId;
          }) as Record<string, unknown> | undefined;
        if (adapter && Array.isArray(adapter.skillsDirs) && adapter.skillsDirs.length > 0) {
          return true;
        }
      } catch {
        // ExtensionRegistry not available
      }
    }

    return false;
  }

  // ── Config resolution helpers for initAgent ──────────────────────────

  /**
   * Resolve agent CLI configuration based on backend type.
   * Dispatches to custom or built-in resolution.
   */
  private async resolveAgentCliConfig(data: AcpAgentManagerData): Promise<{
    cliPath?: string;
    customArgs?: string[];
    customEnv?: Record<string, string>;
    yoloMode?: boolean;
  }> {
    if (data.customAgentId) {
      return this.resolveCustomAgentCliConfig(data);
    }
    return this.resolveBuiltinBackendConfig(data);
  }

  /**
   * Resolve CLI config for a custom agent backend.
   * Looks up assistants config by UUID, falling back to extension-contributed adapters.
   */
  private async resolveCustomAgentCliConfig(data: AcpAgentManagerData): Promise<{
    cliPath?: string;
    customArgs?: string[];
    customEnv?: Record<string, string>;
  }> {
    const customAgents = await ProcessConfig.get('assistants');
    let customAgentConfig: CustomAgentLaunchConfig | undefined = customAgents?.find(
      (agent) => agent.id === data.customAgentId
    );

    // Fallback: extension adapter (customAgentId format: ext:{extensionName}:{adapterId})
    if (!customAgentConfig && data.customAgentId!.startsWith('ext:')) {
      const [, extensionName, ...idParts] = data.customAgentId!.split(':');
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

    if (!customAgentConfig?.defaultCliPath) {
      return { cliPath: data.cliPath };
    }

    return {
      cliPath: customAgentConfig.defaultCliPath.trim(),
      customArgs: customAgentConfig.acpArgs,
      customEnv: customAgentConfig.env,
    };
  }

  /**
   * Resolve CLI config for a built-in backend (claude, qwen, codex, etc.).
   * Also handles yoloMode migration and codex sandbox mode.
   */
  private async resolveBuiltinBackendConfig(data: AcpAgentManagerData): Promise<{
    cliPath?: string;
    customArgs?: string[];
    yoloMode?: boolean;
  }> {
    const config = await ProcessConfig.get('acp.config');
    const codexConfig = data.backend === 'codex' ? await ProcessConfig.get('codex.config') : undefined;

    let cliPath = data.cliPath;
    if (!cliPath && config?.[data.backend]?.cliPath) {
      cliPath = config[data.backend].cliPath;
    }

    // yoloMode priority: data.yoloMode (from CronService) > config setting
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
    const yoloMode = data.yoloMode ?? this.isYoloMode(this.currentMode);

    // Get acpArgs from backend config (for goose, auggie, opencode, etc.)
    const backendConfig = ACP_BACKENDS_ALL[data.backend];
    let customArgs: string[] | undefined;
    if (backendConfig?.acpArgs) {
      customArgs = backendConfig.acpArgs;
    }

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

    return { cliPath, customArgs, yoloMode };
  }

  // ── initAgent callback handlers ──────────────────────────────────────

  /**
   * Handle ACP agent's available slash commands update.
   * Deduplicates commands, caches them, and notifies the frontend.
   */
  private handleAvailableCommandsUpdate(commands: Array<{ name: string; description?: string; hint?: string }>): void {
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
    const waiters = this.acpAvailableSlashWaiters.splice(0, this.acpAvailableSlashWaiters.length);
    for (const resolve of waiters) {
      resolve(this.getAcpSlashCommands());
    }

    // Notify frontend that slash commands are now available.
    // During bootstrap, agent_status events are suppressed, so the
    // frontend acpStatus never updates and useSlashCommands never
    // re-fetches. This dedicated event bypasses the bootstrap filter.
    ipcBridge.acpConversation.responseStream.emit({
      type: 'slash_commands_updated',
      conversation_id: this.conversation_id,
      msg_id: '',
      data: null,
    });
  }

  /**
   * Handle stream events from the ACP agent.
   * Processes thinking, content, status, and tool call messages through the
   * full pipeline: filter → transform → persist → emit to all buses.
   */
  private handleStreamEvent(message: IResponseMessage, backend: AcpBackend): void {
    // During bootstrap (warmup), suppress UI stream events to avoid
    // triggering sidebar loading spinner before user sends a message.
    if (this.bootstrapping) return;

    this.markTrackedTurnRuntimeActivity();

    const pipelineStart = Date.now();

    // Reduce status noise: show full lifecycle only for the first turn.
    // After first turn, only keep failure statuses to avoid reconnect chatter.
    if (message.type === 'agent_status') {
      const status = (message.data as { status?: string } | null)?.status;
      const shouldDisplayStatus = this.isFirstMessage || status === 'error' || status === 'disconnected';
      if (!shouldDisplayStatus) return;
    }

    // Handle preview_open event (chrome-devtools navigation interception)
    if (handlePreviewOpenEvent(message)) return;

    // Mark as finished when content is output (visible to user)
    const contentTypes = ['content', 'agent_status', 'acp_tool_call', 'plan'];
    if (contentTypes.includes(message.type)) {
      this.status = 'finished';
    }

    // Emit request trace on each model generation start
    if (message.type === 'start') {
      const modelInfo = this.agent?.getModelInfo();
      ipcBridge.acpConversation.responseStream.emit({
        type: 'request_trace',
        conversation_id: this.conversation_id,
        msg_id: uuid(),
        data: {
          agentType: 'acp' as const,
          backend,
          modelId: modelInfo?.currentModelId || this.persistedModelId || 'unknown',
          cliPath: this.options?.cliPath,
          sessionMode: this.currentMode,
          timestamp: Date.now(),
        },
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
      this.saveContextUsage(message.data as { used: number; size: number });
    }

    // Convert thought events to thinking messages in conversation flow
    if (message.type === 'thought') {
      const thoughtData = message.data as { subject?: string; description?: string };
      const content = thoughtData?.description || thoughtData?.subject || '';
      if (content) {
        this.emitThinkingMessage(content, 'thinking');
      }
    } else if (this.thinkingMsgId) {
      // Any non-thought message means thinking phase is over
      this.emitThinkingMessage('', 'done');
      this.thinkingMsgId = null;
      this.thinkingStartTime = null;
      this.thinkingContent = '';
    }

    // Strip inline <think> tags from content messages BEFORE transform/DB/emit
    // so thinking appears before main content and DB stores clean text
    // (e.g. MiniMax models embed think tags in content)
    let processedMessage = message;
    if (message.type === 'content' && typeof message.data === 'string') {
      const { thinking, content: stripped } = extractAndStripThinkTags(message.data);
      if (thinking) {
        this.emitThinkingMessage(thinking, 'thinking');
      }
      if (stripped !== message.data) {
        processedMessage = { ...message, data: stripped };
      }
    }

    if (
      processedMessage.type !== 'thought' &&
      processedMessage.type !== 'thinking' &&
      processedMessage.type !== 'acp_model_info' &&
      processedMessage.type !== 'acp_context_usage'
    ) {
      const transformStart = Date.now();
      const tMessage = transformMessage(processedMessage);
      const transformDuration = Date.now() - transformStart;

      if (tMessage) {
        const dbStart = Date.now();
        const isStreamTextChunk = tMessage.type === 'text' && processedMessage.type === 'content';
        if (isStreamTextChunk) {
          this.queueBufferedStreamTextMessage(tMessage, backend);
        } else {
          this.flushBufferedStreamTextMessages();
          addOrUpdateMessage(processedMessage.conversation_id, tMessage, backend);
        }
        const dbDuration = Date.now() - dbStart;

        if (transformDuration > 5 || dbDuration > 5) {
          console.log(
            `[ACP-PERF] stream: transform ${transformDuration}ms, db ${dbDuration}ms type=${processedMessage.type}`
          );
        }

        // Track streaming content for cron detection when turn ends
        if (isStreamTextChunk) {
          const textContent = extractTextFromMessage(tMessage);
          if (tMessage.msg_id !== this.currentMsgId) {
            this.currentMsgId = tMessage.msg_id || null;
            this.currentMsgContent = textContent;
          } else {
            this.currentMsgContent += textContent;
          }
        }
      }
    }

    const emitStart = Date.now();
    ipcBridge.acpConversation.responseStream.emit(processedMessage);
    // Only emit terminal events to team bus for agent lifecycle management
    if (processedMessage.type === 'finish' || processedMessage.type === 'error') {
      teamEventBus.emit('responseStream', {
        ...processedMessage,
        conversation_id: this.conversation_id,
      });
    }
    const emitDuration = Date.now() - emitStart;

    channelEventBus.emitAgentMessage(this.conversation_id, {
      ...processedMessage,
      conversation_id: this.conversation_id,
    });

    const totalDuration = Date.now() - pipelineStart;
    if (totalDuration > 10) {
      console.log(
        `[ACP-PERF] stream: onStreamEvent pipeline ${totalDuration}ms (emit=${emitDuration}ms) type=${processedMessage.type}`
      );
    }
  }

  /**
   * Handle signal events (permission requests, finish, errors) from the ACP agent.
   * Auto-approves permissions in yolo mode and for team MCP tools,
   * delegates finish handling to handleFinishSignal.
   */
  private async handleSignalEvent(v: IResponseMessage, backend: AcpBackend): Promise<void> {
    this.flushBufferedStreamTextMessages();
    this.markTrackedTurnRuntimeActivity();

    if (v.type === 'acp_permission') {
      const { toolCall, options } = v.data as AcpPermissionRequest;

      // Auto-approve ALL tools when in yolo/bypassPermissions mode.
      if (this.isYoloMode(this.currentMode) && options.length > 0) {
        const autoOption = options[0];
        setTimeout(() => {
          void this.confirm(v.msg_id, toolCall.toolCallId || v.msg_id, autoOption);
        }, 50);
        return;
      }

      // Auto-approve team MCP tools — internal tools provided by AionUi.
      const toolTitle = toolCall.title || '';
      if (toolTitle.includes('aionui-team') && options.length > 0) {
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

      channelEventBus.emitAgentMessage(this.conversation_id, {
        type: 'error',
        conversation_id: this.conversation_id,
        msg_id: v.msg_id,
        data: 'Permission required. Please open AionUi and confirm the pending request in the conversation panel.',
      });
      return;
    }

    if (v.type === 'finish') {
      await this.handleFinishSignal(v, backend);
      return;
    }

    ipcBridge.acpConversation.responseStream.emit(v);

    channelEventBus.emitAgentMessage(this.conversation_id, {
      ...v,
      conversation_id: this.conversation_id,
    });
  }

  /**
   * Re-apply persisted mode and model after agent session starts/resumes.
   * Also caches the model list for Guid page pre-selection.
   */
  private async restorePersistedState(): Promise<void> {
    if (this.currentMode && this.currentMode !== 'default') {
      try {
        await this.agent.setMode(this.currentMode);
      } catch (error) {
        mainWarn('[AcpAgentManager]', `Failed to re-apply mode ${this.currentMode}`, error);
      }
    }

    if (this.persistedModelId) {
      const currentInfo = this.agent.getModelInfo();
      const isModelAvailable = currentInfo?.availableModels?.some((m) => m.id === this.persistedModelId);
      if (!isModelAvailable) {
        mainWarn('[AcpAgentManager]', `Persisted model ${this.persistedModelId} is not in available models, clearing`);
        this.persistedModelId = null;
      } else if (currentInfo?.currentModelId !== this.persistedModelId) {
        try {
          await this.agent.setModelByConfigOption(this.persistedModelId);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          mainWarn('[AcpAgentManager]', `Failed to re-apply model ${this.persistedModelId}`, error);
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

    // Note: model list caching is now handled by AcpAgent.cacheSessionCapabilities()
    // during start(), so we don't need to call cacheModelList() here.
  }

  // ── initAgent ────────────────────────────────────────────────────────

  initAgent(data: AcpAgentManagerData = this.options) {
    if (this.bootstrap) return this.bootstrap;

    this.bootstrapping = true;
    this.bootstrap = (async () => {
      const { cliPath, customArgs, customEnv, yoloMode } = await this.resolveAgentCliConfig(data);

      const agentConfig = {
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
        onAvailableCommandsUpdate: (commands: Array<{ name: string; description?: string; hint?: string }>) => {
          this.handleAvailableCommandsUpdate(commands);
        },
        onStreamEvent: (message: IResponseMessage) => {
          this.handleStreamEvent(message as IResponseMessage, data.backend);
        },
        onSignalEvent: async (v: IResponseMessage) => {
          await this.handleSignalEvent(v as IResponseMessage, data.backend);
        },
      };

      this.agent = new AcpAgentV2(agentConfig);
      return this.agent.start().then(async () => {
        await this.restorePersistedState();
        this.bootstrapping = false;
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
          ...(data.hidden && { hidden: true }),
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
            // Native skill discovery via workspace symlinks — inject preset rules + team guide
            const parts: string[] = [];
            if (this.options.presetContext) parts.push(this.options.presetContext);
            if (!isInTeam && (await shouldInjectTeamGuideMcp(this.options.backend))) {
              const { getTeamGuidePrompt } = await import('@process/team/prompts/teamGuidePrompt.ts');
              parts.push(getTeamGuidePrompt(this.options.backend));
            }
            if (parts.length > 0) {
              contentToSend = `[Assistant Rules - You MUST follow these instructions]\n${parts.join(
                '\n\n'
              )}\n\n[User Request]\n${contentToSend}`;
            }
          } else {
            // Custom workspace or no native support — inject rules + skills via prompt
            const { content: injectedContent } = await prepareFirstMessageWithSkillsIndex(contentToSend, {
              presetContext: this.options.presetContext,
              enabledSkills: this.options.enabledSkills,
              excludeBuiltinSkills: this.options.excludeBuiltinSkills,
              enableTeamGuide: !isInTeam && (await shouldInjectTeamGuideMcp(this.options.backend)),
              backend: this.options.backend,
            });
            contentToSend = injectedContent;
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
        // Exception: if the agent returns a failure (e.g. timeout), clean up
        // immediately so the conversation isn't stuck in a busy/running state.
        if (!result.success) {
          this.clearBusyState();
        }
        return result;
      }
      const agentSendStart = Date.now();
      const result = await this.sendAgentMessageWithFinishFallback(data);
      console.log(
        `[ACP-PERF] manager: agent.sendMessage completed ${Date.now() - agentSendStart}ms (total manager.sendMessage: ${
          Date.now() - managerSendStart
        }ms)`
      );
      if (!result.success) {
        this.clearBusyState();
      }
      return result;
    } catch (e) {
      this.flushBufferedStreamTextMessages();
      this.clearBusyState();
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
      };
      ipcBridge.acpConversation.responseStream.emit(finishMessage);

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
   * Emit a thinking message to the UI stream.
   * Creates a new thinking msg_id on first call per turn, reuses it for subsequent calls.
   */
  private emitThinkingMessage(content: string, status: 'thinking' | 'done' = 'thinking'): void {
    if (!this.thinkingMsgId) {
      this.thinkingMsgId = uuid();
      this.thinkingStartTime = Date.now();
      this.thinkingContent = '';
    }

    // Accumulate content during streaming
    if (status === 'thinking') {
      this.thinkingContent += content;
    }

    const duration = status === 'done' && this.thinkingStartTime ? Date.now() - this.thinkingStartTime : undefined;

    ipcBridge.acpConversation.responseStream.emit({
      type: 'thinking',
      conversation_id: this.conversation_id,
      msg_id: this.thinkingMsgId,
      data: {
        content,
        duration,
        status,
      },
    });

    // Persist: done flushes immediately, streaming chunks use buffered timer
    if (status === 'done') {
      this.flushThinkingToDb(duration, 'done');
    } else if (!this.thinkingDbFlushTimer) {
      this.thinkingDbFlushTimer = setTimeout(() => {
        this.flushThinkingToDb(undefined, 'thinking');
      }, this.streamDbFlushIntervalMs);
    }
  }

  private flushThinkingToDb(duration: number | undefined, status: 'thinking' | 'done'): void {
    if (this.thinkingDbFlushTimer) {
      clearTimeout(this.thinkingDbFlushTimer);
      this.thinkingDbFlushTimer = null;
    }
    if (!this.thinkingMsgId) return;
    const tMessage: TMessage = {
      id: this.thinkingMsgId,
      msg_id: this.thinkingMsgId,
      type: 'thinking',
      position: 'left',
      conversation_id: this.conversation_id,
      content: {
        content: this.thinkingContent,
        duration,
        status,
      },
      createdAt: this.thinkingStartTime || Date.now(),
    };
    addOrUpdateMessage(this.conversation_id, tMessage, this.options.backend);
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
    const updated = await this.agent.setConfigOption(configId, value);
    if (updated.length > 0) {
      void this.saveConfigOptions(updated);
    }
    return updated;
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
    return mode === 'yolo' || mode === 'bypassPermissions' || isCodexAutoApproveMode(mode);
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
  private clearBusyState(): void {
    cronBusyGuard.setProcessing(this.conversation_id, false);
    this.status = 'finished';
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
          acpSessionConversationId: this.conversation_id,
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
