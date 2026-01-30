/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/core/ConfigManager.ts
import { AIONUI_FILES_MARKER } from '@/common/constants';
import { NavigationInterceptor } from '@/common/navigation';
import type { TProviderWithModel } from '@/common/storage';
import { uuid } from '@/common/utils';
import { getProviderAuthType } from '@/common/utils/platformAuthType';
import type { CompletedToolCall, Config, GeminiClient, ServerGeminiStreamEvent, ToolCall, ToolCallRequestInfo, Turn } from '@office-ai/aioncli-core';
import { AuthType, CoreToolScheduler, FileDiscoveryService, sessionId, refreshServerHierarchicalMemory, clearOauthClientCache } from '@office-ai/aioncli-core';
import { ApiKeyManager } from '../../common/ApiKeyManager';
import { handleAtCommand } from './cli/atCommandProcessor';
import { loadCliConfig } from './cli/config';
import { loadExtensions } from './cli/extension';
import type { Settings } from './cli/settings';
import { loadSettings } from './cli/settings';
import { ConversationToolConfig } from './cli/tools/conversation-tool-config';
import { mapToDisplay, type TrackedToolCall } from './cli/useReactToolScheduler';
import { getPromptCount, handleCompletedTools, processGeminiStreamEvents, startNewPrompt } from './utils';
import { globalToolCallGuard, type StreamConnectionEvent } from './cli/streamResilience';
import { getGlobalTokenManager } from './cli/oauthTokenManager';
import fs from 'fs';

// Global registry for current agent instance (used by flashFallbackHandler)
let currentGeminiAgent: GeminiAgent | null = null;

interface GeminiAgent2Options {
  workspace: string;
  proxy?: string;
  model: TProviderWithModel;
  imageGenerationModel?: TProviderWithModel;
  webSearchEngine?: 'google' | 'default';
  yoloMode?: boolean;
  GOOGLE_CLOUD_PROJECT?: string;
  mcpServers?: Record<string, unknown>;
  contextFileName?: string;
  onStreamEvent: (event: { type: string; data: unknown; msg_id: string }) => void;
  // 系统规则，在初始化时注入到 userMemory / System rules, injected into userMemory at initialization
  presetRules?: string;
  contextContent?: string; // 向后兼容 / Backward compatible
  /** 内置 skills 目录路径，使用 aioncli-core SkillManager 加载 / Builtin skills directory path, loaded by aioncli-core SkillManager */
  skillsDir?: string;
  /** 启用的 skills 列表，用于过滤 SkillManager 中的 skills / Enabled skills list for filtering skills in SkillManager */
  enabledSkills?: string[];
}

export class GeminiAgent {
  config: Config | null = null;
  private workspace: string | null = null;
  private proxy: string | null = null;
  private model: TProviderWithModel | null = null;
  private imageGenerationModel: TProviderWithModel | null = null;
  private webSearchEngine: 'google' | 'default' | null = null;
  private yoloMode: boolean = false;
  private googleCloudProject: string | null = null;
  private mcpServers: Record<string, unknown> = {};
  private geminiClient: GeminiClient | null = null;
  private authType: AuthType | null = null;
  private scheduler: CoreToolScheduler | null = null;
  private trackedCalls: TrackedToolCall[] = [];
  private abortController: AbortController | null = null;
  private activeMsgId: string | null = null;
  private onStreamEvent: (event: { type: string; data: unknown; msg_id: string }) => void;
  // 系统规则，在初始化时注入 / System rules, injected at initialization
  private presetRules?: string;
  private contextContent?: string; // 向后兼容 / Backward compatible
  private toolConfig: ConversationToolConfig; // 对话级别的工具配置
  private apiKeyManager: ApiKeyManager | null = null; // 多API Key管理器
  private settings: Settings | null = null;
  private historyPrefix: string | null = null;
  private historyUsedOnce = false;
  private skillsIndexPrependedOnce = false; // Track if we've prepended skills index to first message
  private contextFileName: string | undefined;
  /** 内置 skills 目录路径 / Builtin skills directory path */
  private skillsDir?: string;
  /** 启用的 skills 列表 / Enabled skills list */
  private enabledSkills?: string[];
  bootstrap: Promise<void>;
  static buildFileServer(workspace: string) {
    return new FileDiscoveryService(workspace);
  }
  constructor(options: GeminiAgent2Options) {
    this.workspace = options.workspace;
    this.proxy = options.proxy;
    this.model = options.model;
    this.imageGenerationModel = options.imageGenerationModel;
    this.webSearchEngine = options.webSearchEngine || 'default';
    this.yoloMode = options.yoloMode || false;
    this.googleCloudProject = options.GOOGLE_CLOUD_PROJECT;
    this.mcpServers = options.mcpServers || {};
    this.contextFileName = options.contextFileName;
    // 使用统一的工具函数获取认证类型
    this.authType = getProviderAuthType(options.model);
    this.onStreamEvent = options.onStreamEvent;
    this.presetRules = options.presetRules;
    this.skillsDir = options.skillsDir;
    this.enabledSkills = options.enabledSkills;
    // 向后兼容：优先使用 presetRules，其次 contextContent / Backward compatible: prefer presetRules, fallback to contextContent
    this.contextContent = options.contextContent || options.presetRules;
    this.initClientEnv();
    this.toolConfig = new ConversationToolConfig({
      proxy: this.proxy,
      imageGenerationModel: this.imageGenerationModel,
      webSearchEngine: this.webSearchEngine,
    });

    // Register as current agent for flashFallbackHandler access
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    currentGeminiAgent = this;

    this.bootstrap = this.initialize();
  }

