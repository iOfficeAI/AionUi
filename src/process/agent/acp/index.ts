/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AcpAdapter } from '@process/agent/acp/AcpAdapter';
import type { IMcpServer } from '@/common/config/storage';
import { extractAtPaths, parseAllAtCommands, reconstructQuery } from '@/common/chat/atCommandParser';
import type { TMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { ipcBridge } from '@/common';
import { NavigationInterceptor } from '@/common/chat/navigation';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import { uuid } from '@/common/utils';
import type {
  AcpBackend,
  AcpInitializeResult,
  AcpModelInfo,
  AcpPermissionRequest,
  AcpPromptResponseUsage,
  AcpResult,
  AcpSessionConfigOption,
  AcpSessionModes,
  AcpSessionUpdate,
  AvailableCommandsUpdate,
  ToolCallUpdate,
} from '@/common/types/acpTypes';
import { AcpErrorType, createAcpError } from '@/common/types/acpTypes';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ProcessConfig } from '@process/utils/initStorage';
import { getEnhancedEnv, normalizeNpxArgsForBundledBun, resolveNpxPath } from '@process/utils/shellEnv';
import { readClaudeModelInfoFromCcSwitch } from '@process/services/ccSwitchModelSource';
import { AcpConnection } from './AcpConnection';
import { AcpApprovalStore, createAcpApprovalKey } from './ApprovalStore';
import { CLAUDE_YOLO_SESSION_MODE, CODEBUDDY_YOLO_SESSION_MODE, QWEN_YOLO_SESSION_MODE } from './constants';
import { buildAcpModelInfo } from './modelInfo';
import { buildBuiltinAcpSessionMcpServers, buildTeamMcpServer, type AcpSessionMcpServer } from './mcpSessionConfig';
import { getClaudeModelSlot } from './utils';
import { getTeamGuideStdioConfig } from '@process/team/mcp/guide/teamGuideSingleton';
import { shouldInjectTeamGuideMcp } from '@process/team/prompts/teamGuideCapability.ts';
import { waitForMcpReady } from '@process/team/mcpReadiness';

// InitializeResult removed — replaced by AcpInitializeResult from acpTypes.ts

/**
 * ACP available command type - subset of SlashCommandItem for ACP protocol layer
 * ACP 可用命令类型 - SlashCommandItem 的子集，用于 ACP 协议层
 */
export type AcpAvailableCommand = Pick<SlashCommandItem, 'name' | 'description' | 'hint'>;

/**
 * Helper function to normalize tool call status
 * 辅助函数：规范化工具调用状态
 *
 * Note: This preserves the original behavior of (status as any) || 'pending'
 * Only converts falsy values to 'pending', keeps all truthy values unchanged
 * 注意：保持原始行为，只将 falsy 值转换为 'pending'，保留所有 truthy 值
 */