  private initClientEnv() {
    const fallbackValue = (key: string, value1: string, value2?: string) => {
      if (value1 && value1 !== 'undefined') {
        process.env[key] = value1;
      }
      if (value2 && value2 !== 'undefined') {
        process.env[key] = value2;
      }
    };

    // Initialize multi-key manager for supported auth types
    this.initializeMultiKeySupport();

    // Get the current API key to use (either from multi-key manager or original)
    const getCurrentApiKey = () => {
      if (this.apiKeyManager && this.apiKeyManager.hasMultipleKeys()) {
        return process.env[this.apiKeyManager.getStatus().envKey] || this.model.apiKey;
      }
      return this.model.apiKey;
    };

    // 清除所有认证相关的环境变量，避免不同认证类型之间的干扰
    // Clear all auth-related env vars to avoid interference between different auth types
    const clearAllAuthEnvVars = () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_GEMINI_BASE_URL;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.OPENAI_BASE_URL;
      delete process.env.OPENAI_API_KEY;
    };

    clearAllAuthEnvVars();

    if (this.authType === AuthType.USE_GEMINI) {
      fallbackValue('GEMINI_API_KEY', getCurrentApiKey());
      fallbackValue('GOOGLE_GEMINI_BASE_URL', this.model.baseUrl);
      return;
    }
    if (this.authType === AuthType.USE_VERTEX_AI) {
      fallbackValue('GOOGLE_API_KEY', getCurrentApiKey());
      process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
      return;
    }
    if (this.authType === AuthType.LOGIN_WITH_GOOGLE) {
      // 对于个人 OAuth 认证，不需要 GOOGLE_CLOUD_PROJECT
      // 如果用户配置了无效的项目 ID，会导致 403 权限错误
      // For personal OAuth auth, GOOGLE_CLOUD_PROJECT is not needed
      // Invalid project ID will cause 403 permission error
      // 只有当用户明确配置了有效的项目 ID 时才设置
      // Only set if user explicitly configured a valid project ID
      if (this.googleCloudProject && this.googleCloudProject.trim()) {
        process.env.GOOGLE_CLOUD_PROJECT = this.googleCloudProject.trim();
      }
      // 注意：LOGIN_WITH_GOOGLE 使用 OAuth，不需要设置任何 API Key
      // Note: LOGIN_WITH_GOOGLE uses OAuth, no API Key needed
      return;
    }
    if (this.authType === AuthType.USE_OPENAI) {
      fallbackValue('OPENAI_BASE_URL', this.model.baseUrl);
      fallbackValue('OPENAI_API_KEY', getCurrentApiKey());
      return;
    }
    if (this.authType === AuthType.USE_ANTHROPIC) {
      fallbackValue('ANTHROPIC_BASE_URL', this.model.baseUrl);
      fallbackValue('ANTHROPIC_API_KEY', getCurrentApiKey());
    }
  }

  private initializeMultiKeySupport(): void {
    const apiKey = this.model?.apiKey;
    if (!apiKey || (!apiKey.includes(',') && !apiKey.includes('\n'))) {
      return; // Single key or no key, skip multi-key setup
    }

    // Only initialize for supported auth types
    if (this.authType === AuthType.USE_OPENAI || this.authType === AuthType.USE_GEMINI || this.authType === AuthType.USE_ANTHROPIC) {
      this.apiKeyManager = new ApiKeyManager(apiKey, this.authType);
    }
  }

  /**
   * Get multi-key manager (used by flashFallbackHandler)
   */
  getApiKeyManager(): ApiKeyManager | null {
    return this.apiKeyManager;
  }

  private createAbortController() {
    this.abortController = new AbortController();
    return this.abortController;
  }

  private enrichErrorMessage(errorMessage: string): string {
    const reportMatch = errorMessage.match(/Full report available at:\s*(.+?\.json)/i);
    const lowerMessage = errorMessage.toLowerCase();
    if (lowerMessage.includes('model_capacity_exhausted') || lowerMessage.includes('no capacity available') || lowerMessage.includes('resource_exhausted') || lowerMessage.includes('ratelimitexceeded')) {
      return `${errorMessage}\nQuota exhausted on this model.`;
    }
    if (!reportMatch?.[1]) return errorMessage;
    try {
      const reportContent = fs.readFileSync(reportMatch[1], 'utf-8');
      const reportLower = reportContent.toLowerCase();
      if (reportLower.includes('quota') || reportLower.includes('resource_exhausted') || reportLower.includes('exhausted')) {
        return `${errorMessage}\nQuota exhausted on this model.`;
      }
    } catch {
      // Ignore report read errors and keep original message.
    }
    return errorMessage;
  }

  private async initialize(): Promise<void> {
    const path = this.workspace;

    const settings = loadSettings(path).merged;
    if (this.contextFileName) {
      settings.contextFileName = this.contextFileName;
    }
    this.settings = settings;

    // 使用传入的 YOLO 设置
    const yoloMode = this.yoloMode;

    // 初始化对话级别的工具配置
    await this.toolConfig.initializeForConversation(this.authType!);

    const extensions = loadExtensions(path);
    this.config = await loadCliConfig({
      workspace: path,
      settings,
      extensions,
      sessionId,
      proxy: this.proxy,
      model: this.model.useModel,
      conversationToolConfig: this.toolConfig,
      yoloMode,
      mcpServers: this.mcpServers,
      skillsDir: this.skillsDir,
      enabledSkills: this.enabledSkills,
    });
    await this.config.initialize();

    // aioncli-core 的 SkillManager.discoverSkills() 会重新从用户 skills 目录加载所有 skills
    // 覆盖了 loadCliConfig 中的过滤，需要在这里重新应用 enabledSkills 过滤
    // aioncli-core's SkillManager.discoverSkills() reloads all skills from user directory,
    // overriding our filtering in loadCliConfig, so we need to re-apply enabledSkills filter here
    if (this.enabledSkills && this.enabledSkills.length > 0) {
      const enabledSet = new Set(this.enabledSkills);
      this.config.getSkillManager().filterSkills((skill) => enabledSet.has(skill.name));
      console.log(`[GeminiAgent] Filtered skills after initialize: ${this.enabledSkills.join(', ')}`);
    }

    // 对于 Google OAuth 认证，清除缓存的 OAuth 客户端以确保使用最新凭证
    // For Google OAuth auth, clear cached OAuth client to ensure fresh credentials
    if (this.authType === AuthType.LOGIN_WITH_GOOGLE) {
      clearOauthClientCache();
    }

    await this.config.refreshAuth(this.authType || AuthType.USE_GEMINI);

    this.geminiClient = this.config.getGeminiClient();

    // 在初始化时注入 presetRules 到 userMemory
    // Inject presetRules into userMemory at initialization
    // Rules 定义系统行为规则，在会话开始时就应该生效
    // Rules define system behavior, should be effective from session start
    if (this.presetRules) {
      const currentMemory = this.config.getUserMemory();
      const rulesSection = `[Assistant System Rules]\n${this.presetRules}`;
      const combined = currentMemory ? `${rulesSection}\n\n${currentMemory}` : rulesSection;
      this.config.setUserMemory(combined);
    }

    // Note: Skills (技能定义) are prepended to the first message in send() method
    // Skills provide capabilities/tools descriptions, injected at runtime
    // 注意：Skills 在 send() 方法中 prepend 到第一条消息
    // Skills 提供能力/工具描述，在运行时注入

    // 注册对话级别的自定义工具
    await this.toolConfig.registerCustomTools(this.config, this.geminiClient);

    this.initToolScheduler(settings);
  }

  // 初始化调度工具
  private initToolScheduler(_settings: Settings) {
    this.scheduler = new CoreToolScheduler({
      onAllToolCallsComplete: async (completedToolCalls: CompletedToolCall[]) => {
        await Promise.resolve(); // Satisfy async requirement
        try {
          if (completedToolCalls.length > 0) {
            const refreshMemory = async () => {
              // 直接使用 aioncli-core 提供的 refreshServerHierarchicalMemory
              // Directly use refreshServerHierarchicalMemory from aioncli-core
              // 它会自动从 config 获取 ExtensionLoader 并更新 memory
              // It automatically gets ExtensionLoader from config and updates memory
              await refreshServerHierarchicalMemory(this.config);
            };
            const response = handleCompletedTools(completedToolCalls, this.geminiClient, refreshMemory);
            if (response.length > 0) {
              const geminiTools = completedToolCalls.filter((tc) => {
                const isTerminalState = tc.status === 'success' || tc.status === 'error' || tc.status === 'cancelled';

                if (isTerminalState) {
                  const completedOrCancelledCall = tc;
                  return completedOrCancelledCall.response?.responseParts !== undefined && !tc.request.isClientInitiated;
                }
                return false;
              });

              this.submitQuery(response, this.activeMsgId ?? uuid(), this.createAbortController(), {
                isContinuation: true,
                prompt_id: geminiTools[0].request.prompt_id,
              });
            }
          }
        } catch (e) {
          this.onStreamEvent({
            type: 'error',
            data: 'handleCompletedTools error: ' + (e.message || JSON.stringify(e)),
            msg_id: this.activeMsgId ?? uuid(),
          });
        }
      },
      onToolCallsUpdate: (updatedCoreToolCalls: ToolCall[]) => {
        try {
          const prevTrackedCalls = this.trackedCalls || [];
          const toolCalls: TrackedToolCall[] = updatedCoreToolCalls.map((coreTc) => {
            const existingTrackedCall = prevTrackedCalls.find((ptc) => ptc.request.callId === coreTc.request.callId);
            const newTrackedCall: TrackedToolCall = {
              ...coreTc,
              responseSubmittedToGemini: existingTrackedCall?.responseSubmittedToGemini ?? false,
            };
            return newTrackedCall;
          });
          const display = mapToDisplay(toolCalls);
          this.onStreamEvent({
            type: 'tool_group',
            data: display.tools,
            msg_id: this.activeMsgId ?? uuid(),
          });
        } catch (e) {
          this.onStreamEvent({
            type: 'error',
            data: 'tool_calls_update error: ' + (e.message || JSON.stringify(e)),
            msg_id: this.activeMsgId ?? uuid(),
          });
        }
      },
      // onEditorClose 回调在 aioncli-core v0.18.4 中已移除 / callback was removed in aioncli-core v0.18.4
      // approvalMode: this.config.getApprovalMode(),
      getPreferredEditor() {
        return 'vscode';
      },
      config: this.config,
    });
  }

  /**
   * 处理消息流（带弹性监控和自动重试）
   * Handle message stream with resilience monitoring and automatic retry
   *
   * @param query - 原始查询（用于重试）/ Original query (for retry)
   * @param stream - 消息流 / Message stream
   * @param msg_id - 消息 ID / Message ID
   * @param abortController - 中止控制器 / Abort controller
   * @param retryCount - 当前重试次数 / Current retry count
   */
  private handleMessage(stream: AsyncGenerator<ServerGeminiStreamEvent, Turn, unknown>, msg_id: string, abortController: AbortController, query?: unknown, retryCount: number = 0): Promise<void> {
    const MAX_INVALID_STREAM_RETRIES = 2; // 最多重试 2 次 / Max 2 retries
    const RETRY_DELAY_MS = 1000; // 重试延迟 1 秒 / 1 second retry delay

    const toolCallRequests: ToolCallRequestInfo[] = [];
    let heartbeatWarned = false;
    let invalidStreamDetected = false;

    // 流连接事件处理
    // Stream connection event handler
    const onConnectionEvent = (event: StreamConnectionEvent) => {
      if (event.type === 'heartbeat_timeout') {
        console.warn(`[GeminiAgent] Stream heartbeat timeout at ${new Date(event.lastEventTime).toISOString()}`);
        if (!heartbeatWarned) {
          heartbeatWarned = true;
        }
      } else if (event.type === 'state_change' && event.state === 'failed') {
        console.error(`[GeminiAgent] Stream connection failed: ${event.reason}`);
        this.onStreamEvent({
          type: 'error',
          data: `Connection lost: ${event.reason}. Please try again.`,
          msg_id,
        });
      }
    };

    return processGeminiStreamEvents(
      stream,
      this.config,
      (data) => {
        if (data.type === 'tool_call_request') {
          const toolRequest = data.data as ToolCallRequestInfo;
          toolCallRequests.push(toolRequest);
          // 立即保护工具调用，防止被取消
          // Immediately protect tool call to prevent cancellation
          globalToolCallGuard.protect(toolRequest.callId);
          return;
        }

        // 检测 invalid_stream 事件
        // Detect invalid_stream event
        if (data.type === ('invalid_stream' as string)) {
          invalidStreamDetected = true;
          const eventData = data.data as { message: string; retryable: boolean };
          if (eventData.retryable && retryCount < MAX_INVALID_STREAM_RETRIES && query && !abortController.signal.aborted) {
            console.warn(`[GeminiAgent] Invalid stream detected, will retry (attempt ${retryCount + 1}/${MAX_INVALID_STREAM_RETRIES})`);
            // 向用户显示重试提示
            // Show retry hint to user
            this.onStreamEvent({
              type: 'info',
              data: `Stream interrupted, retrying... (${retryCount + 1}/${MAX_INVALID_STREAM_RETRIES})`,
              msg_id,
            });
          }
          return;
        }

        this.onStreamEvent({
          ...data,
          msg_id,
        });
      },
      { onConnectionEvent }
    )
      .then(async () => {
        // 如果检测到 invalid_stream 且可以重试，执行重试
        // If invalid_stream detected and can retry, perform retry
        if (invalidStreamDetected && retryCount < MAX_INVALID_STREAM_RETRIES && query && !abortController.signal.aborted) {
          console.log(`[GeminiAgent] Retrying after invalid stream (attempt ${retryCount + 1})`);

          // 延迟后重试
          // Delay before retry
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

          if (abortController.signal.aborted) {
            return;
          }

          // 重新发送消息
          // Re-send message
          const prompt_id = this.config.getSessionId() + '########' + getPromptCount();
          const newStream = this.geminiClient.sendMessageStream(query, abortController.signal, prompt_id);
          return this.handleMessage(newStream, msg_id, abortController, query, retryCount + 1);
        }

        // 如果检测到 invalid_stream 但无法重试，显示最终错误
        // If invalid_stream detected but can't retry, show final error
        if (invalidStreamDetected && retryCount >= MAX_INVALID_STREAM_RETRIES) {
          this.onStreamEvent({
            type: 'error',
            data: 'Invalid response stream detected after multiple retries. Please try again.',
            msg_id,
          });
          return;
        }

        if (toolCallRequests.length > 0) {
          // Emit preview_open for navigation tools, but don't block execution
          // 对导航工具发送 preview_open 事件，但不阻止执行
          // Agent needs chrome-devtools to fetch web page content
          // Agent 需要 chrome-devtools 来获取网页内容
          this.emitPreviewForNavigationTools(toolCallRequests, msg_id);

          // Schedule ALL tool requests including chrome-devtools
          // 调度所有工具请求，包括 chrome-devtools
          await this.scheduler.schedule(toolCallRequests, abortController.signal);
        }
      })
      .catch((e: unknown) => {
        const rawMessage = e instanceof Error ? e.message : JSON.stringify(e);
        const errorMessage = this.enrichErrorMessage(rawMessage);
        // 清理受保护的工具调用
        // Clean up protected tool calls on error
        for (const req of toolCallRequests) {
          globalToolCallGuard.unprotect(req.callId);
        }
        this.onStreamEvent({
          type: 'error',
          data: errorMessage,
          msg_id,
        });
      });
  }

  /**
   * 检查是否为导航工具调用（支持带MCP前缀和不带前缀的工具名）
   * Check if it's a navigation tool call (supports both with and without MCP prefix)
   *
   * Delegates to NavigationInterceptor for unified logic
   */
  private isNavigationTool(toolName: string): boolean {
    return NavigationInterceptor.isNavigationTool(toolName);
  }

  /**
   * Emit preview_open events for navigation tools without blocking execution
   * 对导航工具发送 preview_open 事件，但不阻止执行
   *
   * Agent needs chrome-devtools to fetch web page content, so we only emit
   * preview events to show URL in preview panel, while letting tools execute normally.
   * Agent 需要 chrome-devtools 来获取网页内容，所以我们只发送预览事件在预览面板中显示 URL，
   * 同时让工具正常执行。
   */
  private emitPreviewForNavigationTools(toolCallRequests: ToolCallRequestInfo[], _msg_id: string): void {
    for (const request of toolCallRequests) {
      const toolName = request.name || '';

      if (this.isNavigationTool(toolName)) {
        const args = request.args || {};
        const url = NavigationInterceptor.extractUrl({ arguments: args as Record<string, unknown> });
        if (url) {
          // Emit preview_open event to show URL in preview panel
          // 发送 preview_open 事件在预览面板中显示 URL
          this.onStreamEvent({
            type: 'preview_open',
            data: {
              content: url,
              contentType: 'url',
              metadata: {
                title: url,
              },
            },
            msg_id: uuid(),
          });
        }
      }
    }
  }

  submitQuery(
    query: unknown,
    msg_id: string,
    abortController: AbortController,
    options?: {
      prompt_id?: string;
      isContinuation?: boolean;
    }
  ): string | undefined {
    try {
      this.activeMsgId = msg_id;
      let prompt_id = options?.prompt_id;
      if (!prompt_id) {
        prompt_id = this.config.getSessionId() + '########' + getPromptCount();
      }
      if (!options?.isContinuation) {
        startNewPrompt();
      }

      const stream = this.geminiClient.sendMessageStream(query, abortController.signal, prompt_id);
      this.onStreamEvent({
        type: 'start',
        data: '',
        msg_id,
      });
      // Pass query to handleMessage for potential retry on invalid stream
      // 将 query 传递给 handleMessage 以便在 invalid stream 时重试
      this.handleMessage(stream, msg_id, abortController, query)
        .catch((e: unknown) => {
          const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
          this.onStreamEvent({
            type: 'error',
            data: errorMessage,
            msg_id,
          });
        })
        .finally(() => {
          this.onStreamEvent({
            type: 'finish',
            data: '',
            msg_id,
          });
        });
      return '';
    } catch (e) {
      const rawMessage = e instanceof Error ? e.message : JSON.stringify(e);
      const errorMessage = this.enrichErrorMessage(rawMessage);
      this.onStreamEvent({
        type: 'error',
        data: errorMessage,
        msg_id,
      });
    }
  }

  async send(message: string | Array<{ text: string }>, msg_id = '', files?: string[]) {
    await this.bootstrap;
    const abortController = this.createAbortController();

    const stripFilesMarker = (text: string): string => {
      const markerIndex = text.indexOf(AIONUI_FILES_MARKER);
      if (markerIndex === -1) return text;
      return text.slice(0, markerIndex).trimEnd();
    };

    if (Array.isArray(message)) {
      if (message[0]?.text) {
        message[0].text = stripFilesMarker(message[0].text);
      }
    } else if (typeof message === 'string') {
      message = stripFilesMarker(message);
    }

    // OAuth Token 预检查（仅对 OAuth 模式生效）
    // Preemptive OAuth Token check (only for OAuth mode)
    if (this.authType === AuthType.LOGIN_WITH_GOOGLE) {
      try {
        const tokenManager = getGlobalTokenManager(this.authType);
        const isTokenValid = await tokenManager.checkAndRefreshIfNeeded();
        if (!isTokenValid) {
          console.warn('[GeminiAgent] OAuth token validation failed, proceeding anyway');
        }
      } catch (tokenError) {
        console.warn('[GeminiAgent] OAuth token check error:', tokenError);
        // 继续执行，让后续流程处理认证错误
      }
    }

    // Prepend one-time history prefix before processing commands
    if (this.historyPrefix && !this.historyUsedOnce) {
      if (Array.isArray(message)) {
        const first = message[0];
        const original = first?.text ?? '';
        message = [{ text: `${this.historyPrefix}${original}` }];
      } else if (typeof message === 'string') {
        message = `${this.historyPrefix}${message}`;
      }
      this.historyUsedOnce = true;
    }

    // Skills 通过 SkillManager 加载，索引已在系统指令中
    // Skills are loaded via SkillManager, index is already in system instruction
    let skillsPrefix = '';

    if (!this.skillsIndexPrependedOnce) {
      // 向后兼容：使用 contextContent 作为助手规则
      // Backward compatible: use contextContent as assistant rules
      if (this.contextContent && !this.presetRules) {
        skillsPrefix = `[Assistant Rules - You MUST follow these instructions]\n${this.contextContent}\n\n`;
      }
      this.skillsIndexPrependedOnce = true;

      // 注入前缀到消息 / Inject prefix into message
      if (skillsPrefix) {
        const prefix = skillsPrefix + '[User Request]\n';
        if (Array.isArray(message)) {
          if (message[0]) message[0].text = prefix + message[0].text;
        } else {
          message = prefix + message;
        }
      }
    }

    // files 参数仅用于复制到工作空间，不向模型传递路径提示

    // Track error messages from @ command processing
    let atCommandError: string | null = null;

    const { processedQuery, shouldProceed } = await handleAtCommand({
      query: Array.isArray(message) ? message[0].text : message,
      config: this.config,
      addItem: (item: unknown) => {
        // Capture error messages from @ command processing
        if (item && typeof item === 'object' && 'type' in item) {
          const typedItem = item as { type: string; text?: string };
          if (typedItem.type === 'error' && typedItem.text) {
            atCommandError = typedItem.text;
          }
        }
      },
      onDebugMessage() {
        // 调试回调留空以避免日志噪声 / Debug hook intentionally left blank to avoid noisy logging
      },
      messageId: Date.now(),
      signal: abortController.signal,
      // 有 files 时启用懒加载：不立即读取文件内容
      // Enable lazy loading only when files are provided
      lazyFileLoading: !!(files && files.length > 0),
    });

    if (!shouldProceed || processedQuery === null || abortController.signal.aborted) {
      // Send error message to user if @ command processing failed
      // 如果 @ 命令处理失败，向用户发送错误消息
      if (atCommandError) {
        this.onStreamEvent({
          type: 'error',
          data: atCommandError,
          msg_id,
        });
      } else if (!abortController.signal.aborted) {
        // Generic error if we don't have specific error message
        this.onStreamEvent({
          type: 'error',
          data: 'Failed to process @ file reference. The file may not exist or is not accessible.',
          msg_id,
        });
      }
      // Send finish event so UI can reset state
      this.onStreamEvent({
        type: 'finish',
        data: null,
        msg_id,
      });
      return;
    }
    const requestId = this.submitQuery(processedQuery, msg_id, abortController);
    return requestId;
  }
  stop(): void {
    this.abortController?.abort();
  }

  async injectConversationHistory(text: string): Promise<void> {
    try {
      if (!this.config || !this.workspace || !this.settings) return;
      // Prepare one-time prefix for first outgoing message after (re)start
      this.historyPrefix = `Conversation history (recent):\n${text}\n\n`;
      this.historyUsedOnce = false;
      // 使用 refreshServerHierarchicalMemory 刷新 memory，然后追加聊天历史
      // Use refreshServerHierarchicalMemory to refresh memory, then append chat history
      const { memoryContent } = await refreshServerHierarchicalMemory(this.config);
      const combined = `${memoryContent}\n\n[Recent Chat]\n${text}`;
      this.config.setUserMemory(combined);
    } catch (e) {
      // ignore injection errors
    }
  }
}

/**
 * Get current GeminiAgent instance (used by flashFallbackHandler)
 */
export function getCurrentGeminiAgent(): GeminiAgent | null {
  return currentGeminiAgent;
}