function normalizeToolCallStatus(status: string | undefined): 'pending' | 'in_progress' | 'completed' | 'failed' {
  // Matches original: (status as any) || 'pending'
  // If falsy (undefined, null, ''), return 'pending'
  if (!status) {
    return 'pending';
  }
  // Preserve original value for backward compatibility
  return status as 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface AcpAgentConfig {
  id: string;
  backend: AcpBackend;
  cliPath?: string;
  workingDir: string;
  customArgs?: string[]; // Custom CLI arguments (for custom backend)
  customEnv?: Record<string, string>; // Custom environment variables (for custom backend)
  extra?: {
    workspace?: string;
    backend: AcpBackend;
    cliPath?: string;
    customWorkspace?: boolean;
    customArgs?: string[];
    customEnv?: Record<string, string>;
    yoloMode?: boolean;
    /** Display name for the agent (from extension or custom config) / Agent 显示名称 */
    agentName?: string;
    /** ACP session ID for resume support / ACP session ID 用于会话恢复 */
    acpSessionId?: string;
    /** Conversation ID that owns the ACP session / 拥有该 ACP session 的会话 ID */
    acpSessionConversationId?: string;
    /** Last update time of ACP session / ACP session 最后更新时间 */
    acpSessionUpdatedAt?: number;
    /** Initial model ID to apply at session start (from channel config or persisted user choice) */
    currentModelId?: string;
    /** Initial session mode to apply at session start (e.g., acceptEdits, auto, dontAsk, plan) */
    sessionMode?: string;
    /** Team MCP server stdio config injected by TeamSessionService */
    teamMcpStdioConfig?: { name: string; command: string; args: string[]; env: Array<{ name: string; value: string }> };
    /** Pending config option selections from Guid page (applied after session creation) */
    pendingConfigOptions?: Record<string, string>;
  };
  onStreamEvent: (data: IResponseMessage) => void;
  onSignalEvent?: (data: IResponseMessage) => void; // 新增：仅发送信号，不更新UI
  /** Callback when ACP session ID is updated / 当 ACP session ID 更新时的回调 */
  onSessionIdUpdate?: (sessionId: string) => void;
  /** Callback when ACP agent updates available slash commands / ACP 可用斜杠命令更新回调 */
  onAvailableCommandsUpdate?: (commands: AcpAvailableCommand[]) => void;
}

// ACP agent任务类
export class AcpAgent {
  private readonly id: string;
  private extra: {
    workspace?: string;
    backend: AcpBackend;
    cliPath?: string;
    customWorkspace?: boolean;
    customArgs?: string[];
    customEnv?: Record<string, string>;
    yoloMode?: boolean;
    /** Display name for the agent (from extension or custom config) / Agent 显示名称 */
    agentName?: string;
    /** ACP session ID for resume support / ACP session ID 用于会话恢复 */
    acpSessionId?: string;
    /** Conversation ID that owns the ACP session / 拥有该 ACP session 的会话 ID */
    acpSessionConversationId?: string;
    /** Last update time of ACP session / ACP session 最后更新时间 */
    acpSessionUpdatedAt?: number;
    /** Initial model ID to apply at session start (from channel config or persisted user choice) */
    currentModelId?: string;
    /** Initial session mode to apply at session start (e.g., acceptEdits, auto, dontAsk, plan) */
    sessionMode?: string;
    /** Team MCP server stdio config injected by TeamSessionService */
    teamMcpStdioConfig?: { name: string; command: string; args: string[]; env: Array<{ name: string; value: string }> };
    /** Pending config option selections from Guid page (applied after session creation) */
    pendingConfigOptions?: Record<string, string>;
  };
  private connection: AcpConnection;
  private adapter: AcpAdapter;
  private pendingPermissions = new Map<
    string,
    { resolve: (response: { optionId: string }) => void; reject: (error: Error) => void }
  >();
  private statusMessageId: string | null = null;
  private readonly onStreamEvent: (data: IResponseMessage) => void;
  private readonly onSignalEvent?: (data: IResponseMessage) => void;
  private readonly onSessionIdUpdate?: (sessionId: string) => void;
  private readonly onAvailableCommandsUpdate?: (commands: AcpAvailableCommand[]) => void;

  // Track pending navigation tool calls for URL extraction from results
  // 跟踪待处理的导航工具调用，以便从结果中提取 URL
  private pendingNavigationTools = new Set<string>();

  // ApprovalStore for session-level "always allow" caching
  // Workaround for claude-agent-acp bug: it doesn't check suggestions to auto-approve
  private approvalStore = new AcpApprovalStore();

  // Track user-initiated model override so we can re-assert before each prompt.
  // Prevents model drift if the CLI subprocess loses the override state.
  private userModelOverride: string | null = null;

  // Pending model switch notice to inject into the next user prompt.
  // Equivalent to the terminal's "/model" command output that appears in conversation,
  // which lets the AI know its model identity has changed (since the env_info system
  // prompt section is cached with cacheBreak:false and never refreshed on model switch).
  private pendingModelSwitchNotice: string | null = null;

  // Store permission request metadata for later use in confirmMessage
  private permissionRequestMeta = new Map<
    string,
    { kind?: string; title?: string; rawInput?: Record<string, unknown> }
  >();

  // Whether usage_update session notifications have been received (if so, skip PromptResponse.usage fallback)
  private hasReceivedUsageUpdate = false;
  // Turn-level observability for "thought shown but no answer rendered" cases.
  private turnHasThought = false;
  private turnHasContent = false;

  constructor(config: AcpAgentConfig) {
    this.id = config.id;
    this.onStreamEvent = config.onStreamEvent;
    this.onSignalEvent = config.onSignalEvent;
    this.onSessionIdUpdate = config.onSessionIdUpdate;
    this.onAvailableCommandsUpdate = config.onAvailableCommandsUpdate;
    this.extra = config.extra || {
      workspace: config.workingDir,
      backend: config.backend,
      cliPath: config.cliPath,
      customWorkspace: false, // Default to system workspace
      customArgs: config.customArgs,
      customEnv: config.customEnv,
      yoloMode: false,
    };

    this.connection = new AcpConnection();
    this.adapter = new AcpAdapter(this.id, this.extra.backend);

    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers(): void {
    this.connection.onSessionUpdate = (data: AcpSessionUpdate) => {
      this.handleSessionUpdate(data);
    };
    this.connection.onPermissionRequest = (data: AcpPermissionRequest) => {
      return this.handlePermissionRequest(data);
    };
    this.connection.onEndTurn = () => {
      this.handleEndTurn();
    };
    this.connection.onPromptUsage = (usage: AcpPromptResponseUsage) => {
      this.handlePromptUsage(usage);
    };
    this.connection.onFileOperation = (operation) => {
      this.handleFileOperation(operation);
    };
    this.connection.onDisconnect = (error) => {
      this.handleDisconnect(error);
    };
  }

  /**
   * Check if a tool is a chrome-devtools navigation tool
   * 检查工具是否为 chrome-devtools 导航工具
   *
   * Delegates to NavigationInterceptor for unified logic
   */
  private isNavigationTool(toolName: string): boolean {
    return NavigationInterceptor.isNavigationTool(toolName);
  }

  /**
   * Extract URL from navigation tool's permission request data
   * 从导航工具的权限请求数据中提取 URL
   *
   * Delegates to NavigationInterceptor for unified logic
   */
  // eslint-disable-next-line max-len
  private extractNavigationUrl(toolCall: {
    rawInput?: Record<string, unknown>;
    content?: Array<{ type?: string; content?: { type?: string; text?: string }; text?: string }>;
    title?: string;
  }): string | null {
    return NavigationInterceptor.extractUrl(toolCall);
  }

  /**
   * Handle intercepted navigation tool by emitting preview_open event
   * 处理被拦截的导航工具，发出 preview_open 事件
   */
  private handleInterceptedNavigation(url: string, _toolName: string): void {
    const previewMessage = NavigationInterceptor.createPreviewMessage(url, this.id);
    this.onStreamEvent(previewMessage);
  }

  private getConnectTimeoutMs(): number {
    if (this.extra.backend === 'codex') {
      return 150000;
    }

    return 70000;
  }

  // 启动ACP连接和会话
  async start(): Promise<void> {
    const startTotal = Date.now();
    try {
      this.emitStatusMessage('connecting');

      const connectStart = Date.now();
      const tryConnect = async () => {
        const connectTimeoutMs = this.getConnectTimeoutMs();
        let connectTimeoutId: NodeJS.Timeout | null = null;

        try {
          const connectTimeoutPromise = new Promise<never>((_, reject) => {
            connectTimeoutId = setTimeout(() => {
              reject(new Error(`Connection timeout after ${Math.floor(connectTimeoutMs / 1000)} seconds`));
            }, connectTimeoutMs);
          });

          await Promise.race([
            this.connection.connect(
              this.extra.backend,
              this.extra.cliPath,
              this.extra.workspace,
              this.extra.customArgs,
              this.extra.customEnv
            ),
            connectTimeoutPromise,
          ]);
        } finally {
          if (connectTimeoutId) {
            clearTimeout(connectTimeoutId);
          }
        }
      };

      try {
        await tryConnect();
      } catch (firstError) {
        // Transient startup failures (env race / process warmup) are common on first try.
        // Retry once after a short backoff to reduce "need multiple clicks to connect".
        console.warn(
          '[ACP] First connect attempt failed, retrying once:',
          firstError instanceof Error ? firstError.message : String(firstError)
        );
        await this.connection.disconnect();
        await new Promise((resolve) => setTimeout(resolve, 300));
        await tryConnect();
      }
      console.log(`[ACP-PERF] start: connection.connect() completed ${Date.now() - connectStart}ms`);

      // Persist initialize result to disk so capabilities are available before next session
      this.cacheInitializeResult().catch((err) => {
        console.warn('[ACP] Failed to cache initialize result:', err instanceof Error ? err.message : String(err));
      });

      this.emitStatusMessage('connected');

      const authStart = Date.now();
      await this.performAuthentication();
      console.log(`[ACP-PERF] start: authentication completed ${Date.now() - authStart}ms`);

      // 避免重复创建会话：仅当尚无活动会话时再创建
      // Create new session or resume existing one (if ACP backend supports it)
      if (!this.connection.hasActiveSession) {
        const sessionStart = Date.now();
        await this.createOrResumeSession();
        console.log(`[ACP-PERF] start: session created ${Date.now() - sessionStart}ms`);
      }

      // YOLO mode: bypass all permission checks for supported backends
      if (this.extra.yoloMode) {
        const yoloModeMap: Partial<Record<AcpBackend, string>> = {
          claude: CLAUDE_YOLO_SESSION_MODE,
          codebuddy: CODEBUDDY_YOLO_SESSION_MODE,
          qwen: QWEN_YOLO_SESSION_MODE,
        };
        const sessionMode = yoloModeMap[this.extra.backend];
        if (sessionMode) {
          await this.applySessionMode(sessionMode, true, `${this.extra.backend} YOLO mode`);
        }
      } else if (this.extra.sessionMode && this.extra.sessionMode !== 'default') {
        // Apply non-default, non-YOLO session mode (e.g., acceptEdits, auto, dontAsk, plan)
        // so the CLI backend reflects the mode selected by the user on the Guid page.
        await this.applySessionMode(this.extra.sessionMode, false, `session mode`);
      }

      // For Claude backend, keep runtime model selection aligned with the
      // local Claude slot model (`default` / `opus` / `haiku`).
      // Do not send the relay's underlying model name (for example glm-5.1x)
      // to ACP, because claude-agent-acp only accepts slot ids.
      if (this.extra.backend === 'claude') {
        const configuredModel = readClaudeModelInfoFromCcSwitch()?.currentModelId ?? getClaudeModelSlot();
        if (configuredModel) {
          try {
            const modelStart = Date.now();
            await this.connection.setModel(configuredModel);
            console.log(`[ACP-PERF] start: model set ${Date.now() - modelStart}ms`);
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[ACP] Failed to set Claude slot model "${configuredModel}": ${errMsg}`);
            // Detect third-party relay/proxy errors (e.g., NewAPI/OneAPI "model_not_found").
            // These services route by the underlying model mapped to the selected slot.
            // Emit a visible warning so the user knows to update the relay-side mapping.
            if (errMsg.includes('model_not_found') || errMsg.includes('无可用渠道')) {
              this.emitErrorMessage(
                `Claude slot "${configuredModel}" could not be activated on your API relay service. ` +
                  `Please check the model mapping in cc-switch or ~/.claude/settings.json. ` +
                  `Falling back to the relay's default Claude slot.`
              );
            }
          }
        }
      } else if (this.extra.currentModelId) {
        // For non-claude backends (e.g. gemini-cli), apply the model configured in
        // channel settings or persisted from a prior user model switch.
        try {
          await this.connection.setModel(this.extra.currentModelId);
        } catch (error) {
          console.warn(
            `[ACP] Failed to set model "${this.extra.currentModelId}": ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Apply pending config options from Guid page selection (e.g., reasoning_effort)
      if (this.extra.pendingConfigOptions) {
        await Promise.all(
          Object.entries(this.extra.pendingConfigOptions).map(async ([configId, value]) => {
            try {
              await this.connection.setConfigOption(configId, value);
            } catch (error) {
              console.warn(
                `[ACP] Failed to apply pending config option "${configId}": ${error instanceof Error ? error.message : String(error)}`
              );
            }
          })
        );
      }

      // Emit initial model info after session setup completes
      this.emitModelInfo();

      // Snapshot session capabilities NOW, before streaming updates can modify them.
      // cacheSessionCapabilities() is queued and may execute later, by which time
      // config_option_update notifications could have altered the connection state.
      const capabilitiesSnapshot = {
        modelInfo: this.getModelInfo(),
        configOptions: this.connection.getConfigOptions(),
        modes: this.connection.getModes(),
      };
      this.cacheSessionCapabilities(capabilitiesSnapshot).catch((err) => {
        console.warn('[ACP] Failed to cache session capabilities:', err instanceof Error ? err.message : String(err));
      });

      this.emitStatusMessage('session_active');
      console.log(`[ACP-PERF] start: total ${Date.now() - startTotal}ms`);
    } catch (error) {
      console.log(`[ACP-PERF] start: failed after ${Date.now() - startTotal}ms`);
      this.emitStatusMessage('error');
      console.log('error===>', error);
      throw error;
    }
  }

  /**
   * Apply a session mode via the ACP connection.
   * @param mode   The mode string to set (e.g., 'bypassPermissions', 'acceptEdits').
   * @param fatal  If true, throw on failure (YOLO — must succeed); if false, warn and continue.
   * @param label  Human-readable label for log messages (e.g., 'claude YOLO mode').
   */
  private async applySessionMode(mode: string, fatal: boolean, label: string): Promise<void> {
    try {
      const modeStart = Date.now();
      await this.connection.setSessionMode(mode);
      console.log(`[ACP-PERF] start: session mode set ${Date.now() - modeStart}ms`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (fatal) {
        throw new Error(`[ACP] Failed to enable ${label} (${mode}): ${msg}`, { cause: error });
      }
      console.warn(`[ACP] Failed to set session mode "${mode}": ${msg}`);
    }
  }

  /**
   * Read promptTimeout from acp.config for the current backend and apply it to the connection.
   */
  private async applyPromptTimeoutFromConfig(): Promise<void> {
    try {
      // Per-backend promptTimeout takes priority over global setting
      const acpConfig = await ProcessConfig.get('acp.config');
      const backendTimeout = acpConfig?.[this.extra.backend]?.promptTimeout;
      if (backendTimeout && backendTimeout > 0) {
        this.connection.setPromptTimeout(backendTimeout);
        return;
      }
      // Fallback to global acp.promptTimeout
      const globalTimeout = await ProcessConfig.get('acp.promptTimeout');
      if (globalTimeout && globalTimeout > 0) {
        this.connection.setPromptTimeout(globalTimeout);
      }
    } catch {
      // Ignore config read errors, default timeout will be used
    }
  }

  /**
   * Enable yoloMode on a running agent.
   * If already enabled, this is a no-op. Otherwise, sets the session mode
   * on the active connection (for backends that support it).
   */
  async enableYoloMode(): Promise<void> {
    if (this.extra.yoloMode) return;
    this.extra.yoloMode = true;

    if (this.connection.isConnected && this.connection.hasActiveSession) {
      const yoloModeMap: Partial<Record<AcpBackend, string>> = {
        claude: CLAUDE_YOLO_SESSION_MODE,
        qwen: QWEN_YOLO_SESSION_MODE,
      };
      const sessionMode = yoloModeMap[this.extra.backend];
      if (sessionMode) {
        await this.connection.setSessionMode(sessionMode);
      }
    }
  }

  /**
   * Get unified model info from ACP connection.
   * Prefers stable configOptions API, falls back to unstable models API.
   */
  getModelInfo(): AcpModelInfo | null {
    const preferredModelInfo = this.extra.backend === 'claude' ? readClaudeModelInfoFromCcSwitch() : null;
    if (this.extra.backend === 'claude' && this.userModelOverride && preferredModelInfo?.availableModels?.length) {
      const selectedModel = preferredModelInfo.availableModels.find((model) => model.id === this.userModelOverride);
      if (selectedModel) {
        return {
          ...preferredModelInfo,
          currentModelId: selectedModel.id,
          currentModelLabel: selectedModel.label,
        };
      }
    }
    return buildAcpModelInfo(this.connection.getConfigOptions(), this.connection.getModels(), preferredModelInfo);
  }

  /**
   * Get non-model, non-mode config options from ACP connection.
   * Filters out model-category options (handled by AcpModelSelector)
   * and mode-category options (handled by AgentModeSelector).
   * Returns options like reasoning effort, output format, etc.
   */
  getConfigOptions(): AcpSessionConfigOption[] {
    const all = this.connection.getConfigOptions();
    if (!all) return [];
    return all.filter((opt) => opt.category !== 'model' && opt.category !== 'mode');
  }

  /**
   * Set a config option value on the ACP connection.
   * Used for reasoning effort and other non-model config options.
   */
  async setConfigOption(configId: string, value: string): Promise<AcpSessionConfigOption[]> {
    await this.connection.setConfigOption(configId, value);
    return this.getConfigOptions();
  }

  /**
   * Switch model using session/set_model (preferred) with configOption fallback.
   *
   * session/set_model is preferred because it maps to unstable_setSessionModel()
   * in claude-agent-acp which:
   *   1. Calls query.setModel() → sends set_model control request to CLI
   *   2. Calls updateConfigOption() → sends config_option_update notification
   * This provides both the actual CLI model change AND a cache sync notification.
   *
   * session/set_config_option only returns updated configOptions in the response
   * but does NOT send a separate notification, making it less robust for cache sync.
   */
  async setModelByConfigOption(modelId: string): Promise<AcpModelInfo | null> {
    const modelInfo = this.getModelInfo();
    if (!modelInfo) {
      throw new Error('No model info available');
    }

    // Always use session/set_model for direct CLI control.
    // Falls back to session/set_config_option only for non-Claude backends
    // that don't support the unstable_setSessionModel method.
    try {
      await this.connection.setModel(modelId);
    } catch (setModelError) {
      // Fallback to set_config_option if set_model is not supported
      if (modelInfo.source === 'configOption' && modelInfo.configOptionId) {
        await this.connection.setConfigOption(modelInfo.configOptionId, modelId);
      } else {
        throw setModelError;
      }
    }

    this.userModelOverride = modelId;

    // Queue a model switch notice for the next prompt.
    // In terminal mode, "/model haiku" outputs "Set model to haiku" into the conversation,
    // and the AI reads this to update its self-identification. In ACP mode, set_model is
    // silent, so we inject an equivalent notice into the next user message.
    this.pendingModelSwitchNotice = modelId;

    // Return updated model info after switch
    return this.getModelInfo();
  }

  /**
   * Emit current model info to the stream event handler.
   */
  private emitModelInfo(): void {
    const modelInfo = this.getModelInfo();
    if (modelInfo) {
      this.onStreamEvent({
        type: 'acp_model_info',
        conversation_id: this.id,
        msg_id: uuid(),
        data: modelInfo,
      });
    }
  }

  /**
   * Cancel the current prompt turn without killing the backend process.
   * Sends session/cancel notification so the backend stops LLM generation.
   * The connection stays alive for subsequent messages.
   */
  cancelPrompt(): void {
    this.connection.cancelPrompt();
    // Reject pending permission dialogs so UI doesn't stay stuck
    for (const [id, pending] of this.pendingPermissions) {
      pending.reject(new Error('Cancelled'));
      this.pendingPermissions.delete(id);
    }
    // Emit finish signal to reset frontend loading state
    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'finish',
        conversation_id: this.id,
        msg_id: uuid(),
        data: null,
      });
    }
  }

  /**
   * Fully disconnect from the backend, killing the child process.
   * Use cancelPrompt() to stop a running prompt without disconnecting.
   */
  async kill(): Promise<void> {
    await this.connection.disconnect();
    // Clear session-scoped caches when session ends
    this.approvalStore.clear();
    this.permissionRequestMeta.clear();
    // Emit finish event to reset frontend UI state
    this.onStreamEvent({
      type: 'finish',
      conversation_id: this.id,
      msg_id: uuid(),
      data: null,
    });
  }

  // 发送消息到ACP服务器
  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<AcpResult> {
    const sendStart = Date.now();
    try {
      this.turnHasThought = false;
      this.turnHasContent = false;

      // Auto-reconnect if connection is lost (e.g., after unexpected process exit)
      if (!this.connection.isConnected || !this.connection.hasActiveSession) {
        const reconnectStart = Date.now();
        try {
          await this.start();
          console.log(`[ACP-PERF] send: auto-reconnect completed ${Date.now() - reconnectStart}ms`);
        } catch (reconnectError) {
          console.log(`[ACP-PERF] send: auto-reconnect failed ${Date.now() - reconnectStart}ms`);
          const errorMsg = reconnectError instanceof Error ? reconnectError.message : String(reconnectError);
          return {
            success: false,
            error: createAcpError(AcpErrorType.CONNECTION_NOT_READY, `Failed to reconnect: ${errorMsg}`, true),
          };
        }
      }

      // Emit start event to set frontend loading state
      this.onStreamEvent({
        type: 'start',
        conversation_id: this.id,
        msg_id: data.msg_id || uuid(),
        data: null,
      });

      this.adapter.resetMessageTracking();
      this.adapter.resetPlanTracking();
      let processedContent = data.content;

      // Add @ prefix to ALL uploaded files (including images) with FULL PATH
      // Claude CLI needs full path to read files
      // 为所有上传的文件添加 @ 前缀（包括图片），使用完整路径让 Claude CLI 读取
      if (data.files && data.files.length > 0) {
        const fileRefs = data.files
          .map((filePath) => {
            // Use full path instead of just filename
            // Escape paths with spaces using quotes for Claude CLI
            // 对含空格的路径使用引号包裹，确保 Claude CLI 正确解析
            if (filePath.includes(' ')) {
              return `@"${filePath}"`;
            }
            return '@' + filePath;
          })
          .join(' ');
        // Prepend file references to the content
        processedContent = fileRefs + ' ' + processedContent;
      }

      // Process @ file references in the message
      // 处理消息中的 @ 文件引用
      const atFileStart = Date.now();
      processedContent = await this.processAtFileReferences(processedContent, data.files);
      const atFileDuration = Date.now() - atFileStart;
      if (atFileDuration > 10) {
        console.log(`[ACP-PERF] send: @file references processed ${atFileDuration}ms`);
      }

      // Re-assert model override before sending prompt.
      // This ensures the CLI subprocess uses the correct model even if it
      // lost the override state (e.g., after internal compaction or restart).
      if (this.userModelOverride) {
        const currentInfo = this.getModelInfo();
        const expected = this.userModelOverride;
        if (currentInfo?.currentModelId !== expected) {
          try {
            await this.connection.setModel(expected);
          } catch (err) {
            console.warn(
              `[ACP] Pre-prompt model re-assert failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }

      // Inject model switch notice for Claude backend.
      // In terminal, "/model X" output appears in conversation so the AI knows about
      // the switch. In ACP mode set_model is silent, so we prepend an equivalent notice.
      if (this.pendingModelSwitchNotice && this.extra.backend === 'claude') {
        const modelNotice =
          `<system-reminder>\n` +
          `Model switch: The active model has been changed to ${this.pendingModelSwitchNotice} via the /model command. ` +
          `You are now running as ${this.pendingModelSwitchNotice}. ` +
          `The ANTHROPIC_MODEL environment variable and the earlier "You are powered by" text in the system prompt are stale (cached from session start) and no longer reflect the actual model. ` +
          `When asked which model you are, answer ${this.pendingModelSwitchNotice}.\n` +
          `</system-reminder>\n\n`;
        processedContent = modelNotice + processedContent;
        this.pendingModelSwitchNotice = null;
      }

      // Re-read timeout config before each prompt so changes take effect immediately
      await this.applyPromptTimeoutFromConfig();

      const promptStart = Date.now();
      await this.connection.sendPrompt(processedContent);
      console.log(
        `[ACP-PERF] send: sendPrompt completed ${Date.now() - promptStart}ms (total send: ${Date.now() - sendStart}ms)`
      );

      this.statusMessageId = null;
      return { success: true, data: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Special handling for Internal error
      if (errorMsg.includes('Internal error')) {
        if (this.extra.backend === 'qwen') {
          const enhancedMsg =
            `Qwen ACP Internal Error: This usually means authentication failed or ` +
            `the Qwen CLI has compatibility issues. Please try: 1) Restart the application ` +
            `2) Use the packaged bun launcher instead of a global qwen install 3) Check if you have valid Qwen credentials.`;
          this.emitErrorMessage(enhancedMsg);
          return {
            success: false,
            error: createAcpError(AcpErrorType.AUTHENTICATION_FAILED, enhancedMsg, false),
          };
        }
      }
      // Classify error types based on message content
      let errorType: AcpErrorType = AcpErrorType.UNKNOWN;
      let retryable = false;

      if (errorMsg.includes('authentication') || errorMsg.includes('认证失败') || errorMsg.includes('[ACP-AUTH-')) {
        errorType = AcpErrorType.AUTHENTICATION_FAILED;
        retryable = false;
      } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout') || errorMsg.includes('timed out')) {
        errorType = AcpErrorType.TIMEOUT;
        retryable = true;
      } else if (errorMsg.includes('permission') || errorMsg.includes('Permission')) {
        errorType = AcpErrorType.PERMISSION_DENIED;
        retryable = false;
      } else if (errorMsg.includes('connection') || errorMsg.includes('Connection')) {
        errorType = AcpErrorType.NETWORK_ERROR;
        retryable = true;
      }

      this.emitErrorMessage(errorMsg);

      // Emit finish signal to reset frontend loading state.
      // Without this, the UI stays in loading after a timeout and the user cannot
      // type new messages, effectively freezing the session.
      if (this.onSignalEvent) {
        this.onSignalEvent({
          type: 'finish',
          conversation_id: this.id,
          msg_id: uuid(),
          data: null,
        });
      }

      return {
        success: false,
        error: createAcpError(errorType, errorMsg, retryable),
      };
    }
  }

  /**
   * Process @ file references in the message content
   * 处理消息内容中的 @ 文件引用
   *
   * This method resolves @ references to actual files in the workspace,
   * reads their content, and appends it to the message.
   * 此方法解析工作区中的 @ 引用，读取文件内容并附加到消息中。
   */
  private async processAtFileReferences(content: string, uploadedFiles?: string[]): Promise<string> {
    const workspace = this.extra.workspace;
    if (!workspace) {
      return content;
    }

    // Parse all @ references in the content
    // Note: @ prefix is already added to content by sendMessage for uploaded files
    // 解析 content 中的所有 @ 引用
    // 注意：sendMessage 已为上传的文件添加了 @ 前缀
    const parts = parseAllAtCommands(content);
    const atPaths = extractAtPaths(content);

    // If no @ references found, return original content
    if (atPaths.length === 0) {
      return content;
    }

    // Track which @ references are resolved to files
    const resolvedFiles: Map<string, string> = new Map(); // atPath -> file content
    // Track @ references that should be removed (duplicate file references by filename)
    const referencesToRemove: Set<string> = new Set();

    for (const atPath of atPaths) {
      // Check if this @ reference is an uploaded file (full path or filename)
      // If yes, skip it - let Claude CLI handle it natively
      // 检查此 @ 引用是否是上传的文件（完整路径或文件名），如果是则跳过，让 Claude CLI 原生处理
      const matchedUploadFile = uploadedFiles?.find((filePath) => {
        // Match by full path
        if (atPath === filePath) return true;
        // Match by filename (for cases where message contains just filename)
        const fileName = filePath.split(/[\\/]/).pop() || filePath;
        return atPath === fileName;
      });

      if (matchedUploadFile) {
        // If this is a filename reference (not full path), mark for removal
        // The full path reference will be kept
        // 如果这是文件名引用（不是完整路径），标记为移除，因为已经有完整路径引用了
        if (atPath !== matchedUploadFile) {
          referencesToRemove.add(atPath);
        }
        // Skip uploaded files - they are already in @ format with full path
        // Claude CLI will handle them natively
        continue;
      }

      // For workspace file references (filename only), try to resolve and read
      // 对于工作区文件引用（只有文件名），尝试解析和读取
      const resolvedPath = await this.resolveAtPath(atPath, workspace);

      if (resolvedPath) {
        try {
          // Try to read as text file
          const fileContent = await fs.readFile(resolvedPath, 'utf-8');
          resolvedFiles.set(atPath, fileContent);
        } catch (error) {
          // Binary files (images, etc.) cannot be read as text
          // Keep the @ reference as-is, let CLI handle it
          // 二进制文件（图片等）无法作为文本读取，保持 @ 引用，让 CLI 处理
          console.warn(`[ACP] Skipping binary file ${atPath} (will be handled by CLI)`);
        }
      }
    }

    // If no files were resolved and no references to remove, return original content
    if (resolvedFiles.size === 0 && referencesToRemove.size === 0) {
      return content;
    }

    // Reconstruct the message: replace @ references with plain text and append file contents
    const reconstructedQuery = reconstructQuery(parts, (atPath) => {
      // Remove duplicate filename references (when full path already exists)
      if (referencesToRemove.has(atPath)) {
        return '';
      }
      if (resolvedFiles.has(atPath)) {
        // Replace with just the filename (without @) as the reference
        return atPath;
      }
      // Keep unresolved @ references as-is
      return '@' + atPath;
    });

    // Append file contents at the end of the message
    let result = reconstructedQuery;
    if (resolvedFiles.size > 0) {
      result += '\n\n--- Referenced file contents ---';
      for (const [atPath, fileContent] of resolvedFiles) {
        result += `\n\n[Content of ${atPath}]:\n${fileContent}`;
      }
      result += '\n--- End of file contents ---';
    }

    return result;
  }

  /**
   * Resolve an @ path to an actual file path in the workspace
   * 将 @ 路径解析为工作区中的实际文件路径
   */
  private async resolveAtPath(atPath: string, workspace: string): Promise<string | null> {
    // Try direct path first
    const directPath = path.resolve(workspace, atPath);
    try {
      const stats = await fs.stat(directPath);
      if (stats.isFile()) {
        return directPath;
      }
      // If it's a directory, we don't read it (for now)
      return null;
    } catch {
      // Direct path doesn't exist, try searching for the file
    }

    // Try to find file by name in workspace (simple search)
    try {
      const fileName = path.basename(atPath);
      const foundPath = await this.findFileInWorkspace(workspace, fileName);
      return foundPath;
    } catch {
      return null;
    }
  }

  /**
   * Simple file search in workspace (non-recursive for performance)
   * 在工作区中简单搜索文件（非递归以保证性能）
   */
  private async findFileInWorkspace(workspace: string, fileName: string, maxDepth: number = 3): Promise<string | null> {
    const searchDir = async (dir: string, depth: number): Promise<string | null> => {
      if (depth > maxDepth) return null;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isFile() && entry.name === fileName) {
            return fullPath;
          }
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            const found = await searchDir(fullPath, depth + 1);
            if (found) return found;
          }
        }
      } catch {
        // Ignore permission errors
      }
      return null;
    };

    return await searchDir(workspace, 0);
  }

  confirmMessage(data: { confirmKey: string; callId: string }): Promise<AcpResult> {
    try {
      if (this.pendingPermissions.has(data.callId)) {
        const { resolve } = this.pendingPermissions.get(data.callId)!;
        this.pendingPermissions.delete(data.callId);

        // Store "allow_always" decision to ApprovalStore for future auto-approval
        // Workaround for claude-agent-acp bug: it returns updatedPermissions but doesn't check suggestions
        if (data.confirmKey === 'allow_always') {
          const meta = this.permissionRequestMeta.get(data.callId);
          if (meta) {
            const approvalKey = createAcpApprovalKey({
              kind: meta.kind,
              title: meta.title,
              rawInput: meta.rawInput,
            });
            this.approvalStore.put(approvalKey, 'allow_always');
          }
        }

        // Clean up metadata
        this.permissionRequestMeta.delete(data.callId);

        resolve({ optionId: data.confirmKey });
        return Promise.resolve({ success: true, data: null });
      }
      return Promise.resolve({
        success: false,
        error: createAcpError(AcpErrorType.UNKNOWN, `Permission request not found for callId: ${data.callId}`, false),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return Promise.resolve({
        success: false,
        error: createAcpError(AcpErrorType.UNKNOWN, errorMsg, false),
      });
    }
  }

  private handleSessionUpdate(data: AcpSessionUpdate): void {
    try {
      if (data.update?.sessionUpdate === 'available_commands_update') {
        const commandUpdate = data as AvailableCommandsUpdate;
        const commands: AcpAvailableCommand[] = [];
        for (const command of commandUpdate.update?.availableCommands || []) {
          const name = command.name?.trim();
          if (!name) continue;
          const description = (command.description || command.name || '').trim();
          commands.push({
            name,
            description: description || name,
            hint: command.input?.hint?.trim(),
          });
        }
        this.onAvailableCommandsUpdate?.(commands);
      }

      // Intercept chrome-devtools navigation tools from session updates
      // 从会话更新中拦截 chrome-devtools 导航工具
      if (data.update?.sessionUpdate === 'tool_call') {
        const toolCallUpdate = data as ToolCallUpdate;
        const toolName = toolCallUpdate.update?.title || '';
        const toolCallId = toolCallUpdate.update?.toolCallId;
        if (this.isNavigationTool(toolName)) {
          // Track this navigation tool call for result interception
          // 跟踪此导航工具调用以拦截结果
          if (toolCallId) {
            this.pendingNavigationTools.add(toolCallId);
          }
          const url = this.extractNavigationUrl(toolCallUpdate.update);
          if (url) {
            // Emit preview_open event to show URL in preview panel
            // 发出 preview_open 事件，在预览面板中显示 URL
            this.handleInterceptedNavigation(url, toolName);
          }
        }
      }

      // Intercept tool_call_update to extract URL from navigation tool results
      // 拦截 tool_call_update 以从导航工具结果中提取 URL
      if (data.update?.sessionUpdate === 'tool_call_update') {
        const statusUpdate = data as import('@/common/types/acpTypes').ToolCallUpdateStatus;
        const toolCallId = statusUpdate.update?.toolCallId;
        if (toolCallId && this.pendingNavigationTools.has(toolCallId)) {
          // This is a result for a tracked navigation tool
          // 这是已跟踪的导航工具的结果
          if (statusUpdate.update?.status === 'completed' && statusUpdate.update?.content) {
            // Try to extract URL from the result content
            // 尝试从结果内容中提取 URL
            for (const item of statusUpdate.update.content) {
              const text = item.content?.text || '';
              const urlMatch = text.match(/https?:\/\/[^\s<>"]+/i);
              if (urlMatch) {
                this.handleInterceptedNavigation(urlMatch[0], 'navigate_page');
                break;
              }
            }
          }
          // Clean up tracking
          // 清理跟踪
          this.pendingNavigationTools.delete(toolCallId);
        }
      }

      // Emit context usage data when usage_update arrives
      if (data.update?.sessionUpdate === 'usage_update') {
        this.hasReceivedUsageUpdate = true;
        const usageUpdate = data.update as { used: number; size: number; cost?: { amount: number; currency: string } };
        this.onStreamEvent({
          type: 'acp_context_usage',
          conversation_id: this.id,
          msg_id: uuid(),
          data: {
            used: usageUpdate.used,
            size: usageUpdate.size,
            cost: usageUpdate.cost,
          },
        });
      }

      // Emit updated model info when config_option_update arrives
      if (data.update?.sessionUpdate === 'config_option_update') {
        this.emitModelInfo();
      }

      const messages = this.adapter.convertSessionUpdate(data);

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        // 所有消息都直接发送，不做复杂的替换逻辑
        this.emitMessage(message);
      }
    } catch (error) {
      this.emitErrorMessage(
        `Failed to process session update: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private handlePermissionRequest(data: AcpPermissionRequest): Promise<{ optionId: string }> {
    return new Promise((resolve, reject) => {
      // Ensure every permission request has a stable toolCallId so UI + pending map stay in sync
      // 确保每个权限请求都拥有稳定的 toolCallId，保证 UI 与 pending map 对齐
      if (data.toolCall && !data.toolCall.toolCallId) {
        data.toolCall.toolCallId = uuid();
      }
      const requestId = data.toolCall.toolCallId; // 使用 toolCallId 作为 requestId

      // Check ApprovalStore for cached "always allow" decision
      // Workaround for claude-agent-acp bug: it returns updatedPermissions but doesn't check suggestions
      const approvalKey = createAcpApprovalKey(data.toolCall);
      if (this.approvalStore.isApprovedForSession(approvalKey)) {
        // Auto-approve without showing dialog - no metadata storage needed
        resolve({ optionId: 'allow_always' });
        return;
      }

      // Clean up any existing metadata for this requestId before storing new one
      // This handles duplicate permission requests properly
      if (this.permissionRequestMeta.has(requestId)) {
        this.permissionRequestMeta.delete(requestId);
      }

      // Store metadata for later use in confirmMessage
      this.permissionRequestMeta.set(requestId, {
        kind: data.toolCall.kind,
        title: data.toolCall.title,
        rawInput: data.toolCall.rawInput,
      });

      // Intercept chrome-devtools navigation tools and show in preview panel
      // 拦截 chrome-devtools 导航工具，在预览面板中显示
      // Note: We only emit preview_open event, do NOT block tool execution
      // 注意：只发送 preview_open 事件，不阻止工具执行，agent 需要 chrome-devtools 获取网页内容
      const toolName = data.toolCall?.title || '';
      if (this.isNavigationTool(toolName)) {
        const url = this.extractNavigationUrl(data.toolCall);
        if (url) {
          // Emit preview_open event to show URL in preview panel
          // 发出 preview_open 事件，在预览面板中显示 URL
          this.handleInterceptedNavigation(url, toolName);
        }
        // Track for later extraction from result if URL not available now
        // 跟踪以便稍后从结果中提取 URL（如果现在不可用）
        this.pendingNavigationTools.add(requestId);
      }

      // 检查是否有重复的权限请求
      if (this.pendingPermissions.has(requestId)) {
        // 如果是重复请求，先清理旧的
        const oldRequest = this.pendingPermissions.get(requestId);
        if (oldRequest) {
          oldRequest.reject(new Error('Replaced by new permission request'));
        }
        this.pendingPermissions.delete(requestId);
      }

      this.pendingPermissions.set(requestId, { resolve, reject });

      // 确保权限消息总是被发送，即使有异步问题
      try {
        this.emitPermissionRequest(data); // 直接传递 AcpPermissionRequest
      } catch (error) {
        this.pendingPermissions.delete(requestId);
        reject(error);
        return;
      }

      // In team mode, wait indefinitely for leader to approve (like Claude).
      // In standalone mode, allow up to 30 minutes to respond to permission prompts.
      if (!this.extra.teamMcpStdioConfig) {
        setTimeout(() => {
          if (this.pendingPermissions.has(requestId)) {
            this.pendingPermissions.delete(requestId);
            reject(new Error('Permission request timed out'));
          }
        }, 1800000);
      }
    });
  }

  private handleEndTurn(): void {
    if (this.turnHasThought && !this.turnHasContent) {
      console.warn(
        `[ACP-STREAM] End turn with thought but no content (conversation=${this.id}, backend=${this.extra.backend})`
      );
    }

    // 使用信号回调发送 end_turn 事件，不添加到消息列表
    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'finish',
        conversation_id: this.id,
        msg_id: uuid(),
        data: null,
      });
    }
  }

  /**
   * Handle PromptResponse.usage from ACP backend (codex-acp PR #167).
   * Used as fallback context usage when usage_update notifications are not available.
   * Follows the same pattern as Gemini CLI's usageMetadata extraction.
   */
  private handlePromptUsage(usage: AcpPromptResponseUsage): void {
    // Skip if usage_update notifications are already providing context usage data
    if (this.hasReceivedUsageUpdate) {
      return;
    }

    // Use totalTokens from PromptResponse as context usage indicator (fallback)
    // size=0 tells the frontend to use model-based context limit lookup
    this.onStreamEvent({
      type: 'acp_context_usage',
      conversation_id: this.id,
      msg_id: uuid(),
      data: {
        used: usage.totalTokens,
        size: 0,
      },
    });
  }

  /**
   * Handle unexpected disconnect from ACP backend
   * Notify frontend and clean up internal state
   */
  private handleDisconnect(error: { code: number | null; signal: NodeJS.Signals | null }): void {
    // Emit finish signal to reset UI loading state (preserving single-chat behavior).
    // The agentCrash flag in data lets TeammateManager distinguish a crash from a normal turn end.
    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'finish',
        conversation_id: this.id,
        msg_id: uuid(),
        data: {
          error: `Process exited unexpectedly (code: ${error.code}, signal: ${error.signal})`,
          agentCrash: true,
        },
      });
    }

    // Clear internal state
    this.pendingPermissions.clear();
    this.permissionRequestMeta.clear();
    this.approvalStore.clear();
    this.pendingNavigationTools.clear();
    this.statusMessageId = null;
  }

  private handleFileOperation(operation: { method: string; path: string; content?: string; sessionId: string }): void {
    this.emitMessage(this.createFileOperationToolCall(operation));
  }

  private createFileOperationToolCall(operation: {
    method: string;
    path: string;
    content?: string;
    sessionId: string;
  }): TMessage {
    const toolCallId = uuid();
    const contentPreview =
      operation.method === 'fs/write_text_file' && operation.content
        ? [
            {
              type: 'content' as const,
              content: {
                type: 'text' as const,
                text: this.formatFileOperationPreview(operation.content),
              },
            },
          ]
        : undefined;

    return {
      id: toolCallId,
      msg_id: toolCallId,
      conversation_id: this.id,
      type: 'acp_tool_call',
      position: 'left',
      createdAt: Date.now(),
      content: {
        sessionId: operation.sessionId,
        update: {
          sessionUpdate: 'tool_call',
          toolCallId,
          status: 'completed',
          title: this.getFileOperationTitle(operation.method),
          kind: operation.method === 'fs/read_text_file' ? 'read' : 'edit',
          rawInput: {
            file_path: operation.path,
            method: operation.method,
          },
          content: contentPreview,
          locations: [{ path: operation.path }],
        },
      },
    };
  }

  private getFileOperationTitle(method: string): string {
    switch (method) {
      case 'fs/write_text_file':
        return 'File Write';
      case 'fs/read_text_file':
        return 'File Read';
      default:
        return 'File Operation';
    }
  }

  private formatFileOperationPreview(content: string): string {
    if (content.length <= 500) {
      return content;
    }
    return content.slice(0, 500) + '\n... (truncated)';
  }

  private emitStatusMessage(status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'error'): void {
    // Use fixed ID for status messages so they update instead of duplicate
    if (!this.statusMessageId) {
      this.statusMessageId = uuid();
    }

    const statusMessage: TMessage = {
      id: this.statusMessageId,
      msg_id: this.statusMessageId,
      conversation_id: this.id,
      type: 'agent_status',
      position: 'center',
      createdAt: Date.now(),
      content: {
        backend: this.extra.backend,
        status,
        agentName: this.extra.agentName,
      },
    };

    this.emitMessage(statusMessage);
  }

  private emitPermissionRequest(data: AcpPermissionRequest): void {
    // 重要：将权限请求中的 toolCall 注册到 adapter 的 activeToolCalls 中
    // 这样后续的 tool_call_update 事件就能找到对应的 tool call 了
    if (data.toolCall) {
      // 将权限请求中的 kind 映射到正确的类型
      const mapKindToValidType = (kind?: string): 'read' | 'edit' | 'execute' => {
        switch (kind) {
          case 'read':
            return 'read';
          case 'edit':
            return 'edit';
          case 'execute':
            return 'execute';
          default:
            return 'execute'; // 默认为 execute
        }
      };

      const toolCallUpdate: ToolCallUpdate = {
        sessionId: data.sessionId,
        update: {
          sessionUpdate: 'tool_call' as const,
          toolCallId: data.toolCall.toolCallId,
          status: normalizeToolCallStatus(data.toolCall.status),
          title: data.toolCall.title || 'Tool Call',
          kind: mapKindToValidType(data.toolCall.kind),
          content: data.toolCall.content || [],
          locations: data.toolCall.locations || [],
        },
      };

      // 创建 tool call 消息以注册到 activeToolCalls
      this.adapter.convertSessionUpdate(toolCallUpdate);
    }

    // 使用 onSignalEvent 而不是 emitMessage，这样消息不会被持久化到数据库
    // Permission request 是临时交互消息，一旦用户做出选择就失去意义
    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'acp_permission',
        conversation_id: this.id,
        msg_id: uuid(),
        data: data,
      });
    }
  }

  private emitErrorMessage(error: string): void {
    const errorMessage: TMessage = {
      id: uuid(),
      conversation_id: this.id,
      type: 'tips',
      position: 'center',
      createdAt: Date.now(),
      content: {
        content: error,
        type: 'error',
      },
    };

    this.emitMessage(errorMessage);
  }

  private extractThoughtSubject(content: string): string {
    const lines = content.split('\n');
    const firstLine = lines[0].trim();

    // Try to extract subject from **Subject** format
    const subjectMatch = firstLine.match(/^\*\*(.+?)\*\*$/);
    if (subjectMatch) {
      return subjectMatch[1];
    }

    // Use first line as subject if it looks like a title
    if (firstLine.length < 80 && !firstLine.endsWith('.')) {
      return firstLine;
    }

    // Extract first sentence as subject
    const firstSentence = content.split('.')[0];
    if (firstSentence.length < 100) {
      return firstSentence;
    }

    return 'Thinking';
  }

  private emitMessage(message: TMessage): void {
    // Create response message based on the message type, following GeminiAgentTask pattern
    const responseMessage: IResponseMessage = {
      type: '', // Will be set in switch statement
      data: null, // Will be set in switch statement
      conversation_id: this.id,
      msg_id: message.msg_id || message.id, // 使用消息自己的 msg_id
    };

    // Map TMessage types to backend response types
    switch (message.type) {
      case 'text':
        this.turnHasContent = true;
        responseMessage.type = 'content';
        responseMessage.data = message.content.content;
        break;
      case 'agent_status':
        responseMessage.type = 'agent_status';
        responseMessage.data = message.content;
        break;
      case 'acp_permission':
        responseMessage.type = 'acp_permission';
        responseMessage.data = message.content;
        break;
      case 'tips':
        // Distinguish between thought messages and error messages
        if (message.content.type === 'warning' && message.position === 'center') {
          this.turnHasThought = true;
          const subject = this.extractThoughtSubject(message.content.content);
          responseMessage.type = 'thought';
          responseMessage.data = {
            subject,
            description: message.content.content,
          };
        } else {
          responseMessage.type = 'error';
          responseMessage.data = message.content.content;
        }
        break;
      case 'acp_tool_call': {
        responseMessage.type = 'acp_tool_call';
        responseMessage.data = message.content;
        break;
      }
      case 'plan':
        responseMessage.type = 'plan';
        responseMessage.data = message.content;
        break;
      // Disabled: available_commands messages are too noisy and distracting in the chat UI
      case 'available_commands':
        return;
      default:
        responseMessage.type = 'content';
        responseMessage.data = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    }
    this.onStreamEvent(responseMessage);
  }

  postMessagePromise(action: string, data: unknown): Promise<AcpResult | void> {
    switch (action) {
      case 'send.message':
        return this.sendMessage(data as { content: string; files?: string[]; msg_id?: string });
      default:
        return Promise.reject(new Error(`Unknown action: ${action}`));
    }
  }

  get isConnected(): boolean {
    return this.connection.isConnected;
  }

  get hasActiveSession(): boolean {
    return this.connection.hasActiveSession;
  }

  /**
   * Get the current ACP session ID (for session resume support).
   * 获取当前 ACP session ID（用于会话恢复支持）。
   */
  get currentSessionId(): string | null {
    return this.connection.currentSessionId;
  }

  /**
   * Create a new session or resume an existing one, and notify upper layer if session ID changed.
   * 创建新会话或恢复现有会话，如果 session ID 变化则通知上层。
   *
   * Resume strategy is delegated to AcpConnection.resumeSession()
   * (capability-driven with Claude-compatible resume path).
   */
  private async createOrResumeSession(): Promise<void> {
    const resumeSessionId = this.extra.acpSessionId;
    const resumeConversationId = this.extra.acpSessionConversationId;
    const mcpServers = await this.loadBuiltinSessionMcpServers();

    // Derive teamId from injected team MCP server name (format: aionui-team-<teamId>)
    // Only emit MCP status events when running inside a team session.
    const teamMcpName = this.extra.teamMcpStdioConfig?.name;
    const teamId = teamMcpName?.startsWith('aionui-team-') ? teamMcpName.slice('aionui-team-'.length) : undefined;
    const slotId = this.id;

    const emitMcpStatus = teamId
      ? (phase: import('@/common/types/teamTypes').TeamMcpPhase, extra?: { serverCount?: number; error?: string }) => {
          ipcBridge.team.mcpStatus.emit({ teamId: teamId!, slotId, phase, ...extra });
        }
      : null;

    const doSession = async (): Promise<void> => {
      // Validate session ownership: only resume if the stored session belongs to this conversation.
      if (resumeSessionId && resumeConversationId && resumeConversationId !== this.id) {
        console.warn(
          `[AcpAgent] Session ${resumeSessionId} belongs to conversation ${resumeConversationId}, ` +
            `but current conversation is ${this.id}. Discarding stale session and starting fresh.`
        );
        // Skip resume, fall through to create new session
      } else if (resumeSessionId) {
        try {
          let response: { sessionId?: string };

          emitMcpStatus?.('session_injecting', { serverCount: mcpServers.length });
          response = await this.connection.resumeSession(resumeSessionId, this.extra.workspace, {
            forkSession: false,
            mcpServers,
          });

          if (mcpServers.length === 0) {
            emitMcpStatus?.('degraded');
          } else {
            emitMcpStatus?.('session_ready', { serverCount: mcpServers.length });
          }

          if (response.sessionId && response.sessionId !== resumeSessionId) {
            this.extra.acpSessionId = response.sessionId;
            this.onSessionIdUpdate?.(response.sessionId);
          }
          return;
        } catch (resumeError) {
          const error = resumeError instanceof Error ? resumeError.message : String(resumeError);
          console.warn(`[AcpAgent] Failed to resume session ${resumeSessionId}, creating fresh session:`, error);
          emitMcpStatus?.('session_error', { error });
        }
      }

      // No stored session or resume failed — create a brand new session
      emitMcpStatus?.('session_injecting', { serverCount: mcpServers.length });
      const response = await this.connection.newSession(this.extra.workspace, { mcpServers });

      if (mcpServers.length === 0) {
        emitMcpStatus?.('degraded');
      } else {
        emitMcpStatus?.('session_ready', { serverCount: mcpServers.length });
      }

      if (response.sessionId) {
        this.extra.acpSessionId = response.sessionId;
        this.onSessionIdUpdate?.(response.sessionId);
      }
    };

    try {
      await doSession();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      emitMcpStatus?.('session_error', { error });
      throw err;
    }

    // Wait for MCP tools to be registered in the backend before allowing
    // message dispatch. The team-mcp-stdio.js script sends a TCP mcp_ready
    // notification after server.connect() completes. Without this wait,
    // the first conversationTurn/start may arrive before the backend has
    // finished the MCP handshake (initialize → tools/list), causing the
    // agent to process the message without team tools.
    if (this.extra.teamMcpStdioConfig && teamId) {
      emitMcpStatus?.('mcp_tools_waiting');
      await waitForMcpReady(slotId, 30_000);
      emitMcpStatus?.('mcp_tools_ready');
    }
  }

  private async loadBuiltinSessionMcpServers(): Promise<AcpSessionMcpServer[]> {
    try {
      const mcpConfig = await ProcessConfig.get('mcp.config');
      const servers: AcpSessionMcpServer[] = [];

      if (Array.isArray(mcpConfig) && mcpConfig.length > 0) {
        const mcpCaps = this.connection.getAgentCapabilities()?.mcpCapabilities;
        if (mcpCaps) {
          servers.push(...buildBuiltinAcpSessionMcpServers(mcpConfig as IMcpServer[], mcpCaps));
        }
      }

      // Inject team MCP server if this agent belongs to a team (stdio mode)
      const teamServer = buildTeamMcpServer(this.extra.teamMcpStdioConfig);
      if (teamServer) {
        servers.push(teamServer);
      }

      // Inject Aion team-guide MCP server for solo agents (not in team mode already).
      // Uses stdio bridge mode — same pattern as TeamMcpServer.
      // AION_MCP_BACKEND env var tells the stdio bridge which backend this agent is,
      // so aion_create_team automatically creates a team with the correct agent type.
      if (!this.extra.teamMcpStdioConfig && (await shouldInjectTeamGuideMcp(this.extra.backend))) {
        const aionStdioConfig = getTeamGuideStdioConfig();
        if (aionStdioConfig) {
          const configWithBackend = {
            ...aionStdioConfig,
            env: [
              ...aionStdioConfig.env,
              { name: 'AION_MCP_BACKEND', value: this.extra.backend },
              { name: 'AION_MCP_CONVERSATION_ID', value: this.id },
            ],
          };
          servers.push(buildTeamMcpServer(configWithBackend)!);
        }
      }

      return servers;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[ACP ${this.extra.backend}] Failed to load built-in MCP config for session/new:`, errMsg);
      const mcpName = this.extra.teamMcpStdioConfig?.name;
      const tId =
        typeof mcpName === 'string' && mcpName.startsWith('aionui-team-')
          ? mcpName.slice('aionui-team-'.length)
          : undefined;
      if (tId) {
        ipcBridge.team.mcpStatus.emit({ teamId: tId, slotId: this.id, phase: 'load_failed', error: errMsg });
      }
      return [];
    }
  }

  /**
   * Set the session mode for this agent (e.g., plan, default, bypassPermissions, yolo).
   * 设置此代理的会话模式（如 plan、default、bypassPermissions、yolo）。
   *
   * @param mode - The mode ID to set
   * @returns Promise that resolves when mode is set
   */
  async setMode(mode: string): Promise<{ success: boolean; error?: string }> {
    if (!this.connection.isConnected || !this.connection.hasActiveSession) {
      // No live session — persist the mode so it takes effect on next session start.
      // AcpAgentManager reads extra.sessionMode during startSession().
      this.extra.sessionMode = mode;
      return { success: true };
    }
    try {
      await this.connection.setSessionMode(mode);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[AcpAgent] Failed to set mode:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  private async ensureBackendAuth(backend: AcpBackend, loginArg: string): Promise<void> {
    try {
      this.emitStatusMessage('connecting');

      // 使用配置的 CLI 路径调用 login 命令
      if (!this.extra.cliPath) {
        throw new Error(`No CLI path configured for ${backend} backend`);
      }

      // 使用与 AcpConnection 相同的命令解析逻辑
      const cleanEnv = getEnhancedEnv();
      let command: string;
      let args: string[];

      if (this.extra.cliPath.startsWith('npx ')) {
        // Route legacy npx launchers through bundled bun.
        const parts = this.extra.cliPath.split(' ');
        command = resolveNpxPath(cleanEnv);
        args = ['x', '--bun', ...normalizeNpxArgsForBundledBun(parts.slice(1)), loginArg];
      } else {
        // For regular paths like '/usr/local/bin/qwen' or '/usr/local/bin/claude'
        command = this.extra.cliPath;
        args = [loginArg];
      }

      const loginProcess = spawn(command, args, {
        stdio: 'pipe',
        timeout: 70000,
        env: cleanEnv,
      });

      await new Promise<void>((resolve, reject) => {
        loginProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`${backend} login failed with code ${code}`));
          }
        });

        loginProcess.on('error', reject);
      });
    } catch (error) {
      console.warn(`${backend} auth refresh failed, will try to connect anyway:`, error);
      // 不抛出错误，让连接尝试继续
    }
  }

  private async ensureQwenAuth(): Promise<void> {
    if (this.extra.backend !== 'qwen') return;
    await this.ensureBackendAuth('qwen', 'login');
  }

  private async ensureClaudeAuth(): Promise<void> {
    if (this.extra.backend !== 'claude') return;
    await this.ensureBackendAuth('claude', '/login');
  }

  private async performAuthentication(): Promise<void> {
    try {
      const initResult = this.connection.getInitializeResult();
      if (!initResult || initResult.authMethods.length === 0) {
        // No auth methods available - CLI should handle authentication itself
        this.emitStatusMessage('authenticated');
        return;
      }

      // 先尝试直接创建session以判断是否已鉴权（同时尝试恢复已有会话）
      // Try to create/resume session to check if already authenticated
      try {
        await this.createOrResumeSession();
        this.emitStatusMessage('authenticated');
        return;
      } catch (_err) {
        // 需要鉴权，进行条件化"预热"尝试
      }

      // 条件化预热：仅在需要鉴权时尝试调用后端CLI登录以刷新token
      if (this.extra.backend === 'qwen') {
        await this.ensureQwenAuth();
      } else if (this.extra.backend === 'claude') {
        await this.ensureClaudeAuth();
      }
      // Note: CodeBuddy does not have a CLI login command; auth is handled by the CLI itself

      // 预热后重试创建session（同时尝试恢复会话）
      // Retry creating/resuming session after warmup
      try {
        await this.createOrResumeSession();
        this.emitStatusMessage('authenticated');
        return;
      } catch (error) {
        // If still failing, guide user to login manually
        // 如果仍然失败，引导用户手动登录
        this.emitStatusMessage('error');
      }
    } catch (error) {
      this.emitStatusMessage('error');
    }
  }

  private async cacheInitializeResult(): Promise<void> {
    const result = this.connection.getInitializeResult();
    if (!result) return;
    const cached = (await ProcessConfig.get('acp.cachedInitializeResult')) || {};
    await ProcessConfig.set('acp.cachedInitializeResult', {
      ...cached,
      [this.extra.backend]: result,
    });
  }

  /**
   * Read the cached initialize result for a backend from disk.
   * Available before any session is created (persisted from previous runs).
   */
  static async getCachedInitializeResult(backend: string): Promise<AcpInitializeResult | null> {
    const cached = await ProcessConfig.get('acp.cachedInitializeResult');
    return cached?.[backend] ?? null;
  }

  // Serialize concurrent cache writes to prevent read-modify-write races
  // when multiple backends start simultaneously.
  private static cacheQueue: Promise<void> = Promise.resolve();

  /**
   * Cache session-level capabilities (models, configOptions, modes) to disk.
   * Same pattern as cacheInitializeResult — persisted across sessions so
   * Guid page / AgentModeSelector / AcpConfigSelector can render from cache
   * before an active session exists.
   *
   * Accepts a pre-captured snapshot to avoid reading stale connection state —
   * streaming notifications (config_option_update) can modify the connection's
   * configOptions between when the snapshot is taken and when this runs.
   *
   * Uses a static queue to serialize writes — multiple backends starting
   * concurrently would otherwise overwrite each other's cache entries.
   */
  private cacheSessionCapabilities(snapshot: {
    modelInfo: AcpModelInfo | null;
    configOptions: AcpSessionConfigOption[] | null;
    modes: AcpSessionModes | null;
  }): Promise<void> {
    const job = AcpAgent.cacheQueue.then(() => this.doCacheSessionCapabilities(snapshot));
    AcpAgent.cacheQueue = job.catch(() => {});
    return job;
  }

  private async doCacheSessionCapabilities(snapshot: {
    modelInfo: AcpModelInfo | null;
    configOptions: AcpSessionConfigOption[] | null;
    modes: AcpSessionModes | null;
  }): Promise<void> {
    // Cache model info
    if (snapshot.modelInfo && snapshot.modelInfo.availableModels?.length > 0) {
      const cachedModels = (await ProcessConfig.get('acp.cachedModels')) || {};
      // Preserve the original default model from the first session, not from user switches
      const existing = cachedModels[this.extra.backend];
      const nextModelInfo = {
        ...snapshot.modelInfo,
        currentModelId: existing?.currentModelId ?? snapshot.modelInfo.currentModelId,
        currentModelLabel: existing?.currentModelLabel ?? snapshot.modelInfo.currentModelLabel,
      };
      await ProcessConfig.set('acp.cachedModels', {
        ...cachedModels,
        [this.extra.backend]: nextModelInfo,
      });
    }

    // Cache configOptions (for backends that provide them, e.g. codex)
    if (Array.isArray(snapshot.configOptions) && snapshot.configOptions.length > 0) {
      const cachedOptions = (await ProcessConfig.get('acp.cachedConfigOptions')) || {};
      await ProcessConfig.set('acp.cachedConfigOptions', {
        ...cachedOptions,
        [this.extra.backend]: snapshot.configOptions,
      });
    }

    // Cache top-level modes (for backends that use modes object, e.g. qoder, opencode)
    if (snapshot.modes?.availableModes && snapshot.modes.availableModes.length > 0) {
      const cachedModes = (await ProcessConfig.get('acp.cachedModes')) || {};
      await ProcessConfig.set('acp.cachedModes', {
        ...cachedModes,
        [this.extra.backend]: snapshot.modes,
      });
    }
  }

  /**
   * Read the cached config options for a backend from disk.
   * Available before any session is created (persisted from previous runs).
   */
  static async getCachedConfigOptions(backend: string): Promise<AcpSessionConfigOption[] | null> {
    const cached = await ProcessConfig.get('acp.cachedConfigOptions');
    const options = cached?.[backend];
    return Array.isArray(options) ? options : null;
  }
}
